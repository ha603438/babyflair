import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import App from '../../App'
import type { Match, Player, Store } from '../../types'

// « Récap du jour » card of the player page, rendered through the App (vitest runs in node, no DOM). Its data and copy
// are unit-tested in src/playerDay.test.ts.

const PLAYERS: Player[] = ['alice', 'bob', 'chloe', 'dan'].map((id) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  isGuest: false,
  createdAt: '2026-01-01T10:00:00.000Z',
}))

function match(seq: number, at: Date, teamA: string[], teamB: string[], scoreA: number, scoreB: number): Match {
  const iso = at.toISOString()
  return { id: `m${seq}`, seq, playedAt: iso, createdAt: iso, updatedAt: iso, target: 5, teamA, teamB, scoreA, scoreB }
}

function renderPlayer(id: string, matches: Match[]): string {
  const store: Store = {
    version: 1,
    players: PLAYERS,
    matches,
    settings: { lastFormat: '2v2', lastTarget: 5 },
    nextSeq: matches.length + 1,
    calls: [],
    callPlayers: [],
  }
  vi.stubGlobal('window', { location: { hash: `#/joueurs/${id}` }, history: { back: vi.fn(), length: 1 } })
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(store), setItem: () => undefined })
  return renderToString(createElement(App))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Player page, « Récap du jour »', () => {
  it('comes right after the hero, with its tiles and lines, for a player who played today', () => {
    const now = new Date()
    const today = (minutes: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, minutes)
    const matches = [
      match(1, today(1), ['alice', 'bob'], ['chloe', 'dan'], 5, 0),
      match(2, today(2), ['alice', 'bob'], ['chloe', 'dan'], 5, 3),
    ]
    const html = renderPlayer('alice', matches)
    const card = html.slice(html.indexOf('<section class="card card-pad day-recap">'))
    expect(card).toContain('<h2 class="tiles-title">Récap du jour</h2>')
    expect(card).toContain('<span class="tile-label">Bilan</span><span class="tile-value t-num">2 V · 0 D</span>')
    expect(card).toContain('<span class="tile-label">2V2 mixte</span>')
    expect(card).toContain('Meilleur partenaire')
    expect(card).toContain('Fanny mis')
    expect(html.indexOf('day-recap')).toBeLessThan(html.indexOf('<svg class="spark"'))
    expect(html.indexOf('class="card card-pad hero"')).toBeLessThan(html.indexOf('day-recap'))
  })

  it('shows his last day otherwise, and nothing without a match', () => {
    const earlier = new Date(2026, 0, 12, 12, 0)
    const html = renderPlayer('chloe', [match(1, earlier, ['alice', 'bob'], ['chloe', 'dan'], 5, 4)])
    expect(html).toContain('<h2 class="tiles-title">Dernière journée · ')
    expect(html).toContain('0 V · 1 D')
    expect(renderPlayer('alice', [])).not.toContain('day-recap')
  })
})
