import { describe, expect, it } from 'vitest'
import { betFields } from './bets'
import { replayMain, replayRankings } from './rating/rankings'
import type { Rankings } from './rating/rankings'
import { groupByDay, localDayKey, recap, RECAP_DAYS_STEP, winnersFirst } from './recap'
import type { BetOutcome, Match, MatchId, MatchResult, Player, PlayerId, Target } from './types'

// Récap (src/recap.ts): day grouping on the local calendar, the last days with matches, and each highlight's rule and
// tie-breaks. Highlights other than « Nouveau n°1 » read only the per-match deltas and chances (each match in the
// ranking of its format), so most cases use a hand-made result; the leader change runs the real 2V2 mixte replay.
// Dates are built in local time (TZ-independent).

const PLAYERS: Player[] = [
  { id: 'alice', name: 'Alice', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'bob', name: 'Bob', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'chloe', name: 'Chloé', isGuest: true, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'dan', name: 'Dan', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'eve', name: 'Eve', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'fred', name: 'Fred', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
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
  betA?: number
  betB?: number
}

/** A match on October `day` 2026, local time (12:00 by default); ids follow the creation order. */
function match({ day, hour = 12, minute = 0, a, b, score, target = 10, comeback, betA, betB }: MatchSpec): Match {
  seq += 1
  const at = new Date(2026, 9, day, hour, minute).toISOString()
  const base = { id: `m${seq}`, seq, playedAt: at, createdAt: at, updatedAt: at, target, teamA: a, teamB: b }
  const played: Match = { ...base, scoreA: score[0], scoreB: score[1], ...betFields(betA, betB) }
  if (comeback === undefined) return played
  return { ...played, comeback }
}

/** `bets` the announcements as the replay would rate them (chosen freely here, the record only reads them). */
type Fake = { deltas?: Record<PlayerId, number>; expectedA?: number; bets?: BetOutcome[] }

type Rated = Pick<Rankings, 'main' | 'byMatch'>

/** Match results with the given deltas (0 by default) and team A chances (50 % by default); nobody ever ranked. */
function resultOf(matches: Match[], fakes: Record<MatchId, Fake> = {}): Rated {
  const byMatch = new Map<MatchId, MatchResult>()
  for (const m of matches) {
    const fake = fakes[m.id] ?? {}
    const expectedA = fake.expectedA ?? 0.5
    const row = (playerId: PlayerId, team: 'A' | 'B') => {
      const delta = fake.deltas?.[playerId] ?? 0
      return { playerId, team, before: 1000, after: 1000 + delta, delta, why: '' }
    }
    const perPlayer = [...m.teamA.map((id) => row(id, 'A')), ...m.teamB.map((id) => row(id, 'B'))]
    byMatch.set(m.id, { matchId: m.id, expectedA, expectedB: 1 - expectedA, perPlayer, bets: fake.bets ?? [] })
  }
  const main = { byPlayer: new Map(), byMatch: new Map() }
  return { main: { result: main, ranking: { ranked: [], rookies: [], inactive: [] }, matches: [] }, byMatch }
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

describe('« Annonce du jour »', () => {
  type Side = 'A' | 'B'
  const won = (team: Side, n: number, chance: number): BetOutcome => ({ team, n, chance, success: true, delta: 1 })
  const lost = (team: Side, n: number, chance: number): BetOutcome => ({ team, n, chance, success: false, delta: -1 })

  it('takes the successful announcement with the lowest chance, on either side; failed ones never count', () => {
    const m1 = match({ day: 15, a: ['alice'], b: ['bob'], score: [10, 5], betA: 3 })
    const m2 = match({ day: 15, minute: 1, a: ['chloe'], b: ['dan'], score: [4, 10], betA: 1, betB: 4 })
    const m3 = match({ day: 15, minute: 2, a: ['alice'], b: ['eve'], score: [10, 9], betA: 5 })
    const day = dayOf([m1, m2, m3], {
      [m1.id]: { bets: [won('A', 3, 0.35)] },
      [m2.id]: { bets: [lost('A', 1, 0.1), won('B', 4, 0.23)] },
      [m3.id]: { bets: [lost('A', 5, 0.05)] },
    })
    expect(day.bet?.match.id).toBe(m2.id)
    expect(day.bet?.bet).toMatchObject({ team: 'B', n: 4, chance: 0.23 })
  })

  it('takes the later match on a tie, and nothing on a day without a success', () => {
    const m1 = match({ day: 15, a: ['alice'], b: ['bob'], score: [10, 5], betA: 3 })
    const m2 = match({ day: 15, minute: 1, a: ['chloe'], b: ['dan'], score: [10, 5], betA: 3 })
    const tied = dayOf([m1, m2], { [m1.id]: { bets: [won('A', 3, 0.3)] }, [m2.id]: { bets: [won('A', 3, 0.3)] } })
    expect(tied.bet?.match.id).toBe(m2.id)
    const m3 = match({ day: 16, a: ['alice'], b: ['bob'], score: [5, 10], betA: 2 })
    expect(dayOf([m3], { [m3.id]: { bets: [lost('A', 2, 0.3)] } }).bet).toBeNull()
    expect(dayOf([match({ day: 17, a: ['alice'], b: ['bob'], score: [10, 5] })]).bet).toBeNull()
  })

  it('counts the day’s announcements, one per announcing team', () => {
    const matches = [
      match({ day: 15, a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [10, 5], betA: 3, betB: 2 }),
      match({ day: 15, minute: 1, a: ['alice'], b: ['eve'], score: [10, 5] }),
      match({ day: 15, minute: 2, a: ['alice'], b: ['eve'], score: [10, 5], betB: 1 }),
    ]
    expect(dayOf(matches).betCount).toBe(3)
    expect(dayOf([match({ day: 16, a: ['alice'], b: ['eve'], score: [10, 5] })]).betCount).toBe(0)
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

describe('without « Accro du jour »', () => {
  it('has no « most matches of the day » highlight any more', () => {
    const matches = [
      match({ day: 14, a: ['alice'], b: ['bob'], score: [10, 2] }),
      match({ day: 14, a: ['alice'], b: ['bob'], score: [2, 10] }),
      match({ day: 14, a: ['bob'], b: ['alice'], score: [10, 2] }),
    ]
    expect(dayOf(matches)).not.toHaveProperty('addict')
  })
})

describe('each match in its own ranking', () => {
  it('sums the 1V1 deltas of a 1v1 and the 2V2 mixte deltas of a 2v2 (real replay)', () => {
    const solo = match({ day: 14, a: ['alice'], b: ['bob'], score: [10, 2] })
    const duo = match({ day: 14, hour: 13, a: ['alice', 'chloe'], b: ['dan', 'eve'], score: [10, 8] })
    const rankings = replayRankings(PLAYERS, [solo, duo], new Date(2026, 9, 14, 23))
    const [day] = recap(PLAYERS, [solo, duo], rankings, RECAP_DAYS_STEP).days
    const soloAlice = rankings.oneVsOne.result.byMatch.get(solo.id)?.perPlayer.find((p) => p.playerId === 'alice')
    const duoAlice = rankings.main.result.byMatch.get(duo.id)?.perPlayer.find((p) => p.playerId === 'alice')
    expect(rankings.main.result.byMatch.has(solo.id)).toBe(false)
    const net = (soloAlice?.delta ?? 0) + (duoAlice?.delta ?? 0)
    expect(day.hot).toEqual({ playerId: 'alice', net, wins: 2, losses: 0 })
  })
})

describe('« Nouveau n°1 »', () => {
  // The 2V2 mixte leader. Day 10: Alice & Eve play Bob & Dan 10 times (they win 7) → the four are ranked, Alice 1st
  // (by name, Eve has the same rating), but nobody was ranked before. Day 11: Bob & Dan win 6 times 10-0 → Bob takes
  // the lead. Day 12: Chloé & Fred, rookies, beat Bob & Dan 3 times (not ranked: no change); Bob & Dan beat Alice &
  // Eve once more (Bob still 1st: no change).
  function season(): Match[] {
    const matches: Match[] = []
    for (let i = 0; i < 10; i += 1) {
      const aliceWins = i < 7
      const score: [number, number] = aliceWins ? [10, 6] : [6, 10]
      matches.push(match({ day: 10, hour: 9, minute: i, a: ['alice', 'eve'], b: ['bob', 'dan'], score }))
    }
    for (let i = 0; i < 6; i += 1) {
      matches.push(match({ day: 11, hour: 9, minute: i, a: ['bob', 'dan'], b: ['alice', 'eve'], score: [10, 0] }))
    }
    for (let i = 0; i < 3; i += 1) {
      matches.push(match({ day: 12, hour: 9, minute: i, a: ['chloe', 'fred'], b: ['bob', 'dan'], score: [10, 0] }))
    }
    matches.push(match({ day: 12, hour: 10, a: ['bob', 'dan'], b: ['alice', 'eve'], score: [10, 9] }))
    return matches
  }

  function leaderAfter(matches: Match[], day: number): PlayerId | undefined {
    const upTo = matches.filter((m) => new Date(m.playedAt).getDate() <= day)
    return replayMain(PLAYERS, upTo, new Date(2026, 9, day, 23)).ranking.ranked[0]
  }

  it('names the end-of-day leader when another one led at the start of the day', () => {
    const matches = season()
    const rankings = replayRankings(PLAYERS, matches, new Date(2026, 9, 12, 23))
    const days = recap(PLAYERS, matches, rankings, RECAP_DAYS_STEP).days
    expect(days.map((day) => day.key)).toEqual(['2026-10-12', '2026-10-11', '2026-10-10'])
    // Same ranking as the Classement (2V2 mixte) at the end of each day.
    expect(leaderAfter(matches, 10)).toBe('alice')
    expect(leaderAfter(matches, 11)).toBe('bob')
    expect(leaderAfter(matches, 12)).toBe('bob')
    expect(days[1].newLeader).toBe('bob')
  })

  it('skips a day when nobody was ranked before it, and a day that ends with the same leader', () => {
    const matches = season()
    const rankings = replayRankings(PLAYERS, matches, new Date(2026, 9, 12, 23))
    const [day12, , day10] = recap(PLAYERS, matches, rankings, RECAP_DAYS_STEP).days
    expect(day10.newLeader).toBeNull()
    // Chloé's rating is the best of day 12, but with 3 matches she is not ranked yet.
    const { byPlayer } = rankings.main.result
    expect(byPlayer.get('chloe')?.rating).toBeGreaterThan(byPlayer.get('bob')?.rating ?? 0)
    expect(day12.newLeader).toBeNull()
  })

  it('ignores the 1v1 matches: they never move the 2V2 mixte leader', () => {
    const matches = season().filter((m) => new Date(m.playedAt).getDate() !== 12)
    // Day 13: Alice crushes Bob 4 times in 1v1, which would have given her the lead when every match counted.
    for (let i = 0; i < 4; i += 1) {
      matches.push(match({ day: 13, hour: 9, minute: i, a: ['alice'], b: ['bob'], score: [10, 0] }))
    }
    const rankings = replayRankings(PLAYERS, matches, new Date(2026, 9, 13, 23))
    const [day13] = recap(PLAYERS, matches, rankings, RECAP_DAYS_STEP).days
    expect(leaderAfter(matches, 13)).toBe('bob')
    expect(day13.newLeader).toBeNull()
  })

  it('judges activity like the Classement: going inactive changes nothing, coming back can take the lead', () => {
    const matches = season().filter((m) => new Date(m.playedAt).getDate() !== 12)
    // Alice & Eve keep playing Chloé & Fred (Bob still active on Oct 20, 30 and Nov 9: no change); Bob & Dan come back
    // on Nov 15, 35 days after their last match: inactive when the day starts (Alice leads), Bob 1st again once played.
    for (const day of [20, 30, 40]) {
      matches.push(match({ day, a: ['alice', 'eve'], b: ['chloe', 'fred'], score: [10, 9] }))
    }
    matches.push(match({ day: 46, a: ['bob', 'dan'], b: ['chloe', 'fred'], score: [10, 9] }))
    const rankings = replayRankings(PLAYERS, matches, new Date(2026, 9, 46, 23))
    const days = recap(PLAYERS, matches, rankings, 2 * RECAP_DAYS_STEP).days
    const keys = ['2026-11-15', '2026-11-09', '2026-10-30', '2026-10-20', '2026-10-11', '2026-10-10']
    expect(days.map((day) => day.key)).toEqual(keys)
    expect(days.map((day) => day.newLeader)).toEqual(['bob', null, null, null, 'bob', null])
  })
})
