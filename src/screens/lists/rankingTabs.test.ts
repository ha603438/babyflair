import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import App from '../../App'
import { fmtDelta } from '../../format'
import { replayRankings } from '../../rating/rankings'
import type { Match, Player, RankingTab, Store } from '../../types'

// Server-rendered checks of the three Classement tabs (2V2 mixte | Équipes | 1V1, three separate rankings), the duo
// page, the player page and the Courbes screen following the tab (vitest runs in node, no DOM: the App is rendered
// from a stubbed store).

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
]

function match(seq: number, days: number, teamA: string[], teamB: string[], scoreA: number, scoreB: number): Match {
  const at = daysAgo(days)
  return { id: `m${seq}`, seq, playedAt: at, createdAt: at, updatedAt: at, target: 10, teamA, teamB, scoreA, scoreB }
}

// alice+bob and chloe+dan: 3 matches each (classés); alice+chloe and bob+dan: 1 (pas encore classés).
// 1v1: alice 2 matches, bob and chloe 1 (nobody classé yet); dan and eve none.
const MATCHES: Match[] = [
  match(1, 3, ['alice', 'bob'], ['chloe', 'dan'], 10, 0),
  match(2, 2.5, ['bob', 'alice'], ['dan', 'chloe'], 10, 6),
  match(3, 2, ['chloe', 'dan'], ['alice', 'bob'], 10, 8),
  match(4, 1.5, ['alice'], ['bob'], 10, 5),
  match(5, 1, ['alice'], ['chloe'], 10, 7),
  match(6, 0.5, ['alice', 'chloe'], ['bob', 'dan'], 10, 9),
]

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

function checkedTab(html: string): string | undefined {
  return /<button[^>]*role="radio" aria-checked="true"[^>]*>([^<]*)<\/button>/.exec(html)?.[1]
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Classement tabs', () => {
  it('shows « 2V2 mixte » | « Équipes » | « 1V1 » at the top, « 2V2 mixte » (the main ranking) by default', () => {
    const html = renderApp('#/', storeOf(MATCHES))
    expect(html).toContain('aria-label="Classement"')
    for (const label of ['2V2 mixte', 'Équipes', '1V1']) expect(html).toContain(`>${label}</button>`)
    expect(checkedTab(html)).toBe('2V2 mixte')
    expect(html.indexOf('classement-tabs')).toBeLessThan(html.indexOf('ctx-strip'))
    expect(html).toContain('href="#/joueurs/alice"')
    expect(html).not.toContain('href="#/duo/')
    // The strip counts the 2v2 matches only (the two 1v1 belong to the 1V1 ranking).
    expect(html).toContain('4 matchs · 0 classé')
    expect(html).toContain('classés après 10 matchs')
    expect(html).toContain('10 matchs en 2 contre 2 pour entrer au classement')
  })

  it('opens « 2V2 mixte » for a phone that remembered the old « Mixte » tab', () => {
    const html = renderApp('#/', storeOf(MATCHES, 'mixte'))
    expect(checkedTab(html)).toBe('2V2 mixte')
    expect(html).not.toContain('>Mixte</button>')
  })

  it('rates the players on the 2v2 matches only: removing the 1v1 changes no row', () => {
    const with1v1 = renderApp('#/', storeOf(MATCHES))
    const without = renderApp('#/', storeOf(MATCHES.filter((m) => m.teamA.length === 2)))
    const rows = (html: string) => html.slice(html.indexOf('<div class="rows">'))
    expect(rows(with1v1)).toBe(rows(without))
  })

  it('says so when only 1v1 matches were played', () => {
    const html = renderApp('#/', storeOf(MATCHES.filter((m) => m.teamA.length === 1)))
    expect(checkedTab(html)).toBe('2V2 mixte')
    expect(html).toContain('Aucun match en 2 contre 2 pour l&#x27;instant')
    expect(html).not.toContain('Pas encore de classement')
  })

  it('lists the duos on « Équipes », ranked after 3 matches, each linking to its page', () => {
    const html = renderApp('#/', storeOf(MATCHES, '2v2'))
    expect(checkedTab(html)).toBe('Équipes')
    expect(html).toContain('<span class="row-name">Alice &amp; Bob</span>')
    expect(html).toContain('<span class="row-name">Chloé &amp; Dan</span>')
    expect(html).toContain('href="#/duo/alice+bob"')
    expect(html).toContain('href="#/duo/chloe+dan"')
    expect(html).toContain('href="#/duo/bob+dan"')
    expect(html).toContain('Pas encore classés · classés après 3 matchs')
    expect(html).toContain('1/3 matchs avant d&#x27;être classé')
    expect(html).toContain('badge--medal')
    // The strip counts the 2v2 matches and the classés duos; the curves live in the Stats tab now.
    expect(html).toContain('4 matchs · 2 classés')
    expect(html).not.toContain('href="#/courbes"')
    expect(html).not.toContain('href="#/joueurs/alice"')
  })

  it('lists only the players with a 1v1 match on « 1V1 »', () => {
    const html = renderApp('#/', storeOf(MATCHES, '1v1'))
    expect(checkedTab(html)).toBe('1V1')
    expect(html).toContain('href="#/joueurs/alice"')
    expect(html).toContain('href="#/joueurs/bob"')
    expect(html).toContain('href="#/joueurs/chloe"')
    expect(html).not.toContain('href="#/joueurs/dan"')
    expect(html).not.toContain('href="#/joueurs/eve"')
    expect(html).toContain('2/3 matchs avant d&#x27;être classé')
    expect(html).toContain('3 matchs en 1 contre 1 pour entrer au classement')
    expect(html).toContain('2 matchs · 0 classé')
  })

  it('shows an empty state when the tab has no match', () => {
    const only1v1 = MATCHES.filter((m) => m.teamA.length === 1)
    const only2v2 = MATCHES.filter((m) => m.teamA.length === 2)
    const duos = renderApp('#/', storeOf(only1v1, '2v2'))
    expect(duos).toContain('Aucun match en 2 contre 2 pour l&#x27;instant')
    expect(duos).not.toContain('href="#/courbes"')
    expect(renderApp('#/', storeOf(only2v2, '1v1'))).toContain('Aucun match en 1 contre 1 pour l&#x27;instant')
  })
})

describe('Duo page', () => {
  it('mirrors the player page for the pair (id in any order)', () => {
    const html = renderApp('#/duo/bob+alice', storeOf(MATCHES))
    expect(html).toContain('>Alice &amp; Bob</h1>')
    expect(html).toContain('aria-label="Retour"')
    expect(html).toMatch(/<p class="hero-caption">(1er|2e) sur 2<\/p>/)
    expect(html).toContain('<a href="#/joueurs/alice">Alice</a> &amp; <a href="#/joueurs/bob">Bob</a>')
    expect(html).toContain('class="spark-caption"')
    // Formations: alice at the back 1 V · 1 D (m1, m3), bob at the back 1 V · 0 D (m2).
    expect(html).toContain('Alice arrière · Bob avant</span><span class="tile-value t-num">1 V · 1 D')
    expect(html).toContain('Bob arrière · Alice avant</span><span class="tile-value t-num">1 V · 0 D')
    expect(html).toContain('Fanny mis</span><span class="tile-value t-num">1')
    expect(html).toContain('Bête noire')
    expect(html).toContain('Chloé &amp; Dan · 1 défaite en 3 matchs')
    expect(html).toContain('Victime préférée')
    expect(html).toContain('Chloé &amp; Dan · 2 victoires en 3 matchs')
    expect(html).toContain('href="#/duo/chloe+dan"')
    expect(html).toContain('Derniers matchs')
    expect(html.match(/class="duo-hr duo-hr--a"/g)).toHaveLength(2)
    expect(html.match(/class="duo-hr duo-hr--b"/g)).toHaveLength(1)
    expect(html).not.toContain('Renommer')
    expect(html).not.toContain('Supprimer')
    expect(html).not.toContain('Partenaire préféré')
  })

  it('renders nothing for a duo that never played (the page redirects like an unknown player)', () => {
    for (const hash of ['#/duo/alice+eve', '#/duo/nope']) {
      const html = renderApp(hash, storeOf(MATCHES))
      expect(html).not.toContain('hero')
      expect(html).toContain('aria-label="Retour"')
    }
  })
})

describe('Player page', () => {
  it('links the favourite partner to the duo page and shows the 1V1 line', () => {
    const html = renderApp('#/joueurs/alice', storeOf(MATCHES))
    expect(html).toContain('Partenaire préféré')
    expect(html).toContain('class="card card-pad partner partner--link" href="#/duo/alice+bob"')
    expect(html).toMatch(/<p class="hero-mode">1V1 : [\d ]+ · pas encore classé<\/p>/)
  })

  it('has no 1V1 line without a 1v1 match', () => {
    expect(renderApp('#/joueurs/dan', storeOf(MATCHES))).not.toContain('hero-mode')
  })

  it('labels the big number « 2V2 mixte »: the 1v1 matches leave it unchanged', () => {
    const html = renderApp('#/joueurs/alice', storeOf(MATCHES))
    const hero = /<p class="hero-kicker">2V2 mixte<\/p><div class="hero-rating t-display">([^<]*)<\/div>/.exec(html)
    expect(hero).not.toBeNull()
    const without = renderApp('#/joueurs/alice', storeOf(MATCHES.filter((m) => m.teamA.length === 2)))
    expect(without).toContain(`<div class="hero-rating t-display">${hero?.[1]}</div>`)
    expect(html).toContain('Pas encore classé · 4/10 matchs')
  })

  it('counts every match in the tiles and lists the 1v1 ones among the last matches', () => {
    const html = renderApp('#/joueurs/alice', storeOf(MATCHES))
    // Alice played the four 2v2 and both 1v1: the tiles count all six.
    expect(html).toContain('<span class="tile-label">Matchs</span><span class="tile-value t-num">6</span>')
    expect(html).toContain('href="#/historique/m4"')
    expect(html).toContain('href="#/historique/m5"')
  })

  it('shows the stats of a player who only played 1v1, with an empty 2V2 mixte', () => {
    const html = renderApp('#/joueurs/alice', storeOf(MATCHES.filter((m) => m.teamA.length === 1)))
    expect(html).not.toContain('Aucun match pour l&#x27;instant.')
    expect(html).toContain('Pas encore classé · 0/10 matchs')
    expect(html).toContain('<span class="tile-label">Matchs</span><span class="tile-value t-num">2</span>')
    expect(html).toContain('Derniers matchs')
  })
})

/** The checked option of the 2V2 mixte | Équipes | 1V1 selector (the Stats segments come first on #/courbes). */
function checkedMode(html: string): string | undefined {
  return checkedTab(html.split('class="content courbes-mode"')[1] ?? '')
}

describe('Courbes per tab', () => {
  it('draws the duos when « Équipes » is selected', () => {
    const html = renderApp('#/courbes', storeOf(MATCHES, '2v2'))
    expect(checkedMode(html)).toBe('Équipes')
    expect(html).toContain('<span class="curve-chip__name">Alice &amp; Bob</span>')
    expect(html).not.toContain('<span class="curve-chip__name">Alice</span>')
    expect(html).toContain('aria-label="Évolution du classement de 3 duos"')
  })

  it('draws the 1v1 players when « 1V1 » is selected, the main ranking otherwise', () => {
    const solo = renderApp('#/courbes', storeOf(MATCHES, '1v1'))
    expect(checkedMode(solo)).toBe('1V1')
    expect(solo).toContain('<span class="curve-chip__name">Chloé</span>')
    expect(solo).not.toContain('<span class="curve-chip__name">Dan</span>')
    const mixte = renderApp('#/courbes', storeOf(MATCHES))
    expect(checkedMode(mixte)).toBe('2V2 mixte')
    expect(mixte).toContain('<span class="curve-chip__name">Dan</span>')
  })
})

describe('Historique', () => {
  /** The row of match `id`: from its link to the end of the row. */
  function rowOf(html: string, id: string): string {
    const start = html.indexOf(`href="#/historique/${id}"`)
    return html.slice(start, html.indexOf('</a>', start))
  }

  it('shows each match with the deltas of its own ranking: 1V1 for a 1v1, 2V2 mixte for a 2v2', () => {
    const html = renderApp('#/historique', storeOf(MATCHES))
    const rankings = replayRankings(PLAYERS, MATCHES, new Date())
    for (const id of ['m1', 'm4', 'm5', 'm6']) {
      const row = rowOf(html, id)
      for (const entry of rankings.byMatch.get(id)?.perPlayer ?? []) expect(row).toContain(`>${fmtDelta(entry.delta)}<`)
    }
    // m4 is Alice's first 1v1: 16 × 1,5 (10-5) × 50 % × débutant ×3 = +36, whatever her 2v2 before.
    expect(rowOf(html, 'm4')).toContain(`>${fmtDelta(36)}<`)
  })
})
