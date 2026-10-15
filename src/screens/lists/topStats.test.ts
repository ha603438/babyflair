import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import App from '../../App'
import { replay } from '../../rating'
import { topRecords } from '../../records'
import type { Match, Player, RankingTab, Store } from '../../types'
import { TopStatsView } from './TopStatsView'

// Server-rendered checks of the Top stats page (`#/top`) and its entry on Classement (vitest runs in node, no DOM).
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

describe('Top stats page', () => {
  it('groups the 13 record cards under the five section headers, after a one-line intro', () => {
    const html = renderPage(MATCHES)
    expect(html).toContain('Tous les matchs depuis le début (5 matchs), invités compris.')
    const headers = [...html.matchAll(/<span class="section-header-title">([^<]*)<\/span>/g)].map((m) => m[1])
    expect(headers).toEqual(['Postes', 'Séries', 'Fanny et comebacks', 'Points', 'Fidélité'])
    expect(html.match(/<section class="card record">/g)).toHaveLength(13)
    const titles = [...html.matchAll(/<h3 class="record-title">([^<]*)<\/h3>/g)].map((m) => m[1])
    expect(titles).toEqual([
      'Meilleur avant',
      'Meilleur arrière',
      'Plus longue série de victoires',
      'Plus longue série de défaites',
      'Roi du fanny',
      'Abonné au fanny',
      'Roi du comeback',
      'Record de points',
      'Plus gros exploit',
      'Plus gros gain en un match',
      'Le plus assidu',
      'Duo inséparable',
      'Plus grosse rivalité',
    ])
    expect(cardOf(html, 'Meilleur avant')).toContain('Taux de victoire à l’avant, 5 matchs minimum')
  })

  it('shows a muted line with the minimum when nobody qualifies', () => {
    const html = renderPage(MATCHES)
    const empty = `<p class="record-empty">Pas encore assez de matchs${NNBSP}: 5 minimum à ce poste</p>`
    expect(cardOf(html, 'Meilleur avant')).toContain(empty)
    expect(cardOf(html, 'Meilleur arrière')).toContain(empty)
    expect(cardOf(html, 'Roi du comeback')).toContain(`Pas encore de comeback${NNBSP}: 1 minimum`)
    expect(cardOf(html, 'Roi du comeback')).not.toContain('class="podium"')
    const solo = renderPage([match(1, 3, ['alice'], ['bob'], 10, 5)])
    expect(cardOf(solo, 'Duo inséparable')).toContain(`Pas encore de match en 2 contre 2${NNBSP}: 1 minimum`)
    expect(cardOf(solo, 'Plus longue série de victoires')).toContain(
      `Pas encore de série${NNBSP}: 2 victoires d’affilée minimum`,
    )
  })

  it('renders the podium: 1st emphasised, ex æquo sharing the medal, days only and « en cours »', () => {
    const streaks = cardOf(renderPage(MATCHES), 'Plus longue série de victoires')
    expect(streaks).toContain(
      '<a class="podium-entry podium-entry--first podium-entry--link" href="#/joueurs/alice">' +
        '<span class="badge badge--medal badge--gold">1</span>',
    )
    expect(streaks).toContain('<span class="podium-name">Alice</span>')
    expect(streaks).toContain('<span class="podium-value">2 victoires</span>')
    expect(streaks).toContain(`<span class="podium-detail">le 9${NBSP}oct.</span>`)
    expect(streaks).toContain('<span class="pill pill--ongoing">en cours</span>')
    // Bob, ex æquo on a small line: same medal, his run's days, not running any more.
    expect(streaks.match(/badge--gold">1</g)).toHaveLength(2)
    expect(streaks).toContain('<a class="podium-entry podium-entry--link" href="#/joueurs/bob">')
    expect(streaks).toContain(`du 3 au 5${NBSP}oct.`)
    expect(streaks.match(/en cours/g)).toHaveLength(1)
  })

  it('links duo records to the duo page and match records to the match', () => {
    const html = renderPage(MATCHES)
    const duo = cardOf(html, 'Duo inséparable')
    expect(duo).toContain('href="#/duo/alice+bob"')
    expect(duo).toContain('<span class="podium-name">Alice &amp; Bob</span>')
    expect(duo).toContain('href="#/duo/chloe+dan"')
    expect(duo).toContain('<span class="podium-value">4 matchs</span>')
    expect(duo).toContain('3 V · 1 D')
    const exploit = cardOf(html, 'Plus gros exploit')
    expect(exploit).toContain('href="#/historique/m3"')
    expect(exploit).toContain('<span class="podium-name">Chloé &amp; Dan</span>')
    expect(exploit).toMatch(new RegExp(`<span class="podium-value">\\d+${NNBSP}% de chances</span>`))
    expect(cardOf(html, 'Plus gros gain en un match')).toMatch(/href="#\/historique\/m\d"/)
    expect(cardOf(html, 'Record de points')).toMatch(/href="#\/joueurs\/alice"[^]*\d points</)
  })

  it('makes each opponent of a rivalry its own link, with the head-to-head', () => {
    const rivalry = cardOf(renderPage(MATCHES), 'Plus grosse rivalité')
    expect(rivalry).toContain(
      '<div class="podium-entry podium-entry--first"><span class="badge badge--medal badge--gold">1</span>' +
        '<span class="podium-body"><span class="podium-name"><a href="#/joueurs/alice">Alice</a> – ' +
        '<a href="#/joueurs/chloe">Chloé</a></span>',
    )
    expect(rivalry).toContain('<span class="podium-value">5 matchs</span>')
    expect(rivalry).toContain('<span class="podium-detail">4–1</span>')
  })

  it('counts the ex æquo left out of the podium', () => {
    const played = cardOf(renderPage(MATCHES), 'Le plus assidu')
    // Alice and Chloé 5 matches, Bob and Dan 4: the 3rd place is shared with Dan.
    expect(played.match(/badge--gold">1</g)).toHaveLength(2)
    expect(played).toContain('badge--bronze">3<')
    expect(played).toContain('<p class="podium-more">+ 1 autre ex æquo</p>')
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

describe('Top stats entry and route', () => {
  it('links « 🏅 Top stats » from Classement next to « 📈 Courbes » once there is a match', () => {
    const html = renderApp('#/', storeOf(MATCHES))
    expect(html).toContain('href="#/top"')
    expect(html).toContain('🏅 Top stats')
    expect(html.indexOf('href="#/courbes"')).toBeLessThan(html.indexOf('href="#/top"'))
    expect(renderApp('#/', storeOf([]))).not.toContain('href="#/top"')
  })

  it('stays on the 1V1 tab without 1v1 match: the records cover every match', () => {
    const html = renderApp('#/', storeOf(MATCHES.filter((m) => m.teamA.length === 2), '1v1'))
    expect(html).not.toContain('href="#/courbes"')
    expect(html).toContain('href="#/top"')
  })

  it('opens as a pushed screen titled « Top stats », the Classement tab staying active', () => {
    const html = renderApp('#/top', storeOf(MATCHES))
    expect(html).toContain('>Top stats</h1>')
    expect(html).toContain('aria-label="Retour"')
    expect(html).toContain('<h3 class="record-title">Meilleur avant</h3>')
    const tabs = html.match(/<a [^>]*class="tab[^"]*"[^>]*>/g) ?? []
    expect(tabs[0]).toContain('aria-current="page"')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
  })
})
