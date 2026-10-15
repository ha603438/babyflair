import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import App from '../App'
import type { Player, Store } from '../types'

// Server-rendered checks of the players' new home: Réglages › « Joueurs » (« Ajouter un joueur », « Tous les
// joueurs ») and the Joueurs list as a pushed screen (vitest runs in node, no DOM: the App renders a stubbed store).

const PLAYERS: Player[] = [
  { id: 'alice', name: 'Alice', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'bob', name: 'Bob', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'chloe', name: 'Chloé', isGuest: true, createdAt: '2026-09-01T10:00:00.000Z' },
]

function storeOf(players: Player[]): Store {
  return {
    version: 1,
    players,
    matches: [],
    settings: { lastFormat: '2v2', lastTarget: 10 },
    nextSeq: 1,
    calls: [],
    callPlayers: [],
  }
}

function renderApp(hash: string, store: Store): string {
  vi.stubGlobal('window', { location: { hash }, history: { back: vi.fn(), length: 1 } })
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(store), setItem: () => undefined })
  return renderToString(createElement(App))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Réglages › Joueurs', () => {
  it('opens Réglages with a « Joueurs » section first: add a player, then the whole list', () => {
    const html = renderApp('#/reglages', storeOf(PLAYERS))
    expect(html).toContain('<span class="section-header-title">Joueurs</span>')
    expect(html.indexOf('>Joueurs</span>')).toBeLessThan(html.indexOf('>Données</span>'))
    expect(html).toMatch(/<button[^>]*class="row[^"]*row--setting[^"]*"[^>]*>.*?Ajouter un joueur/)
    expect(html).toMatch(/<a class="row[^"]*row--setting[^"]*" href="#\/joueurs">.*?Tous les joueurs/)
    expect(html).toContain('<div class="row-sub">3 joueurs · 1 invité</div>')
    expect(html.indexOf('Ajouter un joueur')).toBeLessThan(html.indexOf('Tous les joueurs'))
  })

  it('has no player count before the first player', () => {
    const html = renderApp('#/reglages', storeOf([]))
    expect(html).toContain('<div class="row-title">Tous les joueurs</div></div>')
  })
})

describe('Joueurs list (#/joueurs)', () => {
  it('still lists every player, each linking to the profile, with « + Ajouter un joueur »', () => {
    const html = renderApp('#/joueurs', storeOf(PLAYERS))
    expect(html).toContain('<h1 class="header-title">Joueurs</h1>')
    expect(html).toContain('aria-label="Retour"')
    for (const id of ['alice', 'bob', 'chloe']) expect(html).toContain(`href="#/joueurs/${id}"`)
    expect(html).toContain('+ Ajouter un joueur')
  })

  it('opens the add form straight away from « Ajouter un joueur » (#/joueurs?add=1)', () => {
    const closed = renderApp('#/joueurs', storeOf(PLAYERS))
    const open = renderApp('#/joueurs?add=1', storeOf(PLAYERS))
    expect(closed).not.toContain('<form')
    expect(open).toContain('<form')
  })
})
