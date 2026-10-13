import { describe, expect, it } from 'vitest'
import type { HistoryPoint, Match, PlayerStats, Ranking } from '../types'
import {
  assignSlot,
  buildChartData,
  chartMatches,
  chipOrder,
  dayLabel,
  dayTicks,
  defaultVisible,
  MAX_CURVES,
  pointAt,
  readingsAt,
  releaseSlot,
  summarize,
  valueAt,
  visibleCurves,
  xDomain,
  yDomain,
  yTicks,
} from './curves'
import type { ChartMatch, Series, Slots } from './curves'

// Midday UTC keeps every fixture on the same local calendar day in any European time zone.
function match(id: string, seq: number, playedAt: string): Match {
  return {
    id,
    seq,
    playedAt,
    createdAt: playedAt,
    updatedAt: playedAt,
    target: 10,
    teamA: [],
    teamB: [],
    scoreA: 10,
    scoreB: 5,
  }
}

function point(matchId: string, playedAt: string, before: number, after: number): HistoryPoint {
  return { matchId, playedAt, ratingBefore: before, ratingAfter: after, delta: Math.round((after - before) * 10) / 10 }
}

function stats(playerId: string, history: HistoryPoint[]): PlayerStats {
  const rating = Math.round(history.at(-1)?.ratingAfter ?? 1000)
  return { playerId, rating, played: history.length, wins: 0, losses: 0, status: 'ranked', rookieProgress: 10, history }
}

const D1 = '2026-10-12T12:00:00.000Z'
const D1_LATER = '2026-10-12T13:00:00.000Z'
const D2 = '2026-10-13T12:00:00.000Z'

// m3 is stored with an earlier playedAt than m2 (an edited date): the replay order is m1, m3, m2, m4.
const MATCHES = new Map<string, Match>([
  ['m1', match('m1', 1, D1)],
  ['m2', match('m2', 2, D1_LATER)],
  ['m3', match('m3', 3, D1)],
  ['m4', match('m4', 4, D2)],
])

const BY_PLAYER = new Map<string, PlayerStats>([
  [
    'alice',
    stats('alice', [point('m1', D1, 1000, 1016.4), point('m3', D1, 1016.4, 1030), point('m4', D2, 1030, 1022)]),
  ],
  ['bob', stats('bob', [point('m1', D1, 1000, 983.6), point('m2', D1_LATER, 983.6, 1001)])],
  ['chloe', stats('chloe', [point('m3', D1, 1000, 986.4)])],
  ['dan', stats('dan', [])],
])

const RANKING: Ranking = { ranked: ['alice', 'bob'], rookies: ['chloe', 'dan'], inactive: [] }

function seriesOf(points: Array<[number, number]>): Series {
  return {
    playerId: 'p',
    points: points.map(([x, rating], i) => ({ x, rating, delta: i === 0 ? null : 1 })),
  }
}

describe('chartMatches', () => {
  it('numbers the matches 1..N in replay order: playedAt, then seq, then id', () => {
    expect(chartMatches(BY_PLAYER, MATCHES)).toEqual([
      { id: 'm1', index: 1, playedAt: D1 },
      { id: 'm3', index: 2, playedAt: D1 },
      { id: 'm2', index: 3, playedAt: D1_LATER },
      { id: 'm4', index: 4, playedAt: D2 },
    ])
  })

  it('falls back to the history date for a match missing from the store', () => {
    const byPlayer = new Map([['x', stats('x', [point('ghost', D2, 1000, 1010), point('m1', D1, 1010, 1020)])]])
    expect(chartMatches(byPlayer, MATCHES).map((m) => m.id)).toEqual(['m1', 'ghost'])
  })
})

describe('buildChartData', () => {
  const data = buildChartData(BY_PLAYER, MATCHES)

  it('starts each series half a match before the first one, at its ratingBefore', () => {
    expect(data.series.get('alice')?.points).toEqual([
      { x: 0.5, rating: 1000, delta: null },
      { x: 1, rating: 1016.4, delta: 16.4 },
      { x: 2, rating: 1030, delta: 13.6 },
      { x: 4, rating: 1022, delta: -8 },
    ])
    expect(data.series.get('chloe')?.points).toEqual([
      { x: 1.5, rating: 1000, delta: null },
      { x: 2, rating: 986.4, delta: -13.6 },
    ])
  })

  it('places each point at the global match index, gaps included', () => {
    expect(data.series.get('bob')?.points.map((p) => p.x)).toEqual([0.5, 1, 3])
  })

  it('leaves out players without matches', () => {
    expect(data.series.has('dan')).toBe(false)
    expect(data.matches).toHaveLength(4)
  })
})

describe('domains and ticks', () => {
  it('x runs from 0.5 to the match count', () => {
    expect(xDomain(23)).toEqual({ min: 0.5, max: 23 })
    expect(xDomain(0)).toEqual({ min: 0.5, max: 1 })
  })

  it('pads the y domain to round tens and always includes 1000', () => {
    expect(yDomain([seriesOf([[0.5, 1000], [1, 1016], [2, 990]])])).toEqual({ min: 980, max: 1030 })
    const above = yDomain([seriesOf([[0.5, 1100], [1, 1180]])])
    expect(above.min).toBeLessThanOrEqual(1000)
    expect(above.max).toBeGreaterThanOrEqual(1180)
    expect(above.min % 10).toBe(0)
    expect(above.max % 10).toBe(0)
  })

  it('keeps a minimum height and a default frame with no visible series', () => {
    expect(yDomain([])).toEqual({ min: 980, max: 1020 })
    expect(yDomain([seriesOf([[0.5, 1000], [1, 1004]])])).toEqual({ min: 980, max: 1020 })
  })

  it('uses only the visible series', () => {
    const low = seriesOf([[0.5, 1000], [1, 900]])
    const high = seriesOf([[0.5, 1000], [1, 1060]])
    expect(yDomain([high]).min).toBeGreaterThan(900)
    expect(yDomain([low, high]).min).toBeLessThanOrEqual(900)
  })

  it('draws 4–5 gridlines on a nice step, 1000 among them', () => {
    expect(yTicks({ min: 980, max: 1030 })).toEqual([980, 1000, 1020])
    expect(yTicks({ min: 960, max: 1070 })).toEqual([975, 1000, 1025, 1050])
    expect(yTicks({ min: 980, max: 1020 })).toEqual([980, 990, 1000, 1010, 1020])
    for (const domain of [{ min: 870, max: 1240 }, { min: 600, max: 1400 }, { min: 990, max: 1310 }]) {
      const ticks = yTicks(domain)
      expect(ticks.length).toBeLessThanOrEqual(5)
      expect(ticks.length).toBeGreaterThanOrEqual(3)
      expect(ticks).toContain(1000)
    }
  })

  it('puts a day tick on the first match of each local calendar day', () => {
    const matches: ChartMatch[] = chartMatches(BY_PLAYER, MATCHES)
    expect(dayTicks(matches)).toEqual([
      { index: 1, label: '12 oct.' },
      { index: 4, label: '13 oct.' },
    ])
    expect(dayLabel('2026-05-03T12:00:00.000Z')).toBe('3 mai')
    expect(dayLabel('pas une date')).toBe('')
  })
})

describe('reading values', () => {
  const bob = buildChartData(BY_PLAYER, MATCHES).series.get('bob') as Series

  it('valueAt is the last known rating at or before x, null before the first match', () => {
    const late = buildChartData(BY_PLAYER, MATCHES).series.get('chloe') as Series
    expect(valueAt(late, 1)).toBeNull()
    expect(valueAt(late, 2)).toBe(986.4)
    expect(valueAt(late, 4)).toBe(986.4)
    expect(valueAt(bob, 1)).toBe(983.6)
    expect(valueAt(bob, 2)).toBe(983.6)
    expect(valueAt(bob, 3)).toBe(1001)
  })

  it('pointAt only returns a match the player played', () => {
    expect(pointAt(bob, 3)?.delta).toBeCloseTo(17.4)
    expect(pointAt(bob, 2)).toBeNull()
    expect(pointAt(bob, 0.5)).toBeNull()
  })

  it('summarizes current, highest, lowest (start included) and matches played', () => {
    expect(summarize(bob)).toEqual({ current: 1001, high: 1001, low: 984, played: 2 })
  })

  it('reads every visible player at the crosshair, best first, with the delta when he played', () => {
    const data = buildChartData(BY_PLAYER, MATCHES)
    const visible: Slots = new Map([['alice', 1], ['bob', 2], ['chloe', 3]])
    const curves = visibleCurves(visible, data, (id) => id.toUpperCase())
    expect(readingsAt(curves, 1)).toEqual([
      { playerId: 'alice', name: 'ALICE', slot: 1, rating: 1016.4, delta: 16.4 },
      { playerId: 'bob', name: 'BOB', slot: 2, rating: 983.6, delta: expect.closeTo(-16.4) },
    ])
    expect(readingsAt(curves, 3).map((r) => [r.playerId, r.delta === null])).toEqual([
      ['alice', true],
      ['bob', false],
      ['chloe', true],
    ])
  })
})

describe('visible players and slots', () => {
  const series = buildChartData(BY_PLAYER, MATCHES).series

  it('orders the chips like the ranking, players with matches only', () => {
    expect(chipOrder({ ranked: ['bob'], rookies: ['dan', 'alice'], inactive: ['chloe'] }, series)).toEqual([
      'bob',
      'alice',
      'chloe',
    ])
  })

  it('opens on the top 3 (classés, then débutants) in slots 1..3', () => {
    expect([...defaultVisible(RANKING, series)]).toEqual([
      ['alice', 1],
      ['bob', 2],
      ['chloe', 3],
    ])
    expect([...defaultVisible({ ranked: [], rookies: [], inactive: ['alice'] }, series)]).toEqual([])
  })

  it('gives the first free slot and never repaints the others', () => {
    let visible: Slots = new Map([['a', 1], ['b', 2], ['c', 3]])
    visible = releaseSlot(visible, 'b')
    expect([...visible]).toEqual([['a', 1], ['c', 3]])
    visible = assignSlot(visible, 'd') as Slots
    expect(visible.get('d')).toBe(2)
    expect(visible.get('a')).toBe(1)
    expect(visible.get('c')).toBe(3)
    visible = assignSlot(visible, 'e') as Slots
    expect(visible.get('e')).toBe(4)
  })

  it('is a no-op for a player already on (assign) or already off (release)', () => {
    const visible: Slots = new Map([['a', 5]])
    expect(assignSlot(visible, 'a')).toBe(visible)
    expect(releaseSlot(visible, 'z')).toBe(visible)
  })

  it('refuses a 9th curve', () => {
    let visible: Slots = new Map()
    for (let i = 1; i <= MAX_CURVES; i += 1) visible = assignSlot(visible, `p${i}`) as Slots
    expect([...visible.values()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(assignSlot(visible, 'p9')).toBeNull()
  })

  it('lists the visible curves by slot, skipping players without a series', () => {
    const data = buildChartData(BY_PLAYER, MATCHES)
    const visible: Slots = new Map([['chloe', 2], ['dan', 3], ['alice', 1]])
    expect(visibleCurves(visible, data, (id) => id).map((c) => [c.playerId, c.slot])).toEqual([
      ['alice', 1],
      ['chloe', 2],
    ])
  })
})
