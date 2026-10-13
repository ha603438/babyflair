import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import App from '../App'
import { AppStateProvider } from '../store'
import type { Match, Player, Store } from '../types'
import { Courbes } from '../screens/Courbes'

// Server-rendered smoke tests of the Courbes screen and its entry on Classement (vitest runs in node, no DOM):
// interactions are covered by the pure helpers in curves.test.ts and layout.test.ts.

const PLAYERS: Player[] = [
  { id: 'alice', name: 'Alice', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'bob', name: 'Bob', isGuest: false, createdAt: '2026-09-02T10:00:00.000Z' },
  { id: 'chloe', name: 'Chloé', isGuest: true, createdAt: '2026-09-03T10:00:00.000Z' },
  { id: 'dan', name: 'Dan', isGuest: false, createdAt: '2026-09-04T10:00:00.000Z' },
  { id: 'eve', name: 'Eve', isGuest: false, createdAt: '2026-09-05T10:00:00.000Z' },
]

function match(seq: number, playedAt: string, teamA: string[], teamB: string[], scoreA: number, scoreB: number): Match {
  const dates = { playedAt, createdAt: playedAt, updatedAt: playedAt }
  return { id: `m${seq}`, seq, ...dates, target: 10, teamA, teamB, scoreA, scoreB }
}

// Eve never plays: no chip for her.
const MATCHES: Match[] = [
  match(1, '2026-10-12T12:00:00.000Z', ['alice', 'bob'], ['chloe', 'dan'], 10, 8),
  match(2, '2026-10-12T12:30:00.000Z', ['alice'], ['bob'], 10, 4),
  match(3, '2026-10-13T12:00:00.000Z', ['chloe'], ['dan'], 10, 9),
  match(4, '2026-10-13T12:30:00.000Z', ['alice', 'dan'], ['bob', 'chloe'], 6, 10),
]

function storeOf(players: Player[], matches: Match[]): Store {
  return {
    version: 1,
    players,
    matches,
    settings: { lastFormat: '2v2', lastTarget: 10 },
    nextSeq: matches.length + 1,
    calls: [],
    callPlayers: [],
  }
}

function stubEnv(hash: string, store: Store): void {
  vi.stubGlobal('window', { location: { hash }, history: { back: vi.fn() } })
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(store), setItem: () => undefined })
}

function render(element: ReactElement, store: Store): string {
  stubEnv('#/courbes', store)
  return renderToString(createElement(AppStateProvider, null, element))
}

function renderApp(hash: string, store: Store): string {
  stubEnv(hash, store)
  return renderToString(createElement(App))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Courbes screen', () => {
  it('renders one chip per player with matches, the top 3 on, and the chart svg', () => {
    const html = render(createElement(Courbes), storeOf(PLAYERS, MATCHES))
    for (const name of ['Alice', 'Bob', 'Chloé', 'Dan']) {
      expect(html).toContain(`<span class="curve-chip__name">${name}</span>`)
    }
    expect(html).not.toContain('>Eve<')
    expect(html.match(/class="curve-chip is-on series-\d"/g)).toHaveLength(3)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(3)
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1)
    expect(html).toContain('class="curve-chip is-on series-1"')
    expect(html).toContain('>Top 3<')
    expect(html).toContain('>Aucun<')
    expect(html).toContain('<svg class="chart-svg"')
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Évolution du classement de 3 joueurs"')
    expect(html).toContain('viewBox="0 0 343 260"')
    expect(html.match(/class="chart-line"/g)).toHaveLength(3)
    expect(html.match(/class="chart-halo"/g)).toHaveLength(3)
    expect(html).toContain('class="chart-base"')
    expect(html).toContain('12 oct.')
    expect(html).toContain('13 oct.')
    expect(html).toContain('Voir en tableau')
    expect(html).not.toContain('Touche un nom pour afficher sa courbe')
  })

  it('shows an empty state without matches', () => {
    const html = render(createElement(Courbes), storeOf(PLAYERS, []))
    expect(html).toContain('Pas encore de courbe')
    expect(html).not.toContain('<svg class="chart-svg"')
  })
})

describe('Courbes entry and route', () => {
  it('links « 📈 Courbes » from Classement once there is a match', () => {
    const html = renderApp('#/', storeOf(PLAYERS, MATCHES))
    expect(html).toContain('href="#/courbes"')
    expect(html).toContain('📈 Courbes')
    expect(renderApp('#/', storeOf(PLAYERS, []))).not.toContain('href="#/courbes"')
  })

  it('opens as a pushed screen with its title and keeps the Classement tab active', () => {
    const html = renderApp('#/courbes', storeOf(PLAYERS, MATCHES))
    expect(html).toContain('>Évolution du classement</h1>')
    expect(html).toContain('aria-label="Retour"')
    const tabs = html.match(/<a [^>]*class="tab[^"]*"[^>]*>/g) ?? []
    expect(tabs[0]).toContain('aria-current="page"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  })
})
