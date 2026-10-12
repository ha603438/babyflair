import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { fmtPercent } from '../../format'
import { replay } from '../../rating'
import { AppStateProvider } from '../../store'
import type { Match, Player, Store } from '../../types'
import { Match as MatchScreen } from '../Match'
import { MatchEdit } from '../MatchEdit'
import { MatchPreview } from './MatchPreview'
import { computePreview } from './preview'

// Server-rendered markup only (vitest runs in node, no DOM): these are smoke tests of the initial render of each
// screen with a seeded store, the same way src/App.test.ts covers the shell. Interactions are covered by the pure
// helpers (draftMatch.test.ts) and the draft reducer tests.

const PLAYERS: Player[] = [
  { id: 'alice', name: 'Alice', isGuest: false, createdAt: '2025-09-01T10:00:00.000Z' },
  { id: 'bob', name: 'Bob', isGuest: false, createdAt: '2025-09-02T10:00:00.000Z' },
  { id: 'chloe', name: 'Chloé', isGuest: true, createdAt: '2025-09-03T10:00:00.000Z' },
  { id: 'dan', name: 'Dan', isGuest: false, createdAt: '2025-09-04T10:00:00.000Z' },
  { id: 'eve', name: 'Eve', isGuest: false, createdAt: '2025-09-05T10:00:00.000Z' },
]

const MATCH: Match = {
  id: 'm1',
  seq: 1,
  playedAt: '2025-10-01T12:42:00.000Z',
  createdAt: '2025-10-01T12:42:00.000Z',
  updatedAt: '2025-10-01T12:42:00.000Z',
  target: 10,
  teamA: ['alice', 'bob'],
  teamB: ['chloe', 'dan'],
  scoreA: 10,
  scoreB: 8,
}

function storeOf(players: Player[], matches: Match[]): Store {
  return { version: 1, players, matches, settings: { lastFormat: '2v2', lastTarget: 10 }, nextSeq: matches.length + 1 }
}

// React's server output escapes « ' » / « & » and separates adjacent text expressions with `<!-- -->`; copy
// assertions compare against the markup with those artefacts removed, attribute and class assertions use the raw html.
function plain(html: string): string {
  return html
    .replace(/<!-- -->/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
}

function render(element: ReactElement, store: Store): string {
  vi.stubGlobal('window', { location: { hash: '#/match' }, history: { back: vi.fn() } })
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(store), setItem: () => undefined })
  return renderToString(createElement(AppStateProvider, null, element))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Match screen, step A', () => {
  it('renders the slot block, the caption, the ordered chips and the add chip', () => {
    const html = render(createElement(MatchScreen), storeOf(PLAYERS, [MATCH]))
    expect(html).toContain('ÉQUIPE 1')
    expect(html).toContain('ÉQUIPE 2')
    expect(html).toContain('0 joueur sur 4')
    expect(html).toContain('Choisis un joueur')
    expect(html).toContain('+ Nouveau joueur')
    expect(html).not.toContain('Continuer')
    expect(html).not.toContain('class="preview')
    // chipOrder: the four players of the last match first (same time → by name), then Eve who never played.
    const order = ['>Alice<', '>Bob<', '>Chloé<', '>Dan<', '>Eve<'].map((name) => html.indexOf(name))
    expect(order.every((index) => index !== -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toContain('class="chip')
    expect(html).not.toContain('chip--team')
    // The seeded match is months old: its four players are inactive (opacity .6), Eve never played.
    expect(html).toContain('class="chip is-inactive"')
    expect(html).toContain('invité')
    expect(html).toContain('class="match-screen match-screen--players"')
  })

  it('reads « Encore 1 joueur à ajouter » with a single player', () => {
    const html = render(createElement(MatchScreen), storeOf(PLAYERS.slice(0, 1), []))
    expect(html).toContain('Encore 1 joueur à ajouter')
    expect(html).toContain('>Alice<')
    expect(html).toContain('+ Nouveau joueur')
  })

  it('shows the empty state without players', () => {
    const html = plain(render(createElement(MatchScreen), storeOf([], [])))
    expect(html).toContain("Ajoute d'abord des joueurs")
    expect(html).toContain('Il en faut au moins 2 pour enregistrer un match.')
    expect(html).toContain('Ajouter des joueurs')
    expect(html).not.toContain('ÉQUIPE 1')
  })
})

describe('MatchEdit screen', () => {
  it('opens on the score step with the stored score selected, no preview and a disabled save button', () => {
    const html = render(createElement(MatchEdit, { id: 'm1' }), storeOf(PLAYERS, [MATCH]))
    const copy = plain(html)
    expect(copy).toContain('Alice & Bob')
    expect(copy).toContain('Chloé & Dan')
    expect(copy).toContain('>vs<')
    expect(copy).toContain('>Modifier<')
    expect(copy).toContain('>Score<')
    expect(copy).toContain('>En 5<')
    expect(copy).toContain('>En 10<')
    expect(copy).toContain('Alice & Bob</span> gagnent 10 – 8')
    expect(html).toContain('class="scoregrid__cell is-selected" aria-label="Alice &amp; Bob gagnent 10 à 8"')
    expect(html).toContain('aria-checked="true" tabindex="0" class="segmented__option is-active">En 10<')
    expect(copy).toContain('Enregistrer les modifications')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('class="preview')
    expect(html).not.toContain('match-panel--enter')
  })

  it('renders nothing for an unknown id (the effect then redirects to the history)', () => {
    expect(render(createElement(MatchEdit, { id: 'nope' }), storeOf(PLAYERS, [MATCH]))).toBe('')
  })
})

describe('MatchPreview', () => {
  const playersById = new Map(PLAYERS.map((player) => [player.id, player]))
  const result = replay(PLAYERS, [], { now: new Date('2025-10-10T12:00:00.000Z') })
  const teams = { teamA: ['alice', 'bob'], teamB: ['chloe', 'dan'] }

  it('renders the chance line and the what-if headers before a score', () => {
    const preview = computePreview(result, PLAYERS, teams, 10, null)
    expect(preview).not.toBeNull()
    if (preview === null) return
    const html = renderToString(createElement(MatchPreview, { preview, teams, target: 10, playersById }))
    const copy = plain(html)
    expect(html).toContain('class="preview preview--whatif"')
    expect(copy).toContain(`Alice & Bob : ${fmtPercent(0.5)} de chances · Chloé & Dan : ${fmtPercent(0.5)}`)
    expect(copy).toContain('Si victoire 10-9')
    expect(copy).toContain('Si défaite 9-10')
    expect(copy).toContain('Chloé')
  })

  it('renders one exact line after a score', () => {
    const preview = computePreview(result, PLAYERS, teams, 5, { winner: 'A', loserGoals: 2 })
    expect(preview).not.toBeNull()
    if (preview === null) return
    const html = renderToString(createElement(MatchPreview, { preview, teams, target: 5, playersById }))
    expect(html).toContain('class="preview preview--exact"')
    expect(html).not.toContain('Si victoire')
    expect(html).toContain('preview__delta--pos')
    expect(html).toContain('preview__delta--neg')
  })
})
