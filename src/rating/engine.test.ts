import { describe, expect, it } from 'vitest'

import type { LeaderboardRow, Match, Player, PlayerDelta, RatingsState, ReplayResult } from './engine'
import {
  matchBonus,
  applyMatch,
  betChance,
  betOutlook,
  goalProbability,
  rateBet,
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

// The vectors predate the announcements (« annonces d'écart »): none of their matches carries one, so every delta must
// come out with `bet: null`, a field the vectors simply do not have.
function withoutBet(d: PlayerDelta): Omit<PlayerDelta, 'bet'> {
  expect(d.bet).toBeNull()
  const { bet: _bet, ...rest } = d
  return rest
}

function explain(deltas: PlayerDelta[]): Explained[] {
  return deltas.map((d) => ({ ...withoutBet(d), why: whyFr(d) }) as Explained)
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
    // betStake came with the announcements, after the vectors: every other key is the generator's.
    const { betStake: _stake, ...vectorConfig } = DEFAULT_CONFIG
    expect(vectors.config).toEqual(vectorConfig)
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

    const last = result.matches[result.matches.length - 1]
    expect({ ...last, deltas: last.deltas.map(withoutBet) }).toEqual(expected.lastMatch)
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

describe('fanny and comeback bonus', () => {
  const base = { id: 'm', seq: 1, playedAt: 1, createdAt: 1, teamA: ['a', 'b'], teamB: ['c', 'd'] }
  it('weights a fanny and a flagged 5-4 comeback, both ways', () => {
    expect(matchBonus({ ...base, target: 5, scoreA: 5, scoreB: 0 })).toEqual({ kind: 'fanny', multiplier: 1.2 })
    expect(matchBonus({ ...base, target: 10, scoreA: 0, scoreB: 10 })).toEqual({ kind: 'fanny', multiplier: 1.2 })
    expect(matchBonus({ ...base, target: 5, scoreA: 5, scoreB: 4, comeback: true })).toEqual({ kind: 'comeback', multiplier: 1.25 })
    expect(matchBonus({ ...base, target: 5, scoreA: 5, scoreB: 4 })).toEqual({ kind: null, multiplier: 1 })
    expect(matchBonus({ ...base, target: 5, scoreA: 5, scoreB: 3, comeback: true })).toEqual({ kind: null, multiplier: 1 })
  })
  it('makes a comeback pay more than a plain 5-4 and stays zero-sum', () => {
    const state = Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, { rating: 1000, matches: 20, wins: 10, losses: 10, lastPlayedAt: 0 }]))
    const plain = applyMatch(state, { ...base, target: 5, scoreA: 5, scoreB: 4 }).deltas
    const comeback = applyMatch(state, { ...base, target: 5, scoreA: 5, scoreB: 4, comeback: true }).deltas
    expect(plain.map((d) => d.delta)).toEqual([8.8, 8.8, -8.8, -8.8])
    expect(comeback.map((d) => d.delta)).toEqual([11, 11, -11, -11])
    expect(whyFr(comeback[0])).toContain('comeback ×1,25')
  })
})

// ---------------------------------------------------------------------------
// Announcements (« annonces d'écart »): BabyElo v2 + an Elo-style side bet per team
// ---------------------------------------------------------------------------

describe('betChance (independent-goals model)', () => {
  // Σ_{k=0}^{maxLoser} C(target - 1 + k, k) q^target (1 - q)^k, written out independently of the engine.
  function binomial(n: number, k: number): number {
    let c = 1
    for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i
    return c
  }
  function reference(q: number, target: number, maxLoser: number): number {
    let sum = 0
    for (let k = 0; k <= maxLoser; k++) sum += binomial(target - 1 + k, k) * q ** target * (1 - q) ** k
    return sum
  }

  it('equal teams in 10, announce +4: about 22,7 %', () => {
    expect(goalProbability(0.5, 10)).toBeCloseTo(0.5, 12)
    expect(betChance(0.5, 10, 4)).toBeCloseTo(reference(0.5, 10, 6), 12)
    expect(betChance(0.5, 10, 4)).toBeCloseTo(0.2272, 4)
  })

  it('N = 1 gives the win expectation back, in 5 and in 10', () => {
    for (const target of [5, 10] as const) {
      for (const e of [0.05, 0.3, 0.5, 0.7, 0.93]) {
        expect(betChance(e, target, 1), `${e} en ${target}`).toBeCloseTo(e, 10)
      }
    }
  })

  it('N = target is the chance of a fanny: q^target', () => {
    expect(betChance(0.5, 5, 5)).toBeCloseTo(1 / 32, 12)
    expect(betChance(0.5, 10, 10)).toBeCloseTo(1 / 1024, 12)
    for (const e of [0.2, 0.7]) {
      const q = goalProbability(e, 10)
      expect(betChance(e, 10, 10)).toBeCloseTo(q ** 10, 12)
      expect(betChance(e, 10, 10)).toBeCloseTo(reference(q, 10, 0), 12)
    }
  })

  it('calibrates q on the race expectation and matches the closed form for any N', () => {
    for (const target of [5, 10] as const) {
      const q = goalProbability(0.62, target)
      expect(reference(q, target, target - 1)).toBeCloseTo(0.62, 12)
      for (let n = 1; n <= target; n++) {
        expect(betChance(0.62, target, n)).toBeCloseTo(reference(q, target, target - n), 12)
      }
    }
  })

  it('falls as N grows, rises with the expectation, and stays in 0..1 at the extremes', () => {
    for (let n = 1; n < 10; n++) expect(betChance(0.5, 10, n + 1)).toBeLessThan(betChance(0.5, 10, n))
    expect(betChance(0.8, 5, 3)).toBeGreaterThan(betChance(0.4, 5, 3))
    expect(betChance(0, 10, 3)).toBeCloseTo(0, 12)
    expect(betChance(1, 10, 3)).toBeCloseTo(1, 9)
  })

  it('is deterministic', () => {
    expect(betChance(0.613, 10, 3)).toBe(betChance(0.613, 10, 3))
  })
})

describe('betOutlook / rateBet', () => {
  it('equal teams in 10, +4: +12,4 if it works, -3,6 otherwise', () => {
    const outlook = betOutlook(0.5, 10, 4)
    expect(round3(outlook.success)).toBe(12.364)
    expect(round3(outlook.failure)).toBe(-3.636)
  })

  it('a favourite (E = 0,7) announcing +1: p = 0,7, so +4,8 / -11,2', () => {
    const outlook = betOutlook(0.7, 10, 1)
    expect(outlook.chance).toBeCloseTo(0.7, 10)
    expect(round3(outlook.success)).toBe(4.8)
    expect(round3(outlook.failure)).toBe(-11.2)
  })

  it('has a zero expected value under the model, for any stake', () => {
    for (const [e, target, n] of [[0.5, 10, 4], [0.3, 5, 2], [0.85, 10, 7]] as const) {
      const { chance, success, failure } = betOutlook(e, target, n)
      expect(chance * success + (1 - chance) * failure).toBeCloseTo(0, 12)
    }
    const doubled = betOutlook(0.5, 10, 4, { ...DEFAULT_CONFIG, betStake: 32 })
    expect(doubled.success).toBeCloseTo(2 * betOutlook(0.5, 10, 4).success, 12)
  })

  it('succeeds only on a win by at least N, and is null without announcement', () => {
    const side = { won: true, expected: 0.5 }
    expect(rateBet(null, side, { target: 10, scoreA: 10, scoreB: 2 })).toBeNull()
    expect(rateBet(undefined, side, { target: 10, scoreA: 10, scoreB: 2 })).toBeNull()
    expect(rateBet(4, side, { target: 10, scoreA: 10, scoreB: 6 })?.success).toBe(true) // exactly 4
    expect(rateBet(4, side, { target: 10, scoreA: 10, scoreB: 7 })?.success).toBe(false) // 3 only
    expect(rateBet(4, { won: false, expected: 0.5 }, { target: 10, scoreA: 0, scoreB: 10 })?.success).toBe(false)
    const fanny = rateBet(5, side, { target: 5, scoreA: 0, scoreB: 5 })
    expect(fanny).toEqual({ n: 5, chance: 1 / 32, success: true, delta: 15.5 })
  })
})

describe('applyMatch with announcements', () => {
  const established = (ratings: Record<string, number>, matches = 20): RatingsState =>
    Object.fromEntries(
      Object.entries(ratings).map(([id, rating]) => [id, { rating, matches, wins: 10, losses: 10, lastPlayedAt: 0 }]),
    )
  const EQUAL = established({ a: 1000, b: 1000, c: 1000, d: 1000 })
  const base = { id: 'm', seq: 1, playedAt: 1, createdAt: 1, teamA: ['a', 'b'], teamB: ['c', 'd'] }
  const deltasOf = (state: RatingsState, match: Match): number[] => applyMatch(state, match).deltas.map((d) => d.delta)

  it('success: equal teams in 10, the Blancs announce +4 and win 10-5 (+12 base, +12,364 announcement each)', () => {
    const { deltas } = applyMatch(EQUAL, { ...base, target: 10, scoreA: 10, scoreB: 5, betA: 4 })
    expect(deltas.map((d) => d.delta)).toEqual([24.364, 24.364, -12, -12])
    expect(deltas[0].bet).toEqual({ n: 4, chance: betChance(0.5, 10, 4), success: true, delta: 12.364 })
    expect(deltas[2].bet).toBeNull()
    expect(whyFr(deltas[0])).toBe(
      'Victoire 10-5 (en 10) · 50 % de chances · marge ×1,5 · part 50 % · ' +
        'annonce +4 réussie (23 % de chances) +12,4 → +24,4',
    )
    expect(whyFr(deltas[2])).not.toContain('annonce')
  })

  it('failure by a smaller win: 10-7 for +4 costs 3,636 each on top of the win', () => {
    const { deltas } = applyMatch(EQUAL, { ...base, target: 10, scoreA: 10, scoreB: 7, betA: 4 })
    expect(deltas.map((d) => d.delta)).toEqual([6.764, 6.764, -10.4, -10.4])
    expect(deltas[0].bet?.success).toBe(false)
    expect(whyFr(deltas[0])).toContain(' · annonce +4 ratée (23 % de chances) −3,6 → +6,8')
  })

  it('failure by a loss: the announcement adds to the defeat', () => {
    const { deltas } = applyMatch(EQUAL, { ...base, target: 10, scoreA: 7, scoreB: 10, betA: 4 })
    expect(deltas.map((d) => d.delta)).toEqual([-14.036, -14.036, 10.4, 10.4])
    expect(whyFr(deltas[1])).toContain('annonce +4 ratée (23 % de chances) −3,6 → −14,0')
  })

  it('leaves the other team untouched: the match is no longer zero-sum by exactly the announcement', () => {
    const plain = deltasOf(EQUAL, { ...base, target: 10, scoreA: 10, scoreB: 5 })
    const bet = applyMatch(EQUAL, { ...base, target: 10, scoreA: 10, scoreB: 5, betA: 4 }).deltas
    expect(bet.slice(2).map((d) => d.delta)).toEqual(plain.slice(2))
    const sum = bet.reduce((total, d) => total + d.delta, 0)
    expect(sum).toBeCloseTo(2 * 12.364, 9)
  })

  it('both teams announce independently on the same match', () => {
    const { deltas } = applyMatch(EQUAL, { ...base, target: 10, scoreA: 10, scoreB: 8, betA: 2, betB: 3 })
    const plain = deltasOf(EQUAL, { ...base, target: 10, scoreA: 10, scoreB: 8 })
    const success = round3(betOutlook(0.5, 10, 2).success)
    const failure = round3(betOutlook(0.5, 10, 3).failure)
    expect(deltas[0].bet).toMatchObject({ n: 2, success: true, delta: success })
    expect(deltas[2].bet).toMatchObject({ n: 3, success: false, delta: failure })
    expect(deltas.map((d) => d.delta)).toEqual([
      round3(plain[0] + success),
      round3(plain[1] + success),
      round3(plain[2] + failure),
      round3(plain[3] + failure),
    ])
  })

  it('in 5: uses the to-5 expectation (format factor) for the chance', () => {
    const state = established({ a: 1100, b: 1100, c: 1000, d: 1000 })
    const { deltas } = applyMatch(state, { ...base, target: 5, scoreA: 5, scoreB: 3, betA: 2, betB: 1 })
    const eA = expectedScore(100, 5)
    expect(deltas[0].expected).toBe(eA)
    const chanceA = betChance(eA, 5, 2)
    const chanceB = betChance(1 - eA, 5, 1)
    expect(deltas[0].bet).toEqual({ n: 2, chance: chanceA, success: true, delta: round3(16 * (1 - chanceA)) })
    expect(deltas[3].bet).toEqual({ n: 1, chance: chanceB, success: false, delta: round3(-16 * chanceB) })
    expect(deltas[3].bet?.chance).toBeCloseTo(1 - eA, 10)
  })

  it('is not touched by the teammate split, the rookie multiplier, the margin or the fanny bonus', () => {
    const state = established({ a: 1300, b: 800, c: 1000, d: 1000 }, 0) // rookies ×3, unequal teammates
    const match: Match = { ...base, target: 10, scoreA: 10, scoreB: 0, betA: 10 } // fanny ×1,2, margin ×2
    const plain = applyMatch(state, { ...match, betA: null }).deltas
    const bet = applyMatch(state, match).deltas
    const extra = bet[0].bet?.delta ?? Number.NaN
    expect(extra).toBe(round3(16 * (1 - betChance(bet[0].expected, 10, 10))))
    expect(bet[0].delta - plain[0].delta).toBeCloseTo(extra, 2)
    expect(bet[1].delta - plain[1].delta).toBeCloseTo(extra, 2)
    expect(bet[0].bet).toEqual(bet[1].bet)
    expect(bet.slice(2)).toEqual(plain.slice(2))
  })

  it('works in a 1v1, and a null announcement is no announcement', () => {
    const state = established({ a: 1000, c: 1000 })
    const one = { ...base, teamA: ['a'], teamB: ['c'], target: 10 as const }
    const { deltas } = applyMatch(state, { ...one, scoreA: 10, scoreB: 4, betA: 6 })
    expect(deltas[0].bet?.success).toBe(true)
    expect(whyFr(deltas[0])).toContain('annonce +6 réussie')
    const without = applyMatch(state, { ...one, scoreA: 10, scoreB: 4 })
    expect(applyMatch(state, { ...one, scoreA: 10, scoreB: 4, betA: null, betB: null })).toEqual(without)
  })

  it('rejects an announcement outside 1..target', () => {
    const valid: Match = { ...base, target: 5, scoreA: 5, scoreB: 3 }
    const message = 'Invalid match m: an announced margin must be an integer in 1..target'
    for (const bad of [0, 6, 2.5, -1, Number.NaN]) {
      expect(thrownBy(() => validateMatch({ ...valid, betA: bad }))?.message, String(bad)).toBe(message)
      expect(thrownBy(() => validateMatch({ ...valid, betB: bad }))?.message, String(bad)).toBe(message)
    }
    expect(() => validateMatch({ ...valid, betA: 5, betB: 1 })).not.toThrow()
    expect(() => validateMatch({ ...valid, betA: null, betB: undefined })).not.toThrow()
  })

  it('replays deterministically and carries the announcement in the result', () => {
    const roster = [player('a', 'Alice'), player('b', 'Bob'), player('c', 'Chloé'), player('d', 'David')]
    const matches: Match[] = [
      { ...base, id: 'm1', seq: 1, target: 10, scoreA: 10, scoreB: 5, betA: 4 },
      { ...base, id: 'm2', seq: 2, playedAt: 2, createdAt: 2, target: 5, scoreA: 2, scoreB: 5, betB: 3 },
    ]
    const result = replay(roster, matches)
    expect(replay(roster, matches)).toEqual(result)
    expect(result.matches[0].deltas[0].bet?.success).toBe(true)
    expect(result.matches[1].deltas[2].bet?.success).toBe(true)
    expect(result.matches[1].deltas[0].bet).toBeNull()
  })
})
