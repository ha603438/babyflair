import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import App from '../App'
import { AppStateProvider } from '../store'
import type { Match, Player, Store } from '../types'
import { Courbes } from '../screens/Courbes'

// Server-rendered smoke tests of the Courbes screen and its place in the Stats tab (vitest runs in node, no DOM):
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

/** The checked option of the radiogroup labelled `label` (« Stats » segments or « Classement » selector). */
function checkedIn(html: string, label: string): string | undefined {
  const group = html.split(`aria-label="${label}"`)[1]?.split('</div>')[0] ?? ''
  return /role="radio" aria-checked="true"[^>]*>([^<]*)</.exec(group)?.[1]
}

describe('Courbes in the Stats tab', () => {
  it('is no longer linked from Classement', () => {
    const html = renderApp('#/', storeOf(PLAYERS, MATCHES))
    expect(html).not.toContain('href="#/courbes"')
    expect(html).not.toContain('📈 Courbes')
  })

  it('opens as the « Courbes » segment of the Stats tab: brand header, segments, Stats tab active', () => {
    const html = renderApp('#/courbes', storeOf(PLAYERS, MATCHES))
    expect(html).toContain('>Stats</h1>')
    expect(html).not.toContain('aria-label="Retour"')
    expect(checkedIn(html, 'Stats')).toBe('Courbes')
    for (const label of ['Récap', 'Courbes', 'Hall of Flair']) expect(html).toContain(`>${label}</button>`)
    expect(html.indexOf('stats-tabs')).toBeLessThan(html.indexOf('courbes-mode'))
    const tabs = html.match(/<a [^>]*class="tab[^"]*"[^>]*>/g) ?? []
    expect(tabs[3]).toContain('aria-current="page"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  })

  it('has a compact « Mixte » | « 2V2 » | « 1V1 » selector above the chips, on the remembered ranking', () => {
    const html = render(createElement(Courbes), storeOf(PLAYERS, MATCHES))
    expect(html).toContain('class="content courbes-mode"')
    expect(checkedIn(html, 'Classement')).toBe('Mixte')
    for (const label of ['Mixte', '2V2', '1V1']) expect(html).toContain(`>${label}</button>`)
    expect(html.indexOf('courbes-mode')).toBeLessThan(html.indexOf('curve-chips'))
    const store = storeOf(PLAYERS, MATCHES)
    const duos: Store = { ...store, settings: { ...store.settings, classementTab: '2v2' } }
    expect(checkedIn(render(createElement(Courbes), duos), 'Classement')).toBe('2V2')
  })

  it('keeps the selector above the empty state, so a ranking without matches can be left', () => {
    const html = render(createElement(Courbes), storeOf(PLAYERS, []))
    expect(html).toContain('Pas encore de courbe')
    expect(html).toContain('class="content courbes-mode"')
    expect(html.indexOf('courbes-mode')).toBeLessThan(html.indexOf('Pas encore de courbe'))
  })
})
