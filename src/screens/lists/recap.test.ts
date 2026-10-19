import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import App from '../../App'
import { betChance, replay } from '../../rating'
import { recap, RECAP_DAYS_STEP } from '../../recap'
import type { Match, Player, Store, Target } from '../../types'
import { matchText } from './recapLines'
import { RecapView } from './RecapView'

// Server-rendered checks of the Récap (`#/stats`, default segment of the Stats tab): day cards, highlight lines and
// their links, « Jours précédents », the empty state, and no time of day anywhere (vitest runs in node, no DOM). The
// highlight rules themselves are unit-tested in src/recap.test.ts.

const NNBSP = ' '
// Thursday 15 October 2026, local time.
const NOW = new Date(2026, 9, 15, 18)

const PLAYERS: Player[] = [
  { id: 'alice', name: 'Alice', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'bob', name: 'Bob', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'chloe', name: 'Chloé', isGuest: true, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'dan', name: 'Dan', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'eve', name: 'Eve', isGuest: true, createdAt: '2026-09-01T10:00:00.000Z' },
]
const BY_ID = new Map(PLAYERS.map((player) => [player.id, player]))

type Spec = { a: string[]; b: string[]; score: [number, number]; target?: Target; comeback?: boolean }

function match(seq: number, day: number, { a, b, score, target = 10, comeback }: Spec): Match {
  const at = new Date(2026, 9, day, 12, seq).toISOString()
  const base = { id: `m${seq}`, seq, playedAt: at, createdAt: at, updatedAt: at, target, teamA: a, teamB: b }
  const played: Match = { ...base, scoreA: score[0], scoreB: score[1] }
  if (comeback === undefined) return played
  return { ...played, comeback }
}

// Today: a fanny of Alice & Bob, their second win together, then Eve's upset of Alice. Yesterday: Chloé's comeback.
// Monday 12: Alice beats Eve. Friday 9: an older day, behind « Jours précédents ».
const MATCHES: Match[] = [
  match(1, 15, { a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [10, 0] }),
  match(2, 15, { a: ['bob', 'alice'], b: ['dan', 'chloe'], score: [10, 7] }),
  match(3, 15, { a: ['eve'], b: ['alice'], score: [10, 8] }),
  match(4, 14, { a: ['chloe'], b: ['dan'], score: [5, 4], target: 5, comeback: true }),
  match(5, 12, { a: ['alice'], b: ['eve'], score: [10, 5] }),
  match(6, 9, { a: ['bob'], b: ['dan'], score: [10, 2] }),
]

function renderRecap(matches: Match[], dayCount = RECAP_DAYS_STEP): string {
  const result = replay(PLAYERS, matches, { now: NOW })
  const data = recap(PLAYERS, matches, result, dayCount)
  return renderToStaticMarkup(createElement(RecapView, { recap: data, players: BY_ID, now: NOW, onMore: () => {} }))
}

/** The HTML of the day card titled `title`. */
function cardOf(html: string, title: string): string {
  const card = html.split('<section class="card recap-day">').find((part) => part.includes(`>${title}</h2>`))
  if (card === undefined) throw new Error(`no card « ${title} »`)
  return card.slice(0, card.indexOf('</section>'))
}

/** The highlight line labelled `label` inside `card` (the first one). */
function lineOf(card: string, label: string): string {
  const line = card.split('<li>').find((part) => part.includes(`>${label}</span>`))
  if (line === undefined) throw new Error(`no line « ${label} »`)
  return line.slice(0, line.indexOf('</li>'))
}

describe('Récap view', () => {
  it('shows one card per day with matches, most recent first, the last 3 of them', () => {
    const html = renderRecap(MATCHES)
    const titles = [...html.matchAll(/<h2 class="recap-day__title">([^<]*)<\/h2>/g)].map((m) => m[1])
    expect(titles).toEqual(['Aujourd&#x27;hui', 'Hier', 'lundi 12 octobre'])
    expect(html).toContain('<button type="button" class="recap-more">Jours précédents</button>')
    const all = renderRecap(MATCHES, 2 * RECAP_DAYS_STEP)
    expect(all).toContain('>vendredi 9 octobre</h2>')
    expect(all).not.toContain('recap-more')
  })

  it('sums the day up: « 3 matchs · 5 joueurs · 1 fanny », no fanny part without one', () => {
    const html = renderRecap(MATCHES)
    const today = cardOf(html, 'Aujourd&#x27;hui')
    expect(today).toContain('<p class="recap-day__summary">3 matchs · 5 joueurs · 1 fanny</p>')
    expect(cardOf(html, 'Hier')).toContain('<p class="recap-day__summary">1 match · 2 joueurs</p>')
  })

  it('links the fanny and the comeback to their match, winners first', () => {
    const html = renderRecap(MATCHES)
    const fanny = lineOf(cardOf(html, 'Aujourd&#x27;hui'), 'Fanny')
    expect(fanny).toContain('href="#/historique/m1"')
    expect(fanny).toContain('<span class="recap-line__emoji" aria-hidden="true">🍑</span>')
    expect(fanny).toContain('>Alice &amp; Bob 10–0 Chloé &amp; Dan</span>')
    const comeback = lineOf(cardOf(html, 'Hier'), 'Comeback')
    expect(comeback).toContain('href="#/historique/m4"')
    expect(comeback).toContain('>Chloé 5–4 Dan</span>')
    expect(matchText(MATCHES[2], BY_ID)).toBe('Eve 10–8 Alice')
  })

  it('links the duo of the day to its page with its record', () => {
    const duo = lineOf(cardOf(renderRecap(MATCHES), 'Aujourd&#x27;hui'), 'Duo du jour')
    expect(duo).toContain('href="#/duo/alice+bob"')
    expect(duo).toContain('>Alice &amp; Bob</span>')
    expect(duo).toContain('<span class="recap-line__value">2 V · 0 D</span>')
  })

  it('shows the hold-up with the winners’ chance (« 28 % de chances » style), linked to the match', () => {
    const holdUp = lineOf(cardOf(renderRecap(MATCHES), 'Aujourd&#x27;hui'), 'Hold-up du jour')
    expect(holdUp).toContain('href="#/historique/m3"')
    expect(holdUp).toContain('>Eve 10–8 Alice</span>')
    expect(holdUp).toMatch(new RegExp(`<span class="recap-line__detail">\\d+${NNBSP}% de chances</span>`))
  })

  it('shows the player of the day in green and the one « dans le dur » in red, with their day record', () => {
    const today = cardOf(renderRecap(MATCHES), 'Aujourd&#x27;hui')
    const hot = lineOf(today, 'Joueur du jour')
    expect(hot).toMatch(/href="#\/joueurs\/\w+"/)
    expect(hot).toMatch(/<span class="recap-line__value pos">\+\d+<\/span>/)
    expect(hot).toMatch(/<span class="recap-line__detail">\d+ V · \d+ D<\/span>/)
    const cold = lineOf(today, 'Dans le dur')
    expect(cold).toMatch(/<span class="recap-line__value neg">−\d+<\/span>/)
  })

  it('shows the « Annonce du jour » (announcers, score, chance) linked to its match; the summary counts them', () => {
    // Everybody even in m1: Alice & Bob's +3 makes it. Eve's +4 in m2 fails (10-8), and does not count.
    const matches = [
      { ...match(1, 15, { a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [10, 5] }), betA: 3 },
      { ...match(2, 15, { a: ['eve'], b: ['alice'], score: [10, 8] }), betA: 4 },
    ]
    const today = cardOf(renderRecap(matches), 'Aujourd&#x27;hui')
    expect(today).toContain('<p class="recap-day__summary">2 matchs · 5 joueurs · 2 annonces</p>')
    const bet = lineOf(today, 'Annonce du jour')
    expect(bet).toContain('href="#/historique/m1"')
    expect(bet).toContain('<span class="recap-line__emoji" aria-hidden="true">🎯</span>')
    expect(bet).toContain('>Alice &amp; Bob · +3 annoncé, gagné 10–5</span>')
    const chance = betChance(0.5, 10, 3)
    expect(bet).toContain(`<span class="recap-line__value">${Math.round(chance * 100)}${NNBSP}%</span>`)
    expect(bet).not.toContain('recap-line__detail')
    // Right after the hold-up (Eve's upset of Alice).
    expect(today).toContain('Hold-up du jour')
    expect(today.indexOf('Annonce du jour')).toBeGreaterThan(today.indexOf('Hold-up du jour'))
  })

  it('has no « Annonce du jour » without a successful one, and no annonce part without an announcement', () => {
    const html = renderRecap(MATCHES)
    expect(html).not.toContain('Annonce du jour')
    expect(html).not.toContain('annonce')
    const failed = [{ ...match(1, 15, { a: ['alice'], b: ['bob'], score: [10, 8] }), betA: 3 }]
    const card = cardOf(renderRecap(failed), 'Aujourd&#x27;hui')
    expect(card).toContain('<p class="recap-day__summary">1 match · 2 joueurs · 1 annonce</p>')
    expect(card).not.toContain('Annonce du jour')
  })

  it('names the addict of the day only from 3 matches: Alice played all 3 today', () => {
    const addict = lineOf(cardOf(renderRecap(MATCHES), 'Aujourd&#x27;hui'), 'Accro du jour')
    expect(addict).toContain('href="#/joueurs/alice"')
    expect(addict).toContain('<span class="recap-line__value">3 matchs</span>')
    expect(cardOf(renderRecap(MATCHES), 'Hier')).not.toContain('Accro du jour')
  })

  it('never shows a time of day', () => {
    const html = renderRecap(MATCHES, 2 * RECAP_DAYS_STEP)
    expect(html).not.toMatch(/\d{1,2}:\d{2}/)
    expect(html).not.toMatch(/\d{1,2}\s?h\s?\d{2}/)
  })

  it('shows an empty state without any match', () => {
    const html = renderRecap([])
    expect(html).toContain('Pas encore de récap')
    expect(html).not.toContain('recap-day')
  })
})

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const DAY = 86_400_000

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

function renderApp(hash: string, store: Store): string {
  vi.stubGlobal('window', { location: { hash }, history: { back: vi.fn(), length: 1 } })
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(store), setItem: () => undefined })
  return renderToString(createElement(App))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Récap route', () => {
  it('opens on #/stats under the « Récap » | « Courbes » | « Hall of Flair » segments, « Récap » checked', () => {
    const at = (days: number) => new Date(Date.now() - days * DAY).toISOString()
    const recent = MATCHES.map((m, days) => ({ ...m, playedAt: at(days), createdAt: at(days), updatedAt: at(days) }))
    const html = renderApp('#/stats', storeOf(recent))
    expect(html).toContain('aria-label="Stats"')
    expect(html).toMatch(/aria-checked="true"[^>]*>Récap<\/button>/)
    expect(html).toContain('>Courbes</button>')
    expect(html).toContain('>Hall of Flair</button>')
    expect(html.indexOf('stats-tabs')).toBeLessThan(html.indexOf('recap-day'))
    expect(html.match(/<section class="card recap-day">/g)).toHaveLength(3)
    expect(html).toContain('>Aujourd&#x27;hui</h2>')
  })
})
