import { describe, expect, it } from 'vitest'
import { rank, replay } from './rating'
import { groupByDay, localDayKey, recap, RECAP_DAYS_STEP, winnersFirst } from './recap'
import type { Match, MatchId, MatchResult, Player, PlayerId, ReplayResult, Target } from './types'

// Récap (src/recap.ts): day grouping on the local calendar, the last days with matches, and each highlight's rule and
// tie-breaks. Highlights other than « Nouveau n°1 » read only the per-match deltas and chances, so most cases use a
// hand-made result; the leader change runs the real replay. Dates are built in local time (TZ-independent).

const PLAYERS: Player[] = [
  { id: 'alice', name: 'Alice', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'bob', name: 'Bob', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'chloe', name: 'Chloé', isGuest: true, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'dan', name: 'Dan', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'eve', name: 'Eve', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
]

let seq = 0

type MatchSpec = {
  day: number
  hour?: number
  minute?: number
  a: PlayerId[]
  b: PlayerId[]
  score: [number, number]
  target?: Target
  comeback?: boolean
}

/** A match on October `day` 2026, local time (12:00 by default); ids follow the creation order. */
function match({ day, hour = 12, minute = 0, a, b, score, target = 10, comeback }: MatchSpec): Match {
  seq += 1
  const at = new Date(2026, 9, day, hour, minute).toISOString()
  const base = { id: `m${seq}`, seq, playedAt: at, createdAt: at, updatedAt: at, target, teamA: a, teamB: b }
  const played: Match = { ...base, scoreA: score[0], scoreB: score[1] }
  if (comeback === undefined) return played
  return { ...played, comeback }
}

type Fake = { deltas?: Record<PlayerId, number>; expectedA?: number }

/** A replay result with the given deltas (0 by default) and team A chances (50 % by default); nobody ever ranked. */
function resultOf(matches: Match[], fakes: Record<MatchId, Fake> = {}): ReplayResult {
  const byMatch = new Map<MatchId, MatchResult>()
  for (const m of matches) {
    const fake = fakes[m.id] ?? {}
    const expectedA = fake.expectedA ?? 0.5
    const row = (playerId: PlayerId, team: 'A' | 'B') => {
      const delta = fake.deltas?.[playerId] ?? 0
      return { playerId, team, before: 1000, after: 1000 + delta, delta, why: '' }
    }
    const perPlayer = [...m.teamA.map((id) => row(id, 'A')), ...m.teamB.map((id) => row(id, 'B'))]
    byMatch.set(m.id, { matchId: m.id, expectedA, expectedB: 1 - expectedA, perPlayer, bets: [] })
  }
  return { byPlayer: new Map(), byMatch }
}

/** The single day of a recap over `matches` (all played the same day). */
function dayOf(matches: Match[], fakes: Record<MatchId, Fake> = {}) {
  const { days } = recap(PLAYERS, matches, resultOf(matches, fakes), RECAP_DAYS_STEP)
  expect(days).toHaveLength(1)
  return days[0]
}

describe('days', () => {
  it('groups by local calendar day: 23:30 and 00:30 are two days, most recent first, each in replay order', () => {
    const late = match({ day: 13, hour: 23, minute: 30, a: ['alice'], b: ['bob'], score: [10, 4] })
    const early = match({ day: 14, hour: 0, minute: 30, a: ['alice'], b: ['bob'], score: [10, 5] })
    const noon = match({ day: 13, hour: 12, a: ['chloe'], b: ['dan'], score: [10, 6] })
    const groups = groupByDay([late, early, noon])
    expect(groups.map((group) => group.key)).toEqual(['2026-10-14', '2026-10-13'])
    expect(groups[1].matches.map((m) => m.id)).toEqual([noon.id, late.id])
    expect(localDayKey(late.playedAt)).toBe('2026-10-13')
  })

  it('keeps the last days that have matches (days without one are skipped), 3 at a time', () => {
    const matches = [1, 5, 9, 12].map((day) => match({ day, a: ['alice'], b: ['bob'], score: [10, 3] }))
    const first = recap(PLAYERS, matches, resultOf(matches), RECAP_DAYS_STEP)
    expect(first.days.map((day) => day.key)).toEqual(['2026-10-12', '2026-10-09', '2026-10-05'])
    expect(first.hasMore).toBe(true)
    const all = recap(PLAYERS, matches, resultOf(matches), 2 * RECAP_DAYS_STEP)
    expect(all.days.map((day) => day.key)).toEqual(['2026-10-12', '2026-10-09', '2026-10-05', '2026-10-01'])
    expect(all.hasMore).toBe(false)
  })

  it('is empty without matches', () => {
    expect(recap(PLAYERS, [], resultOf([]), RECAP_DAYS_STEP)).toEqual({ days: [], hasMore: false })
  })

  it('counts the matches, the players and the fannys of the day; the date is a match of that day', () => {
    const matches = [
      match({ day: 14, a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [10, 0] }),
      match({ day: 14, a: ['alice'], b: ['eve'], score: [3, 10] }),
      match({ day: 14, a: ['bob'], b: ['eve'], score: [0, 5], target: 5 }),
    ]
    const day = dayOf(matches)
    expect(day.matches).toHaveLength(3)
    expect(day.playerCount).toBe(5)
    expect(day.fannys.map((m) => m.id)).toEqual([matches[0].id, matches[2].id])
    expect(localDayKey(day.date)).toBe('2026-10-14')
  })
})

describe('« Joueur du jour » and « Dans le dur »', () => {
  it('takes the best and the worst net points of the day (sum of the Mixte deltas), with the day record', () => {
    const m1 = match({ day: 14, a: ['alice'], b: ['bob'], score: [10, 4] })
    const m2 = match({ day: 14, a: ['alice'], b: ['chloe'], score: [6, 10] })
    const m3 = match({ day: 14, a: ['bob'], b: ['chloe'], score: [10, 8] })
    const day = dayOf([m1, m2, m3], {
      [m1.id]: { deltas: { alice: 20, bob: -20 } },
      [m2.id]: { deltas: { alice: -8, chloe: 8 } },
      [m3.id]: { deltas: { bob: 5, chloe: -5 } },
    })
    expect(day.hot).toEqual({ playerId: 'alice', net: 12, wins: 1, losses: 1 })
    expect(day.cold).toEqual({ playerId: 'bob', net: -15, wins: 1, losses: 1 })
  })

  it('breaks a tie on the shown (rounded) points by more wins, then by name', () => {
    const m1 = match({ day: 14, a: ['bob'], b: ['dan'], score: [10, 2] })
    const m2 = match({ day: 14, a: ['bob'], b: ['dan'], score: [10, 2] })
    const m3 = match({ day: 14, a: ['alice'], b: ['eve'], score: [10, 2] })
    const winsTie = dayOf([m1, m2, m3], {
      [m1.id]: { deltas: { bob: 15.2, dan: -10 } },
      [m2.id]: { deltas: { bob: 14.6, dan: -10 } },
      [m3.id]: { deltas: { alice: 30.1, eve: -20 } },
    })
    // Bob 29.8 and Alice 30.1 both show +30: Bob has 2 wins, Alice 1.
    expect(winsTie.hot?.playerId).toBe('bob')
    const nameTie = dayOf([m1, m3], {
      [m1.id]: { deltas: { bob: 30, dan: -20 } },
      [m3.id]: { deltas: { alice: 30, eve: -10 } },
    })
    expect(nameTie.hot?.playerId).toBe('alice')
  })

  it('breaks a tie on the worst points by more losses, then by name', () => {
    const m1 = match({ day: 14, a: ['alice'], b: ['bob'], score: [10, 2] })
    const m2 = match({ day: 14, a: ['alice'], b: ['bob'], score: [10, 2] })
    const m3 = match({ day: 14, a: ['dan'], b: ['eve'], score: [10, 2] })
    const lossesTie = dayOf([m1, m2, m3], {
      [m1.id]: { deltas: { alice: 10, bob: -10 } },
      [m2.id]: { deltas: { alice: 10, bob: -10 } },
      [m3.id]: { deltas: { dan: 10, eve: -20 } },
    })
    expect(lossesTie.cold?.playerId).toBe('bob')
    const nameTie = dayOf([m1, m3], {
      [m1.id]: { deltas: { alice: 10, bob: -20 } },
      [m3.id]: { deltas: { dan: 10, eve: -20 } },
    })
    expect(nameTie.cold?.playerId).toBe('bob')
  })

  it('shows nobody when no one ends the day above (or below) zero once rounded', () => {
    const m1 = match({ day: 14, a: ['alice'], b: ['bob'], score: [10, 9] })
    const day = dayOf([m1], { [m1.id]: { deltas: { alice: 0.4, bob: -0.4 } } })
    expect(day.hot).toBeNull()
    expect(day.cold).toBeNull()
  })
})

describe('« Duo du jour »', () => {
  it('takes the duo with the most wins together, at least 2 matches together that day', () => {
    const matches = [
      match({ day: 14, a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [10, 5] }),
      match({ day: 14, a: ['bob', 'alice'], b: ['chloe', 'dan'], score: [10, 7] }),
      match({ day: 14, a: ['chloe', 'dan'], b: ['alice', 'bob'], score: [10, 9] }),
      // One match together only: not eligible, whatever its result.
      match({ day: 14, a: ['eve', 'chloe'], b: ['alice', 'dan'], score: [10, 0] }),
      // A 1v1 is never a duo.
      match({ day: 14, a: ['eve'], b: ['dan'], score: [10, 0] }),
    ]
    const day = dayOf(matches)
    expect(day.duo).toMatchObject({ wins: 2, losses: 1 })
    expect([...(day.duo?.members ?? [])].sort()).toEqual(['alice', 'bob'])
  })

  it('needs a win: 2 defeats together is not a duo of the day', () => {
    const matches = [
      match({ day: 14, a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [5, 10] }),
      match({ day: 14, a: ['alice', 'bob'], b: ['chloe', 'eve'], score: [5, 10] }),
    ]
    expect(dayOf(matches).duo).toBeNull()
  })

  it('breaks a tie on wins by better net points, then by the duo name', () => {
    const matches = [
      match({ day: 14, a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [10, 5] }),
      match({ day: 14, a: ['chloe', 'dan'], b: ['alice', 'bob'], score: [10, 5] }),
    ]
    const [m1, m2] = matches
    const byPoints = dayOf(matches, {
      [m1.id]: { deltas: { alice: 10, bob: 10, chloe: -10, dan: -10 } },
      [m2.id]: { deltas: { chloe: 15, dan: 15, alice: -15, bob: -15 } },
    })
    expect([...(byPoints.duo?.members ?? [])].sort()).toEqual(['chloe', 'dan'])
    const byName = dayOf(matches, {
      [m1.id]: { deltas: { alice: 10, bob: 10, chloe: -10, dan: -10 } },
      [m2.id]: { deltas: { chloe: 10, dan: 10, alice: -10, bob: -10 } },
    })
    expect([...(byName.duo?.members ?? [])].sort()).toEqual(['alice', 'bob'])
  })
})

describe('« Hold-up du jour »', () => {
  it('takes the win with the lowest chance for the winners, under 50 %, on either side', () => {
    const m1 = match({ day: 14, a: ['alice'], b: ['bob'], score: [10, 8] })
    const m2 = match({ day: 14, a: ['chloe'], b: ['dan'], score: [7, 10] })
    const m3 = match({ day: 14, a: ['eve'], b: ['bob'], score: [10, 1] })
    const day = dayOf([m1, m2, m3], {
      [m1.id]: { expectedA: 0.35 },
      // Dan (team B) won with 1 − 0.78 = 22 %.
      [m2.id]: { expectedA: 0.78 },
      [m3.id]: { expectedA: 0.9 },
    })
    expect(day.holdUp?.match.id).toBe(m2.id)
    expect(day.holdUp?.chance).toBeCloseTo(0.22)
  })

  it('needs less than 50 %, and takes the later match on a tie', () => {
    const m1 = match({ day: 14, a: ['alice'], b: ['bob'], score: [10, 8] })
    const m2 = match({ day: 14, a: ['chloe'], b: ['dan'], score: [10, 8] })
    expect(dayOf([m1], { [m1.id]: { expectedA: 0.5 } }).holdUp).toBeNull()
    const tie = dayOf([m1, m2], { [m1.id]: { expectedA: 0.3 }, [m2.id]: { expectedA: 0.3 } })
    expect(tie.holdUp?.match.id).toBe(m2.id)
  })
})

describe('« Fanny » and « Comeback »', () => {
  it('lists every fanny and every ticked comeback (5-4 in 5 only), in replay order', () => {
    const fanny10 = match({ day: 14, hour: 12, a: ['alice'], b: ['bob'], score: [10, 0] })
    const fanny5 = match({ day: 14, hour: 10, a: ['chloe'], b: ['dan'], score: [0, 5], target: 5 })
    const comeback = match({ day: 14, a: ['alice'], b: ['eve'], score: [4, 5], target: 5, comeback: true })
    const unticked = match({ day: 14, a: ['alice'], b: ['eve'], score: [5, 4], target: 5 })
    const stray = match({ day: 14, a: ['bob'], b: ['eve'], score: [10, 4], comeback: true })
    const day = dayOf([fanny10, fanny5, comeback, unticked, stray])
    expect(day.fannys.map((m) => m.id)).toEqual([fanny5.id, fanny10.id])
    expect(day.comebacks.map((m) => m.id)).toEqual([comeback.id])
  })

  it('reads a match from the winners: their ids and goals first', () => {
    const m = match({ day: 14, a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [0, 5], target: 5 })
    expect(winnersFirst(m)).toEqual({ winners: ['chloe', 'dan'], losers: ['alice', 'bob'], won: 5, lost: 0 })
  })
})

describe('« Accro du jour »', () => {
  it('takes the most matches played that day, 3 at least; ties → more wins, then name', () => {
    const matches = [
      match({ day: 14, a: ['alice'], b: ['bob'], score: [10, 2] }),
      match({ day: 14, a: ['alice'], b: ['bob'], score: [2, 10] }),
      match({ day: 14, a: ['bob'], b: ['alice'], score: [10, 2] }),
      match({ day: 14, a: ['chloe'], b: ['dan'], score: [10, 2] }),
    ]
    // Alice and Bob: 3 matches each; Bob has 2 wins.
    expect(dayOf(matches).addict).toMatchObject({ playerId: 'bob', wins: 2, losses: 1 })
    const even = matches.slice(0, 2)
    expect(dayOf(even).addict).toBeNull()
    const nameTie = [...even, match({ day: 14, a: ['alice'], b: ['bob'], score: [10, 9] })]
    nameTie.push(match({ day: 14, a: ['bob'], b: ['alice'], score: [10, 9] }))
    // 4 matches each, 2 wins each: Alice by name.
    expect(dayOf(nameTie).addict?.playerId).toBe('alice')
  })
})

describe('« Nouveau n°1 »', () => {
  // Day 10: Alice and Bob play their 10 matches (Alice wins 7) → both ranked, Alice 1st, but nobody was ranked before.
  // Day 11: Bob wins 6 times 10-0 → he takes the lead. Day 12: Chloé, a rookie, beats Bob 3 times (not ranked: no
  // change); Bob beats Alice once more (still 1st: no change).
  function season(): Match[] {
    const matches: Match[] = []
    for (let i = 0; i < 10; i += 1) {
      const aliceWins = i < 7
      const score: [number, number] = aliceWins ? [10, 6] : [6, 10]
      matches.push(match({ day: 10, hour: 9, minute: i, a: ['alice'], b: ['bob'], score }))
    }
    for (let i = 0; i < 6; i += 1) {
      matches.push(match({ day: 11, hour: 9, minute: i, a: ['bob'], b: ['alice'], score: [10, 0] }))
    }
    for (let i = 0; i < 3; i += 1) {
      matches.push(match({ day: 12, hour: 9, minute: i, a: ['chloe'], b: ['bob'], score: [10, 0] }))
    }
    matches.push(match({ day: 12, hour: 10, a: ['bob'], b: ['alice'], score: [10, 9] }))
    return matches
  }

  function leaderAfter(matches: Match[], day: number): PlayerId | undefined {
    const upTo = matches.filter((m) => new Date(m.playedAt).getDate() <= day)
    const now = new Date(2026, 9, day, 23)
    return rank(replay(PLAYERS, upTo, { now }), PLAYERS).ranked[0]
  }

  it('names the end-of-day leader when another one led at the start of the day', () => {
    const matches = season()
    const result = replay(PLAYERS, matches, { now: new Date(2026, 9, 12, 23) })
    const days = recap(PLAYERS, matches, result, RECAP_DAYS_STEP).days
    expect(days.map((day) => day.key)).toEqual(['2026-10-12', '2026-10-11', '2026-10-10'])
    // Same ranking as the Classement at the end of each day.
    expect(leaderAfter(matches, 10)).toBe('alice')
    expect(leaderAfter(matches, 11)).toBe('bob')
    expect(leaderAfter(matches, 12)).toBe('bob')
    expect(days[1].newLeader).toBe('bob')
  })

  it('skips a day when nobody was ranked before it, and a day that ends with the same leader', () => {
    const matches = season()
    const result = replay(PLAYERS, matches, { now: new Date(2026, 9, 12, 23) })
    const [day12, , day10] = recap(PLAYERS, matches, result, RECAP_DAYS_STEP).days
    expect(day10.newLeader).toBeNull()
    // Chloé's rating is the best of day 12, but with 3 matches she is not ranked yet.
    expect(day12.newLeader).toBeNull()
  })

  it('judges activity like the Classement: going inactive changes nothing, coming back can take the lead', () => {
    const matches = season().filter((m) => new Date(m.playedAt).getDate() !== 12)
    // Alice keeps playing Dan (Bob still active on Oct 20, 30 and Nov 9: no change); Bob comes back on Nov 15,
    // 35 days after his last match: inactive when the day starts (Alice leads), 1st again once he has played.
    for (const day of [20, 30, 40]) matches.push(match({ day, a: ['alice'], b: ['dan'], score: [10, 9] }))
    matches.push(match({ day: 46, a: ['bob'], b: ['dan'], score: [10, 9] }))
    const result = replay(PLAYERS, matches, { now: new Date(2026, 9, 46, 23) })
    const days = recap(PLAYERS, matches, result, 2 * RECAP_DAYS_STEP).days
    const keys = ['2026-11-15', '2026-11-09', '2026-10-30', '2026-10-20', '2026-10-11', '2026-10-10']
    expect(days.map((day) => day.key)).toEqual(keys)
    expect(days.map((day) => day.newLeader)).toEqual(['bob', null, null, null, 'bob', null])
  })
})
