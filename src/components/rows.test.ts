// Lists group, part 2: Delta and the ListRow wrappers (RankRow, PlayerRow, HistoryRow, SettingRow), plus
// MatchSummary. These depend on src/format.ts and src/stats.ts; assertions on French numbers tolerate any
// whitespace variant so a formatter detail never fails a layout test.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Match, MatchResult, Player, PlayerId, PlayerStats } from '../types'
import { Delta } from './Delta'
import { MatchSummary } from './MatchSummary'
import { HistoryRow, PlayerRow, RankRow, SettingRow } from './rows'

const MINUS = '−'
const now = new Date('2025-10-08T12:00:00.000Z')
const noop = () => {}

function isoDaysAgo(days: number, hours = 0): string {
  return new Date(now.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString()
}

function player(id: string, name: string, isGuest = false): Player {
  return { id, name, isGuest, createdAt: isoDaysAgo(100) }
}

function stats(playerId: PlayerId, patch: Partial<PlayerStats> = {}): PlayerStats {
  return {
    playerId,
    rating: 1026,
    played: 20,
    wins: 12,
    losses: 8,
    lastPlayedAt: isoDaysAgo(1),
    status: 'ranked',
    rookieProgress: 10,
    history: [],
    ...patch,
  }
}

const alice = player('a', 'Alice')
const bob = player('b', 'Bob', true)
const chloe = player('c', 'Chloé')
const dan = player('d', 'Dan')
const players = new Map<PlayerId, Player>([alice, bob, chloe, dan].map((p) => [p.id, p]))

const match: Match = {
  id: 'm1',
  seq: 1,
  playedAt: '2025-10-06T10:42:00.000Z',
  createdAt: '2025-10-06T10:42:00.000Z',
  updatedAt: '2025-10-06T10:42:00.000Z',
  target: 10,
  teamA: ['c', 'd'],
  teamB: ['a', 'b'],
  scoreA: 8,
  scoreB: 10,
}

const whyA = 'Attendu 28 % de victoire, gagné 10-8 (×1,1 écart) : +16'
const whyC = `Attendu 72 % de victoire, perdu 8-10 (×1,1 écart) : ${MINUS}13`

const result: MatchResult = {
  matchId: 'm1',
  expectedA: 0.72,
  expectedB: 0.28,
  perPlayer: [
    { playerId: 'c', team: 'A', before: 1050, after: 1037, delta: -13, why: whyC },
    { playerId: 'd', team: 'A', before: 1040, after: 1030, delta: -10, why: 'why d' },
    { playerId: 'a', team: 'B', before: 1012, after: 1028, delta: 16, why: whyA },
    { playerId: 'b', team: 'B', before: 990, after: 1011, delta: 21, why: 'why b' },
  ],
}

function rankRow(props: Partial<Parameters<typeof RankRow>[0]> & { variant: 'ranked' | 'rookie' | 'inactive' }) {
  return renderToStaticMarkup(
    createElement(RankRow, { player: alice, stats: stats('a'), now, href: '#/joueurs/a', ...props }),
  )
}

function playerRow(props: Partial<Parameters<typeof PlayerRow>[0]> = {}) {
  return renderToStaticMarkup(createElement(PlayerRow, { player: alice, now, href: '#/joueurs/a', ...props }))
}

function historyRow(props: Partial<Parameters<typeof HistoryRow>[0]> = {}) {
  return renderToStaticMarkup(createElement(HistoryRow, { match, result, players, href: '#/historique/m1', ...props }))
}

function summary(props: Partial<Parameters<typeof MatchSummary>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(MatchSummary, { match, result, players, dateLine: 'lun. 6 oct. · 12:42 · en 10', ...props }),
  )
}

describe('Delta', () => {
  it('formats with a true minus, colours by sign and carries an aria-label', () => {
    const pos = renderToStaticMarkup(createElement(Delta, { value: 16, size: 17 }))
    expect(pos).toBe('<span class="delta delta--17 pos" aria-label="plus 16 points">+16</span>')

    const neg = renderToStaticMarkup(createElement(Delta, { value: -9 }))
    expect(neg).toContain('class="delta delta--15 neg"')
    expect(neg).toContain(`aria-label="moins 9 points"`)
    expect(neg).toContain(`>${MINUS}9<`)

    const zero = renderToStaticMarkup(createElement(Delta, { value: 0, size: 13 }))
    expect(zero).toContain('delta--13 muted')
    expect(zero).toContain('>±0<')
  })

  it('appends the suffix to both the text and the aria-label', () => {
    const html = renderToStaticMarkup(createElement(Delta, { value: 23, size: 13, suffix: '· 7 j' }))
    expect(html).toContain('>+23 · 7 j<')
    expect(html).toContain('aria-label="plus 23 points · 7 j"')
  })
})

describe('RankRow', () => {
  it('ranked: medal for the top 3, record + win rate, rating and 7-day trend', () => {
    const history = [{ matchId: 'm1', playedAt: isoDaysAgo(1), ratingBefore: 1003, ratingAfter: 1026, delta: 23 }]
    const html = rankRow({ stats: stats('a', { history }), variant: 'ranked', rank: 1 })
    expect(html).toContain('href="#/joueurs/a"')
    expect(html).toContain('row--rank')
    expect(html).toContain('badge--gold">1<')
    expect(html).toMatch(/12 V · 8 D · 60\s%/)
    expect(html).toContain('class="rating">1')
    expect(html).toMatch(/1\s026/)
    expect(html).toContain('>+23 · 7 j<')
    expect(html).not.toContain('row--inactive')
  })

  it('ranked: plain rank number from 4th, no trend without a match in 7 days', () => {
    const html = rankRow({ variant: 'ranked', rank: 4 })
    expect(html).toContain('<span class="rank-num">4</span>')
    expect(html).not.toContain('badge--medal')
    expect(html).not.toContain('7 j')
  })

  it('rookie: « ? » badge, progress line, dimmed rating, guest pill next to the name', () => {
    const s = stats('b', { played: 3, wins: 1, losses: 2, status: 'rookie', rookieProgress: 3 })
    const html = rankRow({ player: bob, stats: s, variant: 'rookie', href: '#/joueurs/b' })
    expect(html).toContain('badge--rookie')
    expect(html).toMatch(/3\/10 matchs avant d(&#x27;|')être classé/)
    expect(html).toContain('rating rating--2')
    expect(html).toContain('>invité<')
  })

  it('inactive: dash, days since last match, opacity class, no trend; rookie keeps the « ? »', () => {
    const s = stats('c', { status: 'inactive', lastPlayedAt: isoDaysAgo(42, 3), history: [] })
    const html = rankRow({ player: chloe, stats: s, variant: 'inactive', href: '#/joueurs/c' })
    expect(html).toContain('row--inactive')
    expect(html).toContain('rank-dash">–<')
    expect(html).toContain('Dernier match il y a 42 j')
    expect(html).toContain('rating rating--3')
    expect(html).not.toContain('7 j')

    const rookieInactive = stats('c', {
      status: 'inactive',
      rookieProgress: 4,
      played: 4,
      lastPlayedAt: isoDaysAgo(40),
    })
    const html2 = rankRow({ player: chloe, stats: rookieInactive, variant: 'inactive', href: '#/joueurs/c' })
    expect(html2).toContain('badge--rookie')
    expect(html2).not.toContain('rank-dash')
  })

  it('adds the flash class when highlighted', () => {
    expect(rankRow({ variant: 'ranked', rank: 5, highlight: true })).toContain('row--flash')
  })
})

describe('PlayerRow', () => {
  it('shows rating · matches for ranked players', () => {
    const html = playerRow({ stats: stats('a') })
    expect(html).toMatch(/1\s026 · 20 matchs/)
    expect(html).not.toContain('badge--rookie')
  })

  it('shows the rookie progress with the « ? » badge', () => {
    const html = playerRow({ stats: stats('a', { status: 'rookie', played: 4, rookieProgress: 4 }) })
    expect(html).toContain('4/10 matchs')
    expect(html).toContain('badge--rookie')
  })

  it('shows inactivity and the no-match line', () => {
    const inactive = stats('a', { status: 'inactive', lastPlayedAt: isoDaysAgo(42, 1) })
    expect(playerRow({ stats: inactive })).toContain('inactif depuis 42 j')

    const fresh = stats('a', {
      played: 0,
      wins: 0,
      losses: 0,
      rookieProgress: 0,
      status: 'rookie',
      lastPlayedAt: undefined,
    })
    expect(playerRow({ stats: fresh })).toContain('Aucun match')
    expect(playerRow()).toContain('Aucun match')
  })
})

describe('HistoryRow', () => {
  it('shows Blancs left, the score, Noirs right, one line per player with its delta, and no chevron', () => {
    const html = historyRow()
    expect(html.startsWith('<a class="row row-divider row--tap row--history" href="#/historique/m1"')).toBe(true)
    expect(html).toMatch(/<time class="hr-time" datetime="[^"]+">\d{2}:\d{2}<\/time>/i)
    // team A (Chloé, Dan) on the left, team B (Alice, Bob) on the right, every name in full
    const order = ['Chloé', 'Dan', 'Alice', 'Bob'].map((n) => html.indexOf(`class="hr-name">${n}<`))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toContain('class="hr-team hr-team--b is-winner"')
    expect(html).toContain('class="hr-s">8<')
    expect(html).toContain('class="hr-s hr-s--win">10<')
    expect(html).toContain(`aria-label="moins 13 points">${MINUS}13<`)
    expect(html).not.toContain('row-chevron')
    expect(html).not.toContain('pill')
    expect(html).not.toContain('modifié')
  })

  it('shows the « en 5 » pill and « modifié » when relevant', () => {
    const edited: Match = { ...match, target: 5, scoreA: 5, scoreB: 3, updatedAt: '2025-10-07T09:00:00.000Z' }
    const html = historyRow({ match: edited })
    expect(html).toContain('class="pill">en 5<')
    expect(html).toContain('class="hr-edited">modifié<')
    expect(html).toContain('class="hr-team hr-team--a is-winner"')
  })

  it('highlights the player of the page', () => {
    expect(historyRow({ emphasisId: 'a' })).toContain('class="hr-p is-me"><span class="hr-name">Alice<')
  })

  it('shows a « fanny » pill when the loser scored 0, in 5 or in 10', () => {
    const inFive = historyRow({ match: { ...match, target: 5, scoreA: 0, scoreB: 5 } })
    expect(inFive).toContain('class="pill">en 5</span><span class="pill">fanny<')
    expect(historyRow({ match: { ...match, scoreA: 0 } })).toContain('class="pill">fanny<')
    expect(historyRow({ match: { ...match, scoreA: 1 } })).not.toContain('fanny')
  })

  it('shows the accent « comeback » pill on a flagged 5-4 only', () => {
    const flagged: Match = { ...match, target: 5, scoreA: 4, scoreB: 5, comeback: true }
    const html = historyRow({ match: flagged })
    expect(html).toContain('class="pill">en 5</span><span class="pill pill--comeback">comeback<')
    expect(html).not.toContain('fanny')
    expect(historyRow({ match: { ...flagged, comeback: false } })).not.toContain('comeback')
    expect(historyRow({ match: { ...flagged, scoreA: 3 } })).not.toContain('comeback')
  })

  it('shows names without deltas when there is no result', () => {
    const html = historyRow({ result: undefined })
    expect(html).toContain('class="hr-name">Alice<')
    expect(html).not.toContain('class="delta')
  })
})

describe('SettingRow', () => {
  it('renders title, caption, chevron and the danger / warn tones', () => {
    const html = renderToStaticMarkup(
      createElement(SettingRow, {
        title: 'Exporter les données',
        caption: 'Fichier JSON · jamais exporté',
        captionWarn: true,
        onClick: noop,
      }),
    )
    expect(html.startsWith('<button type="button"')).toBe(true)
    expect(html).toContain('row--setting')
    expect(html).toContain('class="row-sub--warn">Fichier JSON · jamais exporté<')

    const danger = renderToStaticMarkup(
      createElement(SettingRow, { title: 'Tout effacer', danger: true, onClick: noop }),
    )
    expect(danger).toContain('row--danger')

    const link = renderToStaticMarkup(
      createElement(SettingRow, { title: 'Comment ça marche', chevron: true, href: '#/comment-ca-marche' }),
    )
    expect(link).toContain('href="#/comment-ca-marche"')
    expect(link).toContain('row-chevron')
  })
})

describe('MatchSummary', () => {
  it('renders the date line, the hero with winners first and the why lines verbatim', () => {
    const html = summary()
    expect(html).toContain('class="ms-date">lun. 6 oct. · 12:42 · en 10<')
    expect(html).toContain('aria-label="Alice &amp; Bob 10 – 8 Chloé &amp; Dan"')
    expect(html).toContain('class="ms-score">10</div><div class="ms-team">Alice &amp; Bob</div>')
    expect(html).toContain('class="ms-score">8</div><div class="ms-team ms-team--loser">Chloé &amp; Dan</div>')
    expect(html).toContain(`class="ms-why">${whyA}<`)
    expect(html).toContain(`class="ms-why">${whyC}<`)
    expect(html).toContain('delta delta--17 pos" aria-label="plus 16 points">+16<')
    // rows are winners first
    expect(html.indexOf('>Alice<')).toBeLessThan(html.indexOf('>Chloé<'))
    expect(html).toContain('>invité<')
  })

  it('shows only the rating movement without both rank maps', () => {
    const html = summary({ rankBefore: new Map([['a', 5]]) })
    expect(html).toMatch(/class="ms-move">1\s012 → 1\s028</)
    expect(html).not.toContain('5e')
  })

  it('shows every rank movement variant', () => {
    const byPlayer = new Map<PlayerId, PlayerStats>([
      ['a', stats('a', { rating: 1028, played: 15 })],
      ['b', stats('b', { rating: 1011, played: 4, status: 'rookie', rookieProgress: 4 })],
      ['c', stats('c', { rating: 1037, played: 10 })],
      ['d', stats('d', { rating: 1030, played: 20 })],
    ])
    const rankBefore = new Map<PlayerId, number>([['a', 5]])
    const rankAfter = new Map<PlayerId, number>([
      ['a', 3],
      ['c', 9],
      ['d', 7],
    ])
    const html = summary({ byPlayer, rankBefore, rankAfter })
    expect(html).toMatch(/1\s012 → 1\s028 · 5e → 3e/)
    expect(html).toMatch(/990 → 1\s011 · 4\/10 matchs/)
    expect(html).toMatch(/1\s050 → 1\s037 · classé : 9e/)
    expect(html).toMatch(/1\s040 → 1\s030 · de retour dans le classement/)
    expect(html).toContain('badge--rookie')
  })

  it('adds the fanny / comeback pills after the date line, none for an ordinary match', () => {
    const fanny = summary({ match: { ...match, scoreA: 0 } })
    expect(fanny).toContain('· en 10<span class="ms-pills"><span class="pill">fanny<')
    const comeback = summary({ match: { ...match, target: 5, scoreA: 4, scoreB: 5, comeback: true } })
    expect(comeback).toContain('<span class="ms-pills"><span class="pill pill--comeback">comeback</span></span>')
    expect(summary()).not.toContain('ms-pills')
  })

  it('uses « 1er » for the first rank', () => {
    const html = summary({ rankBefore: new Map([['a', 1]]), rankAfter: new Map([['a', 1]]) })
    expect(html).toContain('1er → 1er')
  })
})
