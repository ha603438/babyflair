import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { rank, replay } from '../../rating'
import type { Match, MatchId, Player, PlayerId, Store } from '../../types'
import { ClassementView } from './ClassementView'
import type { ReplayData, ScreenContext } from './context'

// Classement without « 📈 Courbes » and « 🏅 Hall of Flair » (they live in the Stats tab now): « 🔔 Proposer un
// baby » (shared mode) is the only link left under the context strip. Rendered on the server (node, no DOM).

const NOW = new Date(2026, 9, 15, 12)
const noop = () => {}

const PLAYERS: Player[] = [
  { id: 'alice', name: 'Alice', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'bob', name: 'Bob', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
]

function match(seq: number, scoreA: number, scoreB: number): Match {
  const at = new Date(2026, 9, 14, 12, seq).toISOString()
  const dates = { playedAt: at, createdAt: at, updatedAt: at }
  return { id: `m${seq}`, seq, ...dates, target: 10, teamA: ['alice'], teamB: ['bob'], scoreA, scoreB }
}

const MATCHES: Match[] = [match(1, 10, 4), match(2, 7, 10)]

function contextOf(players: Player[], matches: Match[]): { app: ScreenContext; replay: ReplayData } {
  const store: Store = {
    version: 1,
    players,
    matches,
    settings: { lastFormat: '1v1', lastTarget: 10 },
    nextSeq: matches.length + 1,
    calls: [],
    callPlayers: [],
  }
  const app: ScreenContext = {
    store,
    dispatch: noop,
    toast: { current: null, show: noop, dismiss: noop },
    nav: { get: () => ({}), set: noop, take: () => ({}) },
  }
  const result = replay(players, matches, { now: NOW })
  const data: ReplayData = {
    result,
    ranking: rank(result, players),
    players: new Map<PlayerId, Player>(players.map((player) => [player.id, player])),
    matches: new Map<MatchId, Match>(matches.map((m) => [m.id, m])),
    now: NOW,
  }
  return { app, replay: data }
}

const INSTALLED = { userAgent: 'test', standalone: true, promptAvailable: false, pushSupported: false }

function renderClassement(players: Player[], matches: Match[], onPropose?: () => void): string {
  const { app, replay: data } = contextOf(players, matches)
  return renderToStaticMarkup(createElement(ClassementView, { app, replay: data, installEnv: INSTALLED, onPropose }))
}

describe('Classement links', () => {
  it('keeps « 🔔 Proposer un baby » as the only link, without Courbes nor Hall of Flair', () => {
    const html = renderClassement(PLAYERS, MATCHES, noop)
    const row = html.split('class="content call-propose"')[1]?.split('</div>')[0] ?? ''
    expect(row).toContain('🔔 Je flaire un baby')
    expect(row.match(/class="call-propose__link"/g)).toHaveLength(1)
    expect(html).not.toContain('href="#/courbes"')
    expect(html).not.toContain('href="#/top"')
    expect(html).not.toContain('📈')
    expect(html).not.toContain('🏅')
  })

  it('shows no link row at all in local mode (no « Proposer ») or without any player', () => {
    expect(renderClassement(PLAYERS, MATCHES)).not.toContain('call-propose')
    expect(renderClassement([], [], noop)).not.toContain('call-propose')
  })
})
