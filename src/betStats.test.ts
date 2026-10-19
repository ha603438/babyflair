import { beforeEach, describe, expect, it } from 'vitest'
import {
  announcersOf,
  betRecord,
  betsOf,
  betTallies,
  duoBetRecord,
  longestShot,
  opponentsOf,
  playerBetRecord,
  replayedMatches,
} from './betStats'
import type { RatedBet } from './betStats'
import { duoId } from './duo'
import type { BetOutcome, Match, MatchId, MatchResult, PlayerId, ReplayResult, Team } from './types'

// Announcement statistics (src/betStats.ts): which announcements belong to a player or a duo, the counts, the points,
// the longest shot and the opponents' failed ones. Everything reads MatchResult.bets, so the results are hand-made
// (chances and deltas chosen freely); the Hall of Flair and Récap tests run the real replay.

let seq = 0

beforeEach(() => {
  seq = 0
})

function scoresOf(winner: Team): Pick<Match, 'scoreA' | 'scoreB'> {
  if (winner === 'A') return { scoreA: 10, scoreB: 4 }
  return { scoreA: 4, scoreB: 10 }
}

/** A match of October `day` 2026 won by team A unless `winner` says otherwise; ids m1, m2… in creation order. */
function match(day: number, teamA: PlayerId[], teamB: PlayerId[], winner: Team = 'A'): Match {
  seq += 1
  const at = new Date(2026, 9, day, 12, seq).toISOString()
  const base = { id: `m${seq}`, seq, playedAt: at, createdAt: at, updatedAt: at, target: 10 as const }
  return { ...base, teamA, teamB, ...scoresOf(winner) }
}

/** The engine's points: 16 × (1 − chance) on a success, −16 × chance otherwise (0.001-rounded). */
function betDelta(success: boolean, chance: number): number {
  if (success) return Math.round(16 * (1 - chance) * 1000) / 1000
  return Math.round(-16 * chance * 1000) / 1000
}

function outcome(team: Team, success: boolean, chance: number, n = 3): BetOutcome {
  return { team, n, chance, success, delta: betDelta(success, chance) }
}

/** A replay result holding only the announcements, in the order given (byMatch is in replay order). */
function resultOf(entries: Array<[Match, BetOutcome[]]>): ReplayResult {
  const byMatch = new Map<MatchId, MatchResult>()
  for (const [played, bets] of entries) {
    byMatch.set(played.id, { matchId: played.id, expectedA: 0.5, expectedB: 0.5, perPlayer: [], bets })
  }
  return { byPlayer: new Map(), byMatch }
}

function mapOf(matches: Match[]): Map<MatchId, Match> {
  return new Map(matches.map((played) => [played.id, played]))
}

describe('betsOf / replayedMatches', () => {
  it('lists the announcements of the matches in their order, Blancs first, skipping matches without one', () => {
    const a = match(1, ['alice'], ['bob'])
    const b = match(2, ['alice'], ['bob'])
    const c = match(3, ['alice'], ['bob'])
    const result = resultOf([
      [a, [outcome('A', true, 0.3), outcome('B', false, 0.2)]],
      [b, []],
      [c, [outcome('B', false, 0.4)]],
    ])
    const bets = betsOf([a, b, c], result)
    expect(bets.map((rated) => [rated.match.id, rated.bet.team])).toEqual([
      ['m1', 'A'],
      ['m1', 'B'],
      ['m3', 'B'],
    ])
    expect(betsOf([c, a], result).map((rated) => rated.match.id)).toEqual(['m3', 'm1', 'm1'])
  })

  it('follows the replay order of the result, whatever the store order, and skips unknown ids', () => {
    const late = match(9, ['alice'], ['bob'])
    const early = match(1, ['alice'], ['bob'])
    const result = resultOf([
      [early, []],
      [late, []],
    ])
    expect(replayedMatches(result, mapOf([late, early])).map((played) => played.id)).toEqual([early.id, late.id])
    expect(replayedMatches(result, mapOf([late])).map((played) => played.id)).toEqual([late.id])
  })

  it('tells the announcing team from the team it was made against, in recorded order', () => {
    const played = match(1, ['bob', 'alice'], ['dan', 'chloe'])
    const rated: RatedBet = { match: played, bet: outcome('B', true, 0.3) }
    expect(announcersOf(rated)).toEqual(['dan', 'chloe'])
    expect(opponentsOf(rated)).toEqual(['bob', 'alice'])
  })
})

describe('longestShot', () => {
  const played = match(1, ['alice'], ['bob'])
  const rated = (success: boolean, chance: number, id = played.id): RatedBet => ({
    match: { ...played, id },
    bet: outcome('A', success, chance),
  })

  it('takes the successful announcement with the lowest chance, failed ones never count', () => {
    const best = longestShot([rated(true, 0.4, 'x'), rated(false, 0.05, 'y'), rated(true, 0.2, 'z'), rated(true, 0.3)])
    expect(best?.match.id).toBe('z')
  })

  it('takes the later one on a tie and is null without a success', () => {
    expect(longestShot([rated(true, 0.2, 'first'), rated(true, 0.2, 'second')])?.match.id).toBe('second')
    expect(longestShot([rated(false, 0.2)])).toBeNull()
    expect(longestShot([])).toBeNull()
  })
})

describe('player record', () => {
  it('counts the announcements of his team, the successes, the net points and the longest shot', () => {
    const m1 = match(1, ['alice', 'bob'], ['chloe', 'dan'])
    const m2 = match(2, ['alice'], ['eve'], 'B')
    const m3 = match(3, ['chloe'], ['alice'], 'B')
    const m4 = match(4, ['bob'], ['chloe'])
    const result = resultOf([
      [m1, [outcome('A', true, 0.25, 4)]],
      [m2, [outcome('A', false, 0.6)]],
      [m3, [outcome('B', true, 0.4, 1)]],
      [m4, [outcome('A', true, 0.1)]],
    ])
    const record = playerBetRecord('alice', result, mapOf([m1, m2, m3, m4]))
    expect(record.made).toBe(3)
    expect(record.won).toBe(2)
    // +12 (16 × 0.75) − 9.6 (16 × 0.6) + 9.6 (16 × 0.6): m4 is Bob's, not Alice's.
    expect(record.points).toBeCloseTo(12, 9)
    expect(record.best?.match.id).toBe('m1')
    expect(record.best?.bet.n).toBe(4)
    expect(record.faced).toBe(0)
    expect(record.broken).toBe(0)
  })

  it('counts the opponents’ announcements faced and how many failed, both teams of a match included', () => {
    const m1 = match(1, ['alice'], ['bob'])
    const m2 = match(2, ['alice', 'chloe'], ['bob', 'dan'], 'B')
    const m3 = match(3, ['bob'], ['alice'], 'B')
    const result = resultOf([
      [m1, [outcome('A', true, 0.5), outcome('B', false, 0.2)]],
      [m2, [outcome('B', true, 0.4)]],
      [m3, [outcome('A', false, 0.3)]],
    ])
    const record = playerBetRecord('alice', result, mapOf([m1, m2, m3]))
    expect(record).toMatchObject({ made: 1, won: 1, faced: 3, broken: 2 })
    expect(playerBetRecord('eve', result, mapOf([m1, m2, m3]))).toEqual({
      made: 0,
      won: 0,
      points: 0,
      best: null,
      faced: 0,
      broken: 0,
    })
  })

  it('has no longest shot without a success, and negative points when every announcement failed', () => {
    const m1 = match(1, ['alice'], ['bob'], 'B')
    const result = resultOf([[m1, [outcome('A', false, 0.25)]]])
    const record = playerBetRecord('alice', result, mapOf([m1]))
    expect(record.best).toBeNull()
    expect(record.points).toBeCloseTo(-4, 9)
  })
})

describe('duo record', () => {
  it('only counts the matches the duo played together (any order), on its side or against it', () => {
    const together = match(1, ['alice', 'bob'], ['chloe', 'dan'])
    const swapped = match(2, ['chloe', 'dan'], ['bob', 'alice'], 'B')
    const apart = match(3, ['alice', 'chloe'], ['bob', 'dan'])
    const alone = match(4, ['alice'], ['bob'])
    const result = resultOf([
      [together, [outcome('A', true, 0.3)]],
      [swapped, [outcome('A', false, 0.4), outcome('B', false, 0.2, 7)]],
      [apart, [outcome('A', true, 0.1), outcome('B', false, 0.2)]],
      [alone, [outcome('A', true, 0.05)]],
    ])
    const record = duoBetRecord(duoId('bob', 'alice'), result, mapOf([together, swapped, apart, alone]))
    expect(record).toMatchObject({ made: 2, won: 1, faced: 1, broken: 1 })
    expect(record.best?.match.id).toBe('m1')
    expect(duoBetRecord(duoId('alice', 'eve'), result, mapOf([together, swapped, apart, alone])).made).toBe(0)
  })

  it('reads any side function: betRecord is the shared rule', () => {
    const played = match(1, ['alice'], ['bob'])
    const bets = [{ match: played, bet: outcome('B', false, 0.3) }]
    expect(betRecord(bets, () => 'A')).toMatchObject({ made: 0, faced: 1, broken: 1 })
    expect(betRecord(bets, () => null)).toMatchObject({ made: 0, faced: 0, broken: 0 })
  })
})

describe('betTallies', () => {
  it('gives each member of an announcing team one announcement, each opponent of a failed one one broken', () => {
    const m1 = match(1, ['alice', 'bob'], ['chloe', 'dan'])
    const m2 = match(2, ['alice'], ['eve'], 'B')
    const bets = betsOf(
      [m1, m2],
      resultOf([
        [m1, [outcome('A', true, 0.3), outcome('B', false, 0.2)]],
        [m2, [outcome('A', false, 0.6)]],
      ]),
    )
    const tallies = new Map(betTallies(bets).map((tally) => [tally.playerId, tally]))
    expect(tallies.get('alice')).toEqual({ playerId: 'alice', made: 2, won: 1, broken: 1 })
    expect(tallies.get('bob')).toEqual({ playerId: 'bob', made: 1, won: 1, broken: 1 })
    expect(tallies.get('chloe')).toEqual({ playerId: 'chloe', made: 1, won: 0, broken: 0 })
    expect(tallies.get('eve')).toEqual({ playerId: 'eve', made: 0, won: 0, broken: 1 })
    expect(tallies.size).toBe(5)
  })
})
