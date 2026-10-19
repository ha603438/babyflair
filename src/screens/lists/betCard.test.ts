import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import App from '../../App'
import type { BetRecord, RatedBet } from '../../betStats'
import { fmtDelta } from '../../format'
import { replay } from '../../rating'
import { replayMode } from '../../rating/modes'
import type { Match, MatchId, Player, ReplayResult, Store } from '../../types'
import { betCardView, bestBetText, betSuccessText, facedText } from './betLabels'

// « 🎯 Annonces » card of the player and duo pages: its copy (betLabels.ts) and server renders of both pages through
// the App (vitest runs in node, no DOM). The counts themselves are unit-tested in src/betStats.test.ts.

const NNBSP = ' '
const DAY = 86_400_000

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString()
}

const PLAYERS: Player[] = [
  { id: 'alice', name: 'Alice', isGuest: false, createdAt: daysAgo(20) },
  { id: 'bob', name: 'Bob', isGuest: false, createdAt: daysAgo(20) },
  { id: 'chloe', name: 'Chloé', isGuest: true, createdAt: daysAgo(20) },
  { id: 'dan', name: 'Dan', isGuest: false, createdAt: daysAgo(20) },
  { id: 'eve', name: 'Eve', isGuest: false, createdAt: daysAgo(20) },
  { id: 'fred', name: 'Fred', isGuest: false, createdAt: daysAgo(20) },
]

function match(seq: number, days: number, teamA: string[], teamB: string[], scoreA: number, scoreB: number): Match {
  const at = daysAgo(days)
  return { id: `m${seq}`, seq, playedAt: at, createdAt: at, updatedAt: at, target: 10, teamA, teamB, scoreA, scoreB }
}

// m1: everybody even, Alice & Bob make their +4 (23 %). m2: both teams miss. m3: Alice makes her +2 against Eve,
// who announced nothing. m4: Bob & Dan miss their +1 against Alice & Chloé. Fred never played.
const MATCHES: Match[] = [
  { ...match(1, 3, ['alice', 'bob'], ['chloe', 'dan'], 10, 2), betA: 4 },
  { ...match(2, 2, ['alice', 'bob'], ['chloe', 'dan'], 10, 7), betA: 5, betB: 3 },
  { ...match(3, 1, ['alice'], ['eve'], 10, 4), betA: 2 },
  { ...match(4, 0.5, ['alice', 'chloe'], ['bob', 'dan'], 10, 9), betB: 1 },
]

function storeOf(matches: Match[]): Store {
  return {
    version: 1,
    players: PLAYERS,
    matches,
    settings: { lastFormat: '2v2', lastTarget: 10 },
    nextSeq: matches.length + 1,
    calls: [],
    callPlayers: [],
  }
}

function renderApp(hash: string, matches: Match[] = MATCHES): string {
  const store = storeOf(matches)
  vi.stubGlobal('window', { location: { hash }, history: { back: vi.fn(), length: 1 } })
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(store), setItem: () => undefined })
  return renderToString(createElement(App))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The « 🎯 Annonces » card of a page. */
function betCardOf(html: string): string {
  const title = '<h2 class="tiles-title"><span aria-hidden="true">🎯 </span>Annonces</h2>'
  const start = html.indexOf(title)
  if (start === -1) throw new Error('no « 🎯 Annonces » card')
  return html.slice(start, html.indexOf('</section>', start))
}

function tile(label: string, text: string): string {
  const value = `<span class="tile-value t-num">${text}</span>`
  return `<div class="tile"><span class="tile-label">${label}</span>${value}</div>`
}

/** The announcing side in `ids` (always the Blancs in these fixtures), none elsewhere. */
function teamsOf(ids: MatchId[]): (id: MatchId) => 'A' | null {
  return (id) => {
    if (ids.includes(id)) return 'A'
    return null
  }
}

/** Net bet points of the team `teamOf` names in each match (none: null) in a replay `result`. */
function betPoints(result: ReplayResult, teamOf: (id: MatchId) => 'A' | 'B' | null): number {
  let total = 0
  for (const [id, outcome] of result.byMatch) {
    for (const bet of outcome.bets) if (bet.team === teamOf(id)) total += bet.delta
  }
  return total
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

const RECORD: BetRecord = { made: 3, won: 2, points: 8.6, best: null, faced: 2, broken: 1 }

function rated(n: number, chance: number): RatedBet {
  return { match: MATCHES[0], bet: { team: 'A', n, chance, success: true, delta: 12.4 } }
}

describe('« 🎯 Annonces » copy', () => {
  it('has no card before the first announcement, whatever was faced', () => {
    expect(betCardView({ ...RECORD, made: 0, won: 0, points: 0 }, 'player')).toBeNull()
  })

  it('words the four tiles: count, « x/y · % », signed rounded points, the longest shot linked to its match', () => {
    const view = betCardView({ ...RECORD, best: rated(4, 0.227) }, 'player')
    expect(view?.tiles).toEqual([
      { label: 'Annonces', value: '3', href: null },
      { label: 'Réussies', value: `2/3 · 67${NNBSP}%`, href: null },
      { label: 'Points d’annonce', value: '+9', href: null },
      { label: 'Plus belle annonce', value: `+4 à 23${NNBSP}%`, href: '#/historique/m1' },
    ])
    expect(betCardView({ ...RECORD, points: -3.4 }, 'player')?.tiles[2].value).toBe('−3')
    expect(betCardView({ ...RECORD, won: 0, points: 0.2 }, 'player')?.tiles.slice(1)).toEqual([
      { label: 'Réussies', value: `0/3 · 0${NNBSP}%`, href: null },
      { label: 'Points d’annonce', value: '±0', href: null },
      { label: 'Plus belle annonce', value: 'Aucune', href: null },
    ])
  })

  it('says how many opponents’ announcements the player (or the duo) « a fait tomber », only when faced', () => {
    expect(facedText({ faced: 3, broken: 2 }, 'player')).toBe('A fait tomber 2 annonces adverses sur 3')
    expect(facedText({ faced: 1, broken: 1 }, 'player')).toBe('A fait tomber 1 annonce adverse sur 1')
    expect(facedText({ faced: 2, broken: 0 }, 'duo')).toBe('Ont fait tomber 0 annonce adverse sur 2')
    expect(facedText({ faced: 0, broken: 0 }, 'player')).toBeNull()
    expect(betCardView({ ...RECORD, faced: 0, broken: 0 }, 'player')?.faced).toBeNull()
  })

  it('formats a rate and a longest shot in French', () => {
    expect(betSuccessText({ made: 6, won: 4 })).toBe(`4/6 · 67${NNBSP}%`)
    expect(betSuccessText({ made: 0, won: 0 })).toBe(`0/0 · 0${NNBSP}%`)
    expect(bestBetText(rated(2, 0.48))).toBe(`+2 à 48${NNBSP}%`)
  })
})

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

describe('Player page, « 🎯 Annonces »', () => {
  it('shows the card once the player announced: tiles, the longest shot linked, the faced line', () => {
    const html = renderApp('#/joueurs/alice')
    const card = betCardOf(html)
    expect(card).toContain('<div class="tiles tiles--2">')
    expect(card).toContain(tile('Annonces', '3'))
    expect(card).toContain(tile('Réussies', `2/3 · 67${NNBSP}%`))
    const result = replay(PLAYERS, MATCHES, { now: new Date() })
    const points = fmtDelta(betPoints(result, teamsOf(['m1', 'm2', 'm3'])))
    expect(card).toContain(tile('Points d’annonce', points))
    expect(card).toContain(
      '<a class="tile tile--link" href="#/historique/m1"><span class="tile-label">Plus belle annonce</span>' +
        `<span class="tile-value t-num">+4 à 23${NNBSP}%</span></a>`,
    )
    // Chloé & Dan's +3 (m2) and Bob & Dan's +1 (m4) both failed against her.
    expect(card).toContain('<p class="tiles-note">A fait tomber 2 annonces adverses sur 2</p>')
    // After « Fanny et comebacks ».
    expect(html.indexOf('>Fanny et comebacks<')).toBeLessThan(html.indexOf('>Annonces</h2>'))
  })

  it('is hidden for a player who only faced announcements, or never played', () => {
    expect(renderApp('#/joueurs/eve')).toContain('>Fanny et comebacks<')
    expect(renderApp('#/joueurs/eve')).not.toContain('>Annonces</h2>')
    expect(renderApp('#/joueurs/fred')).not.toContain('>Annonces</h2>')
    const noBet = MATCHES.map(({ betA: _a, betB: _b, ...rest }) => rest)
    expect(renderApp('#/joueurs/alice', noBet)).not.toContain('>Annonces</h2>')
  })
})

describe('Duo page, « 🎯 Annonces »', () => {
  it('shows the announcements made together, in duo points, and the opponents’ ones they made fail', () => {
    const card = betCardOf(renderApp('#/duo/bob+alice'))
    // m1 and m2 together; m4 (Alice with Chloé, Bob with Dan) is not theirs.
    expect(card).toContain(tile('Annonces', '2'))
    expect(card).toContain(tile('Réussies', `1/2 · 50${NNBSP}%`))
    const duos = replayMode('2v2', PLAYERS, MATCHES, new Date())
    const points = fmtDelta(betPoints(duos.result, teamsOf(['m1', 'm2'])))
    expect(card).toContain(tile('Points d’annonce', points))
    expect(card).toContain('href="#/historique/m1"')
    expect(card).toContain('<p class="tiles-note">Ont fait tomber 1 annonce adverse sur 1</p>')
  })

  it('shows « Aucune » without a success, and no card for a duo that never announced together', () => {
    const card = betCardOf(renderApp('#/duo/chloe+dan'))
    expect(card).toContain(tile('Réussies', `0/1 · 0${NNBSP}%`))
    expect(card).toContain(tile('Plus belle annonce', 'Aucune'))
    expect(card).not.toContain('tile--link')
    expect(card).toContain('<p class="tiles-note">Ont fait tomber 1 annonce adverse sur 2</p>')
    const html = renderApp('#/duo/alice+chloe')
    expect(html).toContain('class="card card-pad hero"')
    expect(html).not.toContain('>Annonces</h2>')
  })
})
