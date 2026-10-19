import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { fmtPercent } from '../../format'
import { applyMatch, whyFr } from '../../rating/engine'
import { replay } from '../../rating'
import { AppStateProvider, DRAFT_STORAGE_KEY, STORAGE_KEY } from '../../store'
import type { Match, Player, Store } from '../../types'
import { BET_WHY_LINE, CommentCaMarche } from '../CommentCaMarche'
import { Match as MatchScreen } from '../Match'
import { MatchDetail } from '../MatchDetail'
import { Joueur } from '../Joueur'
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
    expect(html).toContain('BLANCS')
    expect(html).toContain('NOIRS')
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
    expect(html).not.toContain('BLANCS')
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
    expect(html).toContain('class="scoregrid__cell is-selected" aria-label="Chloé &amp; Dan 8 buts"')
    expect(html).toContain('aria-checked="true" tabindex="0" class="segmented__option is-active">En 10<')
    expect(copy).toContain('Enregistrer les modifications')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('class="preview')
    expect(html).not.toContain('match-panel--enter')
  })

  it('renders nothing for an unknown id (the effect then redirects to the history)', () => {
    expect(render(createElement(MatchEdit, { id: 'nope' }), storeOf(PLAYERS, [MATCH]))).toBe('')
  })

  it('shows the « Comeback » box under the grid on a 5-4 in 5, ticked from the stored match', () => {
    const comeback: Match = { ...MATCH, target: 5, scoreA: 4, scoreB: 5, comeback: true }
    const html = render(createElement(MatchEdit, { id: 'm1' }), storeOf(PLAYERS, [comeback]))
    const copy = plain(html)
    expect(html).toContain('<label class="inline-form-check comeback-check"><input type="checkbox" checked=""/>')
    expect(copy).toContain('>Comeback<')
    expect(copy).toContain('>Les vainqueurs étaient menés 0-4<')
    expect(html.indexOf('comeback-check')).toBeGreaterThan(html.indexOf('class="scoregrid"'))
    const unflagged: Match = { ...comeback, comeback: false }
    const unticked = render(createElement(MatchEdit, { id: 'm1' }), storeOf(PLAYERS, [unflagged]))
    expect(unticked).toContain('<label class="inline-form-check comeback-check"><input type="checkbox"/>')
  })

  it('has no « Comeback » box on any other score', () => {
    expect(render(createElement(MatchEdit, { id: 'm1' }), storeOf(PLAYERS, [MATCH]))).not.toContain('Comeback')
    const fiveThree: Match = { ...MATCH, target: 5, scoreA: 5, scoreB: 3 }
    expect(render(createElement(MatchEdit, { id: 'm1' }), storeOf(PLAYERS, [fiveThree]))).not.toContain('Comeback')
  })
})

describe('Joueur screen, « Fanny et comebacks »', () => {
  const at = (minutes: number): string => new Date(Date.UTC(2025, 9, 1, 12, minutes)).toISOString()
  const played = (id: string, minutes: number, extra: Partial<Match>): Match => ({
    ...MATCH,
    id,
    seq: minutes,
    playedAt: at(minutes),
    createdAt: at(minutes),
    updatedAt: at(minutes),
    ...extra,
  })

  it('counts fannys and comebacks of the player in four tiles', () => {
    const matches = [
      played('m1', 1, { target: 5, scoreA: 5, scoreB: 0 }),
      played('m2', 2, { target: 10, scoreA: 0, scoreB: 10 }),
      played('m3', 3, { target: 5, scoreA: 5, scoreB: 4, comeback: true }),
      played('m4', 4, { target: 5, scoreA: 5, scoreB: 0 }),
    ]
    const copy = plain(render(createElement(Joueur, { id: 'alice' }), storeOf(PLAYERS, matches)))
    expect(copy).toContain('>Fanny et comebacks<')
    const tile = (label: string, value: number) => `>${label}</span><span class="tile-value t-num">${value}<`
    expect(copy).toContain(tile('Fanny mis', 2))
    expect(copy).toContain(tile('Fanny encaissés', 1))
    expect(copy).toContain(tile('Comebacks réussis', 1))
    expect(copy).toContain(tile('Comebacks subis', 0))
  })

  it('is hidden for a player without matches', () => {
    const copy = plain(render(createElement(Joueur, { id: 'eve' }), storeOf(PLAYERS, [MATCH])))
    expect(copy).not.toContain('Fanny et comebacks')
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
    expect(copy).toContain('Flair-o-mètre</span> ')
    expect(copy).toContain(`Alice & Bob : ${fmtPercent(0.5)} · Chloé & Dan : ${fmtPercent(0.5)}`)
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

describe('annonces d’écart', () => {
  const NNBSP = '\u202F'

  it('the edit sheet offers a discreet toggle under each team, above the score', () => {
    const html = render(createElement(MatchEdit, { id: 'm1' }), storeOf(PLAYERS, [MATCH]))
    const copy = plain(html)
    expect(html).toContain('aria-label="Annoncer un écart pour les Blancs"')
    expect(html).toContain('aria-label="Annoncer un écart pour les Noirs"')
    expect(copy.split('🎯 Annoncer un écart')).toHaveLength(3)
    expect(html.indexOf('class="bets"')).toBeLessThan(html.indexOf('class="match-panel__header"'))
    expect(copy).not.toContain('Couilles sur la table')
  })

  it('the edit sheet shows the stored announcement in the stepper, with its live stake and status', () => {
    // Everybody at 1000 before m1: 50 % each side, +4 in 10 → 23 %, +12 / −4; 10-8 is a win by 2 only.
    const html = render(createElement(MatchEdit, { id: 'm1' }), storeOf(PLAYERS, [{ ...MATCH, betA: 4 }]))
    const copy = plain(html)
    expect(html).toContain('class="bet bet--A" role="group" aria-label="Annonce des Blancs"')
    expect(copy).toContain('>🎯 Couilles sur la table<')
    expect(copy).toContain('>Gagner d’au moins<')
    expect(copy).toContain('>4 buts<')
    expect(copy).toContain(`23${NNBSP}%`)
    expect(copy).toContain('+12 si réussi')
    expect(copy).toContain('−4 sinon')
    expect(copy).toContain(`✗ Ratée${NNBSP}: −4`)
    expect(copy).toContain('>Retirer<')
    expect(html).toContain('aria-label="Annoncer un écart pour les Noirs"')
  })

  it('the new-match sheet comes back after the app was closed, announcements included', () => {
    const store = storeOf(PLAYERS, [MATCH])
    const draft = { version: 1, format: '2v2', target: 5, slots: ['alice', 'bob', 'chloe', 'eve'], betA: null, betB: 3 }
    const data: Record<string, string> = {
      [STORAGE_KEY]: JSON.stringify(store),
      [DRAFT_STORAGE_KEY]: JSON.stringify(draft),
    }
    vi.stubGlobal('window', { location: { hash: '#/match' }, history: { back: vi.fn() } })
    vi.stubGlobal('localStorage', { getItem: (key: string) => data[key] ?? null, setItem: () => undefined })
    const html = renderToString(createElement(AppStateProvider, null, createElement(MatchScreen)))
    const copy = plain(html)
    expect(html).toContain('class="match-screen match-screen--score"')
    expect(html).toContain('aria-label="Annoncer un écart pour les Blancs"')
    expect(html).toContain('class="bet bet--B" role="group" aria-label="Annonce des Noirs"')
    expect(copy).toContain('>3 buts<')
    expect(html).toContain('class="preview preview--whatif"')
  })

  it('the exact preview includes the announcement once the score is chosen', () => {
    const playersById = new Map(PLAYERS.map((player) => [player.id, player]))
    const result = replay(PLAYERS, [], { now: new Date('2025-10-10T12:00:00.000Z') })
    const teams = { teamA: ['alice', 'bob'], teamB: ['chloe', 'dan'] }
    const score = { winner: 'A', loserGoals: 5 } as const
    const plainPreview = computePreview(result, PLAYERS, teams, 10, score)
    const withBet = computePreview(result, PLAYERS, teams, 10, score, false, { betA: 4 })
    if (plainPreview?.mode !== 'exact' || withBet?.mode !== 'exact') throw new Error('exact preview expected')
    const delta = (preview: typeof withBet, id: string) =>
      preview.data.rows.find((row) => row.playerId === id)?.delta ?? 0
    expect(delta(withBet, 'alice') - delta(plainPreview, 'alice')).toBeCloseTo(12.364, 2)
    expect(delta(withBet, 'chloe')).toBe(delta(plainPreview, 'chloe'))
    const html = renderToString(createElement(MatchPreview, { preview: withBet, teams, target: 10, playersById }))
    // Fresh players, 10-5: 16 × 1,5 × 0,5 × débutant ×3 = 36 each, plus 12,364 for the Blancs' announcement.
    expect(plain(html)).toContain('aria-label="plus 48.364 points"')
    expect(plain(html)).toContain('>+48<')
    expect(plain(html)).toContain('aria-label="moins 36 points">−36<')
  })

  it('the match detail explains the announcement and each why line carries it', () => {
    const html = render(createElement(MatchDetail, { id: 'm1' }), storeOf(PLAYERS, [{ ...MATCH, betA: 4 }]))
    const copy = plain(html)
    expect(copy).toContain(`🎯 Annonce des Blancs${NNBSP}: +4 · ratée (23${NNBSP}% de chances)`)
    expect(copy).toContain(`Gagné de 2 buts, +4 annoncé${NNBSP}: −16 × 22,7${NNBSP}% de chances = −3,6 chacun`)
    expect(copy).toContain('annonce +4 ratée (23 % de chances) −3,6')
    expect(copy).toContain('🎯 +4 ✗')
  })

  it('the rules page has the « Annonces » section, its box being the engine’s real why line', () => {
    const copy = plain(renderToString(createElement(CommentCaMarche)))
    expect(copy).toContain('>Annonces<')
    expect(copy).toContain('Couilles sur la table'.toLowerCase())
    const state = Object.fromEntries(
      ['a', 'b', 'c', 'd'].map((id) => [id, { rating: 1000, matches: 20, wins: 10, losses: 10, lastPlayedAt: 0 }]),
    )
    const example = { id: 'x', seq: 1, playedAt: 1, createdAt: 1, target: 10 as const }
    const teams = { teamA: ['a', 'b'], teamB: ['c', 'd'] }
    const { deltas } = applyMatch(state, { ...example, ...teams, scoreA: 10, scoreB: 5, betA: 4 })
    expect(BET_WHY_LINE.replaceAll(NNBSP, ' ')).toBe(whyFr(deltas[0]))
  })
})
