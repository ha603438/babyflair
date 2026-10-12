import { describe, expect, it } from 'vitest'

import type { LeaderboardRow, Match, Player, PlayerDelta, RatingsState, ReplayResult } from './engine'
import {
  applyMatch,
  compareRows,
  DEFAULT_CONFIG,
  expectedScore,
  lastEntered,
  leaderboard,
  marginMultiplier,
  nextSeq,
  orderMatches,
  replay,
  rookieMultiplier,
  round3,
  validateMatch,
  whyFr,
} from './engine'
import vectors from './test-vectors.json'

// test-vectors.json was produced by the reference implementation's make-vectors.ts. Each test below repeats the exact
// calls that produced its scenario's `expected` block, so any numeric or textual drift in engine.ts fails here.
// JSON round-trips doubles exactly, hence plain equality everywhere.

const DAY = 86_400_000
// The generator's reference instant. random_100_matches does not store the clock it was ranked with (T0 + 1 day).
const T0 = Date.parse('2026-10-12T12:00:00Z')

type Scenario<I, E> = { name: string; description: string; input: I; expected: E }
type Explained = PlayerDelta & { why: string }
type IdDelta = [string, number]
type ReplaySummary = { players: RatingsState; matches: Array<{ matchId: string; deltas: IdDelta[] }> }

type SingleInput = { state: RatingsState; match: Match }
type SingleExpected = { newState: RatingsState; deltas: Explained[] }
type RookieInput = { players: Player[]; initialState: RatingsState; matches: Match[] }
type RookieExpected = {
  steps: Array<{ matchId: string; deltas: Explained[] }>
  finalState: RatingsState
  rookieK: Array<{ n: number; k: number }>
}
type DeletedInput = { players: Player[]; matchesFull: Match[]; matchesWithDeleted: Match[] }
type DeletedExpected = { full: ReplaySummary; withDeleted: ReplaySummary }
type EditedInput = { players: Player[]; original: Match[]; edited: Match[] }
type EditedExpected = {
  order: string[]
  lastEntered: string
  before: RatingsState
  after: RatingsState
  afterMatches: ReplaySummary['matches']
}
type RandomInput = { players: Player[]; matches: Match[] }
type RandomExpected = {
  finalPlayers: RatingsState
  sumOfRatings: number
  ratingsHash: number
  leaderboard: { ranked: unknown[]; rookies: unknown[]; inactive: string[] }
  lastMatch: ReplayResult['matches'][number]
}
type InvalidCase = { label: string; match: Match }
type InvalidExpectation = { label: string; throws: boolean; error: string }
type BoardInput = { players: Player[]; state: RatingsState; now: number }
type BoardExpected = { ranked: unknown[]; rookies: unknown[]; inactive: unknown[] }
type UndoInput = { players: Player[]; m1: Match; m2Deleted: Match; m3: Match; restored: Match[]; withSeqClash: Match[] }
type UndoExpected = {
  seqForNew: number
  orderWhileDeleted: string[]
  orderRestored: string[]
  lastEnteredWhileDeleted: string
  lastEnteredRestored: string
  falseIsNotDeleted: number
  duplicateSeqError: string
  finalPlayers: RatingsState
}
type TablesExpected = {
  expected: Array<{ gap: number; to10: number; to5: number }>
  margin10: Array<{ score: string; G: number }>
  margin5: Array<{ score: string; G: number }>
}

function scenario<I, E>(name: string): Scenario<I, E> {
  const found = vectors.scenarios.find((s) => s.name === name)
  if (found === undefined) throw new Error(`missing scenario ${name}`)
  return found as unknown as Scenario<I, E>
}

function player(id: string, name: string): Player {
  return { id, name, isGuest: false, createdAt: T0 - 10 * DAY }
}

function explain(deltas: PlayerDelta[]): Explained[] {
  return deltas.map((d) => ({ ...d, why: whyFr(d) }))
}

function summarise(result: ReplayResult): ReplaySummary {
  return {
    players: result.players,
    matches: result.matches.map((m) => ({ matchId: m.matchId, deltas: m.deltas.map((d): IdDelta => [d.playerId, d.delta]) })),
  }
}

function thrownBy(fn: () => unknown): Error | undefined {
  try {
    fn()
  } catch (error) {
    return error as Error
  }
  return undefined
}

// Same checksum as make-vectors.ts: a 32-bit string hash over "<id>=<rating to 3 decimals>;" in players order.
function ratingsHash(ids: string[], state: RatingsState): number {
  let hash = 0
  for (const id of ids) {
    for (const ch of `${id}=${state[id].rating.toFixed(3)};`) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0
  }
  return hash >>> 0
}

const FOUR: Player[] = [player('a', 'Alice'), player('b', 'Bob'), player('c', 'Chloé'), player('d', 'David')]

describe('test-vectors.json', () => {
  it('was generated with the default config and carries the 16 scenarios', () => {
    expect(vectors.config).toEqual(DEFAULT_CONFIG)
    expect(vectors.scenarios).toHaveLength(16)
  })

  it('uses the reference instant assumed by this file', () => {
    expect(scenario<SingleInput, SingleExpected>('owner_example_win').input.match.playedAt).toBe(T0)
  })
})

describe('single-match scenarios (applyMatch)', () => {
  const names = [
    'owner_example_win',
    'owner_example_loss',
    'one_v_one',
    'to5_shutout',
    'to10_one_goal',
    'upset',
    'to5_favourite_loses',
  ]

  for (const name of names) {
    it(name, () => {
      const { input, expected } = scenario<SingleInput, SingleExpected>(name)
      const untouched = structuredClone(input.state)
      const result = applyMatch(input.state, input.match, DEFAULT_CONFIG)
      expect(result.newState).toEqual(expected.newState)
      expect(explain(result.deltas)).toEqual(expected.deltas)
      expect(input.state).toEqual(untouched)
    })
  }

  it('owner example: Strong 1400 + Weak 800 beat two 1100s 10-8', () => {
    const { expected } = scenario<SingleInput, SingleExpected>('owner_example_win')
    expect(expected.deltas.map((d) => d.delta)).toEqual([8.64, 10.56, -9.6, -9.6])
  })
})

describe('histories', () => {
  it('rookie_first_matches', () => {
    const { input, expected } = scenario<RookieInput, RookieExpected>('rookie_first_matches')
    let state = input.initialState
    const steps = input.matches.map((m) => {
      const result = applyMatch(state, m)
      state = result.newState
      return { matchId: m.id, deltas: explain(result.deltas) }
    })
    expect(steps).toEqual(expected.steps)
    expect(state).toEqual(expected.finalState)
    for (const { n, k } of expected.rookieK) expect(rookieMultiplier(n), `rookieMultiplier(${n})`).toBe(k)
  })

  it('deleted_middle_match', () => {
    const { input, expected } = scenario<DeletedInput, DeletedExpected>('deleted_middle_match')
    expect(summarise(replay(input.players, input.matchesFull))).toEqual(expected.full)
    expect(summarise(replay(input.players, input.matchesWithDeleted))).toEqual(expected.withDeleted)
  })

  it('edited_match_keeps_position', () => {
    const { input, expected } = scenario<EditedInput, EditedExpected>('edited_match_keeps_position')
    expect(orderMatches(input.edited).map((m) => m.id)).toEqual(expected.order)
    expect(lastEntered(input.edited)?.id).toBe(expected.lastEntered)
    expect(replay(input.players, input.original).players).toEqual(expected.before)
    const after = replay(input.players, input.edited)
    expect(after.players).toEqual(expected.after)
    expect(summarise(after).matches).toEqual(expected.afterMatches)
  })

  it('random_100_matches', () => {
    const { input, expected } = scenario<RandomInput, RandomExpected>('random_100_matches')
    const result = replay(input.players, input.matches)
    expect(result.matches).toHaveLength(100)
    expect(result.players).toEqual(expected.finalPlayers)

    const ids = input.players.map((p) => p.id)
    const sum = Math.round(ids.reduce((acc, id) => acc + result.players[id].rating, 0) * 1000) / 1000
    expect(sum).toBe(expected.sumOfRatings)
    expect(ratingsHash(ids, result.players)).toBe(expected.ratingsHash)

    const board = leaderboard(input.players, result.players, T0 + DAY)
    expect(board.ranked.map((r) => [r.rank, r.player.id, r.rating, r.matches])).toEqual(expected.leaderboard.ranked)
    expect(board.rookies.map((r) => [r.player.id, r.rating, r.matches])).toEqual(expected.leaderboard.rookies)
    expect(board.inactive.map((r) => r.player.id)).toEqual(expected.leaderboard.inactive)

    expect(result.matches[result.matches.length - 1]).toEqual(expected.lastMatch)
  })

  it('undo_seq_and_restore', () => {
    const { input, expected } = scenario<UndoInput, UndoExpected>('undo_seq_and_restore')
    const { m1, m2Deleted, m3 } = input
    expect(nextSeq([m1, m2Deleted])).toBe(expected.seqForNew)
    expect(orderMatches([m1, m2Deleted, m3]).map((m) => m.id)).toEqual(expected.orderWhileDeleted)
    expect(orderMatches(input.restored).map((m) => m.id)).toEqual(expected.orderRestored)
    expect(lastEntered([m1, m2Deleted, m3])?.id).toBe(expected.lastEnteredWhileDeleted)
    expect(lastEntered(input.restored)?.id).toBe(expected.lastEnteredRestored)
    // Only a NUMBER marks a deletion: `false` must not hide the row.
    const notDeleted = { ...m2Deleted, deletedAt: false as unknown as number }
    expect(orderMatches([notDeleted])).toHaveLength(expected.falseIsNotDeleted)
    expect(thrownBy(() => replay(input.players, input.withSeqClash))?.message).toBe(expected.duplicateSeqError)
    expect(replay(input.players, input.restored).players).toEqual(expected.finalPlayers)
  })
})

describe('validation', () => {
  it('invalid_matches_throw', () => {
    const { input, expected } = scenario<InvalidCase[], InvalidExpectation[]>('invalid_matches_throw')
    const roster = [...FOUR, player('e', 'Emma')]
    expect(input).toHaveLength(16)
    expect(expected).toHaveLength(16)
    input.forEach((c, i) => {
      expect(expected[i].label).toBe(c.label)
      expect(expected[i].throws).toBe(true)
      expect(thrownBy(() => validateMatch(c.match, roster))?.message, c.label).toBe(expected[i].error)
    })
    // The base row every case was derived from is valid.
    const base: Match = {
      id: 'bad',
      seq: 1,
      playedAt: T0,
      createdAt: T0,
      target: 10,
      teamA: ['a', 'b'],
      teamB: ['c', 'd'],
      scoreA: 10,
      scoreB: 7,
    }
    expect(() => validateMatch(base, FOUR)).not.toThrow()
  })
})

describe('leaderboard', () => {
  it('leaderboard_sections', () => {
    const { input, expected } = scenario<BoardInput, BoardExpected>('leaderboard_sections')
    const board = leaderboard(input.players, input.state, input.now)
    expect(board.ranked.map((r) => [r.rank, r.player.id, r.player.name, r.rating, r.matches])).toEqual(expected.ranked)
    expect(board.rookies.map((r) => [r.player.id, r.rating, r.matches])).toEqual(expected.rookies)
    expect(board.inactive.map((r) => [r.player.id, r.rating, r.matches])).toEqual(expected.inactive)
  })

  it('name_tiebreak_accents', () => {
    const { input, expected } = scenario<BoardInput, { ranked: Array<[number, string, string]> }>('name_tiebreak_accents')
    const board = leaderboard(input.players, input.state, input.now)
    expect(board.ranked.map((r) => [r.rank, r.player.id, r.player.name])).toEqual(expected.ranked)

    const rows: LeaderboardRow[] = input.players.map((p) => ({ ...input.state[p.id], player: p, rank: null }))
    rows.sort(compareRows)
    expect(rows.map((r) => r.player.id)).toEqual(expected.ranked.map(([, id]) => id))
  })
})

describe('reference_tables', () => {
  it('matches the expectedScore and marginMultiplier tables', () => {
    const { expected } = scenario<null, TablesExpected>('reference_tables')
    const table = expected.expected.map(({ gap }) => ({ gap, to10: round3(expectedScore(gap, 10)), to5: round3(expectedScore(gap, 5)) }))
    expect(table).toEqual(expected.expected)
    const margin10 = Array.from({ length: 10 }, (_, l) => ({ score: `10-${l}`, G: marginMultiplier(10, 10, l) }))
    expect(margin10).toEqual(expected.margin10)
    const margin5 = Array.from({ length: 5 }, (_, l) => ({ score: `5-${l}`, G: marginMultiplier(5, 5, l) }))
    expect(margin5).toEqual(expected.margin5)
  })
})
