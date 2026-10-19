import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import App from '../../App'
import { replay } from '../../rating'
import { topRecords } from '../../records'
import type { Match, Player, PlayerId, RankingTab, Store, Target } from '../../types'
import { TopStatsView } from './TopStatsView'
import { TOP_STATS_COPY, topStatsSections } from './topStatsCards'
import type { CardView } from './topStatsCards'

// Server-rendered checks of the Hall of Flair page (`#/top`, Stats tab) and of its route (vitest runs in node, no DOM).
// The records themselves are unit-tested in src/records.test.ts.

const NNBSP = ' '
const NBSP = ' '
const NOW = new Date(2026, 9, 15, 12)

const PLAYERS: Player[] = [
  { id: 'alice', name: 'Alice', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'bob', name: 'Bob', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'chloe', name: 'Chloé', isGuest: true, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'dan', name: 'Dan', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'eve', name: 'Eve', isGuest: true, createdAt: '2026-09-01T10:00:00.000Z' },
]

function match(seq: number, day: number, teamA: string[], teamB: string[], scoreA: number, scoreB: number): Match {
  const at = new Date(2026, 9, day, 12, seq).toISOString()
  return { id: `m${seq}`, seq, playedAt: at, createdAt: at, updatedAt: at, target: 10, teamA, teamB, scoreA, scoreB }
}

// Teams are [arrière, avant]: nobody plays 5 matches at one position. Alice wins m1-m2, loses m3 (the upset of Chloé
// & Dan), then wins m4-m5 (a run of 2 still going, the most recent one); Bob's run of 2 is m1-m2.
const MATCHES: Match[] = [
  match(1, 3, ['alice', 'bob'], ['chloe', 'dan'], 10, 0),
  match(2, 5, ['alice', 'bob'], ['chloe', 'dan'], 10, 6),
  match(3, 7, ['alice', 'bob'], ['chloe', 'dan'], 8, 10),
  match(4, 9, ['alice'], ['chloe'], 10, 0),
  match(5, 9, ['alice', 'bob'], ['dan', 'chloe'], 10, 4),
]

function renderPage(matches: Match[]): string {
  const result = replay(PLAYERS, matches, { now: NOW })
  const records = topRecords(PLAYERS, matches, result)
  const players = new Map(PLAYERS.map((player) => [player.id, player]))
  return renderToStaticMarkup(createElement(TopStatsView, { records, players, matchCount: matches.length, now: NOW }))
}

/** The HTML of the card titled `title`. */
function cardOf(html: string, title: string): string {
  const card = html.split('<section class="card record">').find((part) => part.includes(`>${title}</h3>`))
  if (card === undefined) throw new Error(`no card « ${title} »`)
  return card.slice(0, card.indexOf('</section>'))
}

function cardsOf(matches: Match[], players: Player[] = PLAYERS): CardView[] {
  const records = topRecords(players, matches, replay(players, matches, { now: NOW }))
  const byId = new Map(players.map((player) => [player.id, player]))
  return topStatsSections(records, byId, NOW).flatMap((section) => section.cards)
}

/** [rank, number of entries] of each group of the card titled `title`. */
function shapeOf(cards: CardView[], title: string): [number, number][] {
  const card = cards.find((candidate) => candidate.title === title)
  if (card === undefined) throw new Error(`no card « ${title} »`)
  return card.groups.map((group) => [group.rank, group.entries.length])
}

/** The podium lines (one per rank) of a card's HTML. */
function itemsOf(card: string): string[] {
  return card.split('<li class="').slice(1)
}

function classesOf(html: string, base: string): string[] {
  return [...html.matchAll(new RegExp(`class="(${base}(?: [^"]*)?)"`, 'g'))].map((m) => m[1])
}

/** Park–Miller (exact in doubles): a deterministic `next(n)` in [0, n). */
function randomOf(seed: number): (n: number) => number {
  let state = seed
  return (n) => {
    state = (state * 48271) % 2147483647
    return Math.floor((state / 2147483647) * n)
  }
}

function shuffled(ids: PlayerId[], next: (n: number) => number): PlayerId[] {
  const out = [...ids]
  for (let i = out.length - 1; i > 0; i--) {
    const j = next(i + 1)
    const kept = out[i]
    out[i] = out[j]
    out[j] = kept
  }
  return out
}

function targetOf(next: (n: number) => number): Target {
  if (next(3) === 0) return 5
  return 10
}

/** Team A wins on a coin toss; a 5-4 in 5 is a comeback one time in two. */
function scoresOf(target: Target, next: (n: number) => number): Pick<Match, 'scoreA' | 'scoreB' | 'comeback'> {
  const loser = next(target)
  const comeback = target === 5 && loser === 4 && next(2) === 0
  if (next(2) === 0) return { scoreA: target, scoreB: loser, comeback }
  return { scoreA: loser, scoreB: target, comeback }
}

/** Deterministic random matches among `roster` (shuffled each time), a 2v2 when `next(4) < duoShare`. */
function generated(count: number, seed: number, roster: PlayerId[], duoShare: number): Match[] {
  const next = randomOf(seed)
  const matches: Match[] = []
  for (let seq = 1; seq <= count; seq++) {
    const ids = shuffled(roster, next)
    const size = 1 + Number(next(4) < duoShare)
    const target = targetOf(next)
    const at = new Date(2026, 8, 1 + Math.floor(seq / 3), 12, seq).toISOString()
    const teams = { teamA: ids.slice(0, size), teamB: ids.slice(size, 2 * size) }
    const base = { id: `g${seq}`, seq, playedAt: at, createdAt: at, updatedAt: at, target }
    matches.push({ ...base, ...teams, ...scoresOf(target, next) })
  }
  return matches
}

/** The same matches with random announcements: about one team in three announces 1 to 4 goals. */
function withBets(matches: Match[], seed: number): Match[] {
  const next = randomOf(seed)
  return matches.map((played) => {
    const bets: Pick<Match, 'betA' | 'betB'> = {}
    if (next(3) === 0) bets.betA = 1 + next(4)
    if (next(3) === 0) bets.betB = 1 + next(4)
    return { ...played, ...bets }
  })
}

function storeOf(matches: Match[], classementTab?: RankingTab): Store {
  return {
    version: 1,
    players: PLAYERS,
    matches,
    settings: { lastFormat: '2v2', lastTarget: 10, classementTab },
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

describe('Hall of Flair page', () => {
  it('groups the 20 record cards under the six section headers, after a one-line intro', () => {
    const html = renderPage(MATCHES)
    expect(html).toContain('Tous les matchs depuis le début (5 matchs), invités compris.')
    const headers = [...html.matchAll(/<span class="section-header-title">([^<]*)<\/span>/g)].map((m) => m[1])
    expect(headers).toEqual([
      'Les spécialistes',
      'Séries',
      'Fanny et comebacks',
      'Coups d’éclat',
      'Couilles sur la table',
      'Fidélités et rivalités',
    ])
    expect(html.match(/<section class="card record">/g)).toHaveLength(20)
    const titles = [...html.matchAll(/<h3 class="record-title">([^<]*)<\/h3>/g)].map((m) => m[1])
    expect(titles).toEqual([
      'Le Sniper',
      'Le Mur',
      'Inarrêtable',
      'Le Chat noir',
      'Roi du fanny',
      'Abonné au fanny',
      'Le Phénix',
      'Le Château de cartes',
      'Altitude record',
      'Le Hold-up',
      'Le Jackpot',
      'Le Flambeur',
      'Nostradamus',
      'Le Mytho',
      'Coup de poker',
      'Le Briseur de rêves',
      'Accro au baby',
      'Un flair de famille',
      'Meilleurs ennemis',
      'Le Clasico',
    ])
    expect(cardOf(html, 'Le Sniper')).toContain('Meilleur taux de victoire à l’avant, 5 matchs minimum')
  })

  it('shows a muted line with the minimum when nobody qualifies', () => {
    const html = renderPage(MATCHES)
    const empty = `<p class="record-empty">Pas encore assez de matchs${NNBSP}: 5 minimum à ce poste</p>`
    expect(cardOf(html, 'Le Sniper')).toContain(empty)
    expect(cardOf(html, 'Le Mur')).toContain(empty)
    expect(cardOf(html, 'Le Phénix')).toContain(`Pas encore de comeback${NNBSP}: 1 minimum`)
    expect(cardOf(html, 'Le Phénix')).not.toContain('class="podium"')
    const solo = renderPage([match(1, 3, ['alice'], ['bob'], 10, 5)])
    expect(cardOf(solo, 'Un flair de famille')).toContain(`Pas encore de match en 2 contre 2${NNBSP}: 1 minimum`)
    expect(cardOf(solo, 'Le Clasico')).toContain(
      `<p class="record-empty">Pas encore de match en 2 contre 2${NNBSP}: 1 minimum</p>`,
    )
    expect(cardOf(solo, 'Inarrêtable')).toContain(
      `Pas encore de série${NNBSP}: 2 victoires d’affilée minimum`,
    )
  })

  it('renders a lone 1st emphasised and a lone 2nd on a small line, the value on its right', () => {
    const fanny = cardOf(renderPage(MATCHES), 'Abonné au fanny')
    // Chloé 2 fannys conceded, Dan 1: no ex æquo, the layout of before.
    expect(fanny).toContain(
      '<li class="podium-item podium-item--first"><a class="podium-entry podium-entry--first podium-entry--link" ' +
        'href="#/joueurs/chloe"><span class="badge badge--medal badge--gold">1</span><span class="podium-body">' +
        '<span class="podium-name">Chloé</span><span class="podium-meta"><span class="podium-value">2 fanny encaissés' +
        '</span></span></span></a></li>',
    )
    expect(fanny).toContain(
      '<li class="podium-item"><a class="podium-entry podium-entry--link" href="#/joueurs/dan">' +
        '<span class="badge badge--medal badge--silver">2</span><span class="podium-body">' +
        '<span class="podium-name">Dan</span></span><span class="podium-value">1 fanny encaissé</span></a></li>',
    )
    expect(fanny).not.toContain('podium-tie')
    expect(fanny).not.toContain('ex æquo')
  })

  it('puts ex æquo 1sts side by side, all emphasised alike, the shared value once under them', () => {
    const streaks = cardOf(renderPage(MATCHES), 'Inarrêtable')
    // Alice and Bob, 2 wins in a row each: one gold medal (hidden from screen readers, read as « 1er ex æquo : »).
    expect(streaks).toContain(
      `<li class="podium-item podium-item--first podium-tie"><span class="sr-only">1er ex æquo${NNBSP}: </span>` +
        '<span class="podium-medal" aria-hidden="true"><span class="badge badge--medal badge--gold">1</span></span>' +
        '<div class="podium-tie-body"><div class="podium-cells">',
    )
    expect(streaks.match(/badge--medal/g)).toHaveLength(1)
    // Each cell its own link to the profile, its own days, the « en cours » pill only on Alice's running series.
    expect(streaks).toContain(
      '<a class="podium-cell podium-entry--link" href="#/joueurs/alice"><span class="podium-name">Alice</span>' +
        `<span class="podium-meta"><span class="podium-detail">le 9${NBSP}oct.</span>` +
        '<span class="pill pill--ongoing">en cours</span></span></a>',
    )
    expect(streaks).toContain(
      '<a class="podium-cell podium-entry--link" href="#/joueurs/bob"><span class="podium-name">Bob</span>' +
        `<span class="podium-meta"><span class="podium-detail">du 3 au 5${NBSP}oct.</span></span></a>`,
    )
    expect(streaks.match(/en cours/g)).toHaveLength(1)
    // The value once, after the cells; nobody bigger than the other.
    expect(streaks).toContain('</div><span class="podium-value">2 victoires</span></div></li>')
    expect(streaks.match(/2 victoires/g)).toHaveLength(1)
    expect(streaks).not.toContain('podium-entry--first')
    expect(new Set(classesOf(streaks, 'podium-cell'))).toEqual(new Set(['podium-cell podium-entry--link']))
  })

  it('puts ex æquo 2nds and 3rds side by side with one medal, the shared value once', () => {
    const html = renderPage(MATCHES)
    const played = cardOf(html, 'Accro au baby')
    // Alice and Chloé 5 matches (1st ex æquo), Bob and Dan 4 (3rd ex æquo).
    const [first, third] = itemsOf(played)
    expect(first).toContain(`<span class="sr-only">1er ex æquo${NNBSP}: </span>`)
    expect(third).toMatch(/^podium-item podium-tie">/)
    expect(third).toContain(`<span class="sr-only">3e ex æquo${NNBSP}: </span>`)
    expect(third.match(/badge--medal/g)).toHaveLength(1)
    expect(third).toContain('badge--bronze">3<')
    for (const [id, name] of [
      ['bob', 'Bob'],
      ['dan', 'Dan'],
    ]) {
      const cell = `<a class="podium-cell podium-entry--link" href="#/joueurs/${id}">`
      expect(third).toContain(`${cell}<span class="podium-name">${name}</span></a>`)
    }
    expect(third.match(/4 matchs/g)).toHaveLength(1)
    const altitude = itemsOf(cardOf(html, 'Altitude record'))
    expect(altitude.map((item) => item.match(/podium-cell"|podium-cell /g)?.length ?? 0)).toEqual([0, 0, 2])
  })

  it('wraps 3+ ex æquo onto more rows of the same grid, a rivalry keeping one link per opponent', () => {
    const rivalry = cardOf(renderPage(MATCHES), 'Meilleurs ennemis')
    // Alice – Chloé 5 matches alone at the top, then three pairs at 4 matches, all 2nd.
    const [first, second] = itemsOf(rivalry)
    expect(first).not.toContain('podium-tie')
    expect(second).toContain(`<span class="sr-only">2e ex æquo${NNBSP}: </span>`)
    expect(second.match(/badge--medal/g)).toHaveLength(1)
    expect(second).toContain('badge--silver">2<')
    expect(classesOf(second, 'podium-cell')).toEqual(['podium-cell', 'podium-cell', 'podium-cell'])
    expect(second).toContain(
      '<div class="podium-cell"><span class="podium-name podium-name--links"><a href="#/joueurs/bob">Bob</a> – ' +
        '<a href="#/joueurs/dan">Dan</a></span><span class="podium-meta podium-meta--line">' +
        '<span class="podium-detail">3–1</span></span></div>',
    )
    expect(second.match(/4 matchs/g)).toHaveLength(1)
  })

  it('gives every line one medal and one value, and every ex æquo of a rank the same classes', () => {
    const html = renderPage(MATCHES)
    const items = itemsOf(html)
    expect(items.length).toBeGreaterThan(10)
    for (const item of items) {
      expect(item.match(/badge--medal/g)).toHaveLength(1)
      expect(item.match(/class="podium-value"/g)).toHaveLength(1)
      if (!item.includes('podium-tie')) continue
      expect(new Set(classesOf(item, 'podium-cell')).size).toBe(1)
      expect(new Set(classesOf(item, 'podium-name')).size).toBe(1)
      expect(new Set(classesOf(item, 'podium-meta')).size).toBeLessThanOrEqual(1)
      expect(item).not.toContain('podium-entry--first')
    }
  })

  it('links duo records to the duo page and match records to the match', () => {
    const html = renderPage(MATCHES)
    const duo = cardOf(html, 'Un flair de famille')
    // Both duos 4 matches together, ex æquo: each cell links to its duo page.
    expect(duo).toContain('<a class="podium-cell podium-entry--link" href="#/duo/alice+bob">')
    expect(duo).toContain('<span class="podium-name">Alice &amp; Bob</span>')
    expect(duo).toContain('<a class="podium-cell podium-entry--link" href="#/duo/chloe+dan">')
    expect(duo).toContain('<span class="podium-value">4 matchs</span>')
    expect(duo).toContain('3 V · 1 D')
    const exploit = cardOf(html, 'Le Hold-up')
    expect(exploit).toContain('href="#/historique/m3"')
    expect(exploit).toContain('<span class="podium-name">Chloé &amp; Dan</span>')
    expect(exploit).toMatch(new RegExp(`<span class="podium-value">\\d+${NNBSP}% de chances</span>`))
    // Alice and Bob took the same points in one match, ex æquo: each cell links to that match.
    const jackpot = itemsOf(cardOf(html, 'Le Jackpot'))
    expect(jackpot[0].match(/<a class="podium-cell podium-entry--link" href="#\/historique\/m\d">/g)).toHaveLength(2)
    expect(jackpot[1]).toMatch(/<a class="podium-entry podium-entry--link" href="#\/historique\/m\d">/)
    expect(cardOf(html, 'Altitude record')).toMatch(/href="#\/joueurs\/alice"[^]*\d points</)
  })

  it('makes each opponent of a rivalry its own link, with the head-to-head', () => {
    const rivalry = cardOf(renderPage(MATCHES), 'Meilleurs ennemis')
    expect(rivalry).toContain(
      '<div class="podium-entry podium-entry--first"><span class="badge badge--medal badge--gold">1</span>' +
        '<span class="podium-body"><span class="podium-name podium-name--links">' +
        '<a href="#/joueurs/alice">Alice</a> – ' +
        '<a href="#/joueurs/chloe">Chloé</a></span>',
    )
    expect(rivalry).toContain('<span class="podium-value">5 matchs</span>')
    expect(rivalry).toContain('<span class="podium-detail">4–1</span>')
  })

  it('makes each duo of a duo rivalry its own link to the duo page, with the head-to-head', () => {
    const rivalry = cardOf(renderPage(MATCHES), 'Le Clasico')
    expect(rivalry).toContain('<p class="record-rule">Le plus de matchs duo contre duo</p>')
    // Alice & Bob against Chloé & Dan in m1, m2, m3 and m5 (Dan and Chloé listed the other way round): 3–1.
    expect(rivalry).toContain(
      '<div class="podium-entry podium-entry--first"><span class="badge badge--medal badge--gold">1</span>' +
        '<span class="podium-body"><span class="podium-name podium-name--links">' +
        '<a href="#/duo/alice+bob">Alice &amp; Bob</a> – <a href="#/duo/chloe+dan">Chloé &amp; Dan</a></span>',
    )
    expect(rivalry).toContain(
      '<span class="podium-value">4 matchs</span><span class="podium-sep" aria-hidden="true">·</span>' +
        '<span class="podium-detail">3–1</span>',
    )
    expect(rivalry.match(/class="podium-item/g)).toHaveLength(1)
  })

  it('shows every ex æquo of a podium rank under one medal, and no « autre ex æquo » line', () => {
    const played = cardOf(renderPage(MATCHES), 'Accro au baby')
    // Alice and Chloé 5 matches, Bob and Dan 4: both 1st, then both 3rd.
    expect(played.match(/badge--gold">1</g)).toHaveLength(1)
    expect(played.match(/badge--bronze">3</g)).toHaveLength(1)
    expect(played).toContain('href="#/joueurs/alice"')
    expect(played).toContain('href="#/joueurs/chloe"')
    expect(played).toContain('href="#/joueurs/bob"')
    expect(played).toContain('href="#/joueurs/dan"')
    expect(played.match(/class="podium-item/g)).toHaveLength(2)
    expect(played.match(/class="podium-cell[ "]/g)).toHaveLength(4)
    expect(renderPage(MATCHES)).not.toContain('autre ex æquo')
  })

  it('never shows a time of day', () => {
    const html = renderPage(MATCHES)
    expect(html).not.toMatch(/\d{1,2}:\d{2}/)
    expect(html).not.toMatch(/\d{1,2}\s?h\s?\d{2}/)
  })

  it('shows an empty state without any match', () => {
    const html = renderPage([])
    expect(html).toContain('Pas encore de records')
    expect(html).not.toContain('class="card record"')
  })
})

// Announcements: Alice & Bob make their +4 (m1, everybody even: 23 %), both teams miss in m2, Alice makes her +3
// against Eve's failed +2 (m3), Chloé & Dan make their +1 (m4), Bob misses his +2 against Eve (m5).
const BETS: Match[] = [
  { ...match(1, 3, ['alice', 'bob'], ['chloe', 'dan'], 10, 2), betA: 4 },
  { ...match(2, 5, ['alice', 'bob'], ['chloe', 'dan'], 10, 7), betA: 5, betB: 3 },
  { ...match(3, 7, ['alice'], ['eve'], 10, 4), betA: 3, betB: 2 },
  { ...match(4, 9, ['chloe', 'dan'], ['alice', 'bob'], 10, 9), betA: 1 },
  { ...match(5, 9, ['eve'], ['bob'], 10, 5), betB: 2 },
]

describe('Hall of Flair, « Couilles sur la table »', () => {
  const titles = ['Le Flambeur', 'Nostradamus', 'Le Mytho', 'Coup de poker', 'Le Briseur de rêves']

  it('has its own section of five cards, each with its rule', () => {
    const html = renderPage(BETS)
    const section = html.split('<span class="section-header-title">Couilles sur la table</span>')[1] ?? ''
    const inSection = [...section.split('section-header-title')[0].matchAll(/<h3 class="record-title">([^<]*)</g)]
    expect(inSection.map((m) => m[1])).toEqual(titles)
    expect(cardOf(html, 'Le Flambeur')).toContain('<p class="record-rule">Le plus d’annonces, réussies ou ratées</p>')
    expect(cardOf(html, 'Nostradamus')).toContain('Meilleur taux d’annonces réussies, 3 annonces et 1 réussite minimum')
    expect(cardOf(html, 'Le Mytho')).toContain('<p class="record-rule">Le plus d’annonces ratées</p>')
    expect(cardOf(html, 'Coup de poker')).toContain('L’annonce réussie qui avait le moins de chances')
    expect(cardOf(html, 'Le Briseur de rêves')).toContain('Le plus d’annonces adverses tombées à l’eau')
  })

  it('shows the usual muted line with the minimum while nobody announced', () => {
    const html = renderPage(MATCHES)
    const empty = (title: string, text: string) =>
      expect(cardOf(html, title)).toContain(`<p class="record-empty">${text}</p>`)
    empty('Le Flambeur', `Pas encore d’annonce${NNBSP}: 1 minimum`)
    empty('Nostradamus', `Pas encore de devin${NNBSP}: 3 annonces et 1 réussite minimum`)
    empty('Le Mytho', `Pas encore d’annonce ratée${NNBSP}: 1 minimum`)
    empty('Coup de poker', `Pas encore d’annonce réussie${NNBSP}: 1 minimum`)
    empty('Le Briseur de rêves', `Pas encore d’annonce ratée${NNBSP}: 1 minimum`)
    // Two announcements are not enough for Nostradamus, while the others already have a podium.
    const two = renderPage(BETS.slice(0, 1).concat({ ...match(2, 5, ['alice'], ['eve'], 10, 4), betA: 9 }))
    expect(cardOf(two, 'Nostradamus')).toContain(`Pas encore de devin${NNBSP}: 3 annonces et 1 réussite minimum`)
    expect(cardOf(two, 'Le Flambeur')).toContain('class="podium"')
  })

  it('counts each member of an announcing team, ex æquo side by side', () => {
    const cards = cardsOf(BETS)
    // Alice and Bob 3 announcements, Chloé and Dan 2 (Eve's 1 is 5th).
    expect(shapeOf(cards, 'Le Flambeur')).toEqual([
      [1, 2],
      [3, 2],
    ])
    // Alice 2 of 3, Bob 1 of 3; Chloé and Dan announced only twice.
    expect(shapeOf(cards, 'Nostradamus')).toEqual([
      [1, 1],
      [2, 1],
    ])
    // Bob missed 2; Alice, Chloé, Dan and Eve 1 each.
    expect(shapeOf(cards, 'Le Mytho')).toEqual([
      [1, 1],
      [2, 4],
    ])
    // Three successes: m1, m3, m4.
    expect(shapeOf(cards, 'Coup de poker')).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ])
    // Alice saw two announcements fail against her (m2, m3); Bob, Chloé, Dan and Eve one each.
    expect(shapeOf(cards, 'Le Briseur de rêves')).toEqual([
      [1, 1],
      [2, 4],
    ])
  })

  it('words each value and links players to their page, the longest shot to its match', () => {
    const html = renderPage(BETS)
    const flambeur = cardOf(html, 'Le Flambeur')
    expect(flambeur).toContain('<a class="podium-cell podium-entry--link" href="#/joueurs/alice">')
    expect(flambeur).toContain('<span class="podium-value">3 annonces</span>')
    expect(flambeur).toContain('<span class="podium-value">2 annonces</span>')
    const nostradamus = cardOf(html, 'Nostradamus')
    expect(nostradamus).toContain('href="#/joueurs/alice"')
    expect(nostradamus).toContain(
      `<span class="podium-value">67${NNBSP}%</span><span class="podium-sep" aria-hidden="true">·</span>` +
        '<span class="podium-detail">2 réussies sur 3</span>',
    )
    expect(nostradamus).toContain('1 réussie sur 3')
    expect(cardOf(html, 'Le Mytho')).toContain('<span class="podium-value">2 annonces ratées</span>')
    expect(cardOf(html, 'Le Mytho')).toContain('<span class="podium-value">1 annonce ratée</span>')
    const poker = itemsOf(cardOf(html, 'Coup de poker'))
    expect(poker[0]).toContain('<a class="podium-entry podium-entry--first podium-entry--link" href="#/historique/m1">')
    expect(poker[0]).toContain('<span class="podium-name">Alice &amp; Bob</span>')
    expect(poker[0]).toContain(`<span class="podium-value">23${NNBSP}% de chances</span>`)
    expect(poker[0]).toContain(`<span class="podium-detail">+4 annoncé · le 3${NBSP}oct.</span>`)
    expect(poker.join('')).toContain('href="#/historique/m3"')
    expect(poker.join('')).toContain('href="#/historique/m4"')
    const briseur = cardOf(html, 'Le Briseur de rêves')
    expect(itemsOf(briseur)[0]).toContain('href="#/joueurs/alice"')
    expect(briseur).toContain('<span class="podium-value">2 rêves brisés</span>')
    expect(briseur).toContain('<span class="podium-value">1 rêve brisé</span>')
  })
})

describe('Hall of Flair groups', () => {
  it('groups the entries by rank: lone entries, ex æquo at ranks 1, 2 and 3, a 3-way tie', () => {
    const cards = cardsOf(MATCHES)
    expect(shapeOf(cards, 'Abonné au fanny')).toEqual([
      [1, 1],
      [2, 1],
    ])
    expect(shapeOf(cards, 'Inarrêtable')).toEqual([[1, 2]])
    expect(shapeOf(cards, 'Meilleurs ennemis')).toEqual([
      [1, 1],
      [2, 3],
    ])
    expect(shapeOf(cards, 'Accro au baby')).toEqual([
      [1, 2],
      [3, 2],
    ])
    expect(shapeOf(cards, 'Altitude record')).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
    ])
    expect(shapeOf(cards, 'Le Sniper')).toEqual([])
  })

  it('shares one value per group: every record ties on its displayed figure', () => {
    // The page's matches, then 4 players always in 2v2 (positions, duo rivalries) and 6 players mixing 1v1 and 2v2:
    // every record gets ex æquo somewhere, and each ex æquo must show exactly its group's value.
    const roster4: PlayerId[] = ['alice', 'bob', 'chloe', 'dan']
    const roster6 = [...roster4, 'eve', 'fred']
    const players6 = [...PLAYERS, { id: 'fred', name: 'Fred', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' }]
    const datasets: [Match[], Player[]][] = [[MATCHES, PLAYERS]]
    for (const seed of [1, 2]) {
      for (const count of [8, 10, 15, 20]) datasets.push([generated(count, seed, roster4, 4), PLAYERS])
      datasets.push([generated(30, seed, roster6, 3), players6])
      // Announcements (« Couilles sur la table »): the same kind of matches, about one team in three announcing.
      datasets.push([withBets(generated(20, seed, roster4, 4), seed), PLAYERS])
      datasets.push([withBets(generated(30, seed, roster6, 3), seed), players6])
    }
    const tiedRecords = new Set<string>()
    for (const [matches, players] of datasets) {
      for (const card of cardsOf(matches, players)) {
        for (const group of card.groups) {
          expect(group.entries.map((entry) => entry.value)).toEqual(group.entries.map(() => group.value))
          if (group.entries.length > 1) tiedRecords.add(card.key)
        }
      }
    }
    expect([...tiedRecords].sort()).toEqual(Object.keys(TOP_STATS_COPY).sort())
  })
})

describe('Hall of Flair in the Stats tab', () => {
  it('is no longer linked from Classement, whatever the tab', () => {
    for (const tab of [undefined, '1v1'] as const) {
      const html = renderApp('#/', storeOf(MATCHES, tab))
      expect(html).not.toContain('href="#/top"')
      expect(html).not.toContain('🏅 Hall of Flair')
      expect(html).not.toContain('href="#/courbes"')
    }
  })

  it('opens as the « Hall of Flair » segment: header « Stats », segments above the records, Stats tab active', () => {
    const html = renderApp('#/top', storeOf(MATCHES))
    expect(html).toContain('>Stats</h1>')
    expect(html).not.toContain('aria-label="Retour"')
    expect(html).toMatch(/aria-checked="true"[^>]*>Hall of Flair<\/button>/)
    expect(html.indexOf('stats-tabs')).toBeLessThan(html.indexOf('top-stats__intro'))
    expect(html).toContain('<h3 class="record-title">Le Sniper</h3>')
    const tabs = html.match(/<a [^>]*class="tab[^"]*"[^>]*>/g) ?? []
    expect(tabs[3]).toContain('aria-current="page"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  })
})
