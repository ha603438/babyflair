import { beforeEach, describe, expect, it } from 'vitest'

import { replay } from './rating'
import { MIN_POSITION_MATCHES, MIN_STREAK, PODIUM_SIZE, podium, replayOrder, topRecords } from './records'
import type { Podium, Ranking, TopRecords } from './records'
import type {
  HistoryPoint,
  Match,
  MatchId,
  MatchResult,
  Player,
  PlayerId,
  PlayerStats,
  ReplayResult,
  Target,
  Team,
} from './types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date(2026, 9, 15, 12)

const PLAYERS: Player[] = [
  { id: 'alice', name: 'Alice', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'bob', name: 'Bob', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'chloe', name: 'Chloé', isGuest: true, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'dan', name: 'Dan', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'eve', name: 'Eve', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
  { id: 'fred', name: 'Fred', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' },
]

/** Local noon of an October 2026 day, plus `minutes` (several matches on one day). */
function day(n: number, minutes = 0): string {
  return new Date(2026, 9, n, 12, minutes).toISOString()
}

type GameOptions = {
  at?: string
  loserGoals?: number
  target?: Target
  comeback?: boolean
  winnerSide?: Team
  seq?: number
}

let counter = 0

function comebackOf(options: GameOptions): Pick<Match, 'comeback'> {
  if (options.comeback === undefined) return {}
  return { comeback: options.comeback }
}

/** One match won by `winners` (team A unless `winnerSide` is 'B'); ids m1, m2… in creation order. */
function game(winners: PlayerId[], losers: PlayerId[], options: GameOptions = {}): Match {
  counter += 1
  const target = options.target ?? 10
  const loserGoals = options.loserGoals ?? 5
  const playedAt = options.at ?? new Date(2026, 9, 1, 8, counter).toISOString()
  const base = { id: `m${counter}`, seq: options.seq ?? counter, playedAt, createdAt: playedAt, updatedAt: playedAt }
  const comeback = comebackOf(options)
  if (options.winnerSide === 'B') {
    return { ...base, target, teamA: losers, teamB: winners, scoreA: loserGoals, scoreB: target, ...comeback }
  }
  return { ...base, target, teamA: winners, teamB: losers, scoreA: target, scoreB: loserGoals, ...comeback }
}

function times(n: number, make: () => Match): Match[] {
  return Array.from({ length: n }, make)
}

function recordsOf(matches: Match[], players: Player[] = PLAYERS): TopRecords {
  return topRecords(players, matches, replay(players, matches, { now: NOW }))
}

/** [rank, …identifying fields] of each podium place, for compact expectations. */
function ranksOf<T>(result: Podium<T>, pick: (line: T) => unknown): unknown[] {
  return result.places.map((place) => [place.rank, pick(place.line)])
}

beforeEach(() => {
  counter = 0
})

// ---------------------------------------------------------------------------
// Replay order and podium
// ---------------------------------------------------------------------------

describe('replayOrder', () => {
  it('orders by playedAt, then seq, then id, whatever the array order', () => {
    const late = game(['alice'], ['bob'], { at: day(3) })
    const early = game(['alice'], ['bob'], { at: day(1) })
    const sameTimeHighSeq = game(['alice'], ['bob'], { at: day(2), seq: 20 })
    const sameTimeLowSeq = game(['alice'], ['bob'], { at: day(2), seq: 10 })
    const ids = replayOrder([late, early, sameTimeHighSeq, sameTimeLowSeq]).map((match) => match.id)
    expect(ids).toEqual([early.id, sameTimeLowSeq.id, sameTimeHighSeq.id, late.id])
  })

  it('breaks a full tie on the id and never mutates its input', () => {
    const b = { ...game(['alice'], ['bob'], { at: day(1), seq: 1 }), id: 'b' }
    const a = { ...game(['alice'], ['bob'], { at: day(1), seq: 1 }), id: 'a' }
    const input = [b, a]
    expect(replayOrder(input).map((match) => match.id)).toEqual(['a', 'b'])
    expect(input.map((match) => match.id)).toEqual(['b', 'a'])
  })
})

describe('podium', () => {
  const byValue: Ranking<{ name: string; value: number }> = {
    compare: (a, b) => b.value - a.value || a.name.localeCompare(b.name),
    tied: (a, b) => a.value === b.value,
  }
  const line = (name: string, value: number) => ({ name, value })

  it('keeps the top 3 in competition ranking: ex æquo share their rank, the next one skips', () => {
    const result = podium([line('c', 5), line('a', 9), line('b', 9), line('d', 2)], byValue)
    expect(ranksOf(result, (l) => l.name)).toEqual([
      [1, 'a'],
      [1, 'b'],
      [3, 'c'],
    ])
  })

  it('shows every ex æquo of the 1st place, the next rank falling off the podium', () => {
    const result = podium([line('d', 5), line('c', 9), line('a', 9), line('b', 9)], byValue)
    expect(ranksOf(result, (l) => l.name)).toEqual([
      [1, 'a'],
      [1, 'b'],
      [1, 'c'],
    ])
  })

  it('shows every ex æquo of the 2nd place', () => {
    const result = podium([line('a', 9), line('b', 5), line('c', 5), line('d', 5), line('e', 5), line('f', 1)], byValue)
    expect(ranksOf(result, (l) => l.name)).toEqual([
      [1, 'a'],
      [2, 'b'],
      [2, 'c'],
      [2, 'd'],
      [2, 'e'],
    ])
  })

  it('shows every ex æquo of the 3rd place, nothing below it', () => {
    const lines = [line('a', 9), line('b', 7), line('c', 5), line('d', 5), line('e', 5), line('f', 1)]
    expect(ranksOf(podium(lines, byValue), (l) => l.name)).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
      [3, 'd'],
      [3, 'e'],
    ])
  })

  it('keeps a whole podium of ex æquo, however many', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const all = podium(names.map((name) => line(name, 4)), byValue)
    expect(all.places.map((place) => place.rank)).toEqual(names.map(() => 1))
    const mixed = podium([line('a', 9), line('b', 9), line('c', 5), line('d', 5), line('e', 5), line('f', 1)], byValue)
    expect(ranksOf(mixed, (l) => l.name)).toEqual([
      [1, 'a'],
      [1, 'b'],
      [3, 'c'],
      [3, 'd'],
      [3, 'e'],
    ])
  })

  it('handles short and empty lists', () => {
    expect(podium([line('a', 1)], byValue)).toEqual({ places: [{ rank: 1, line: line('a', 1) }] })
    expect(podium([], byValue)).toEqual({ places: [] })
    expect(PODIUM_SIZE).toBe(3)
  })
})

describe('topRecords on an empty history', () => {
  it('has no line in any record, with or without players', () => {
    for (const players of [PLAYERS, []]) {
      const records = recordsOf([], players)
      for (const record of Object.values(records)) expect(record).toEqual({ places: [] })
    }
  })
})

// ---------------------------------------------------------------------------
// Postes
// ---------------------------------------------------------------------------

describe('Postes (Meilleur avant / arrière)', () => {
  // Teams are [arrière, avant]. Avant: Alice 4-1, Bob 3-2, Chloé 2-3, Fred 1-4; arrière: Dan 6-4, Eve 4-6.
  function positions(): Match[] {
    return [
      ...times(4, () => game(['dan', 'alice'], ['eve', 'fred'])),
      game(['eve', 'fred'], ['dan', 'alice']),
      ...times(3, () => game(['eve', 'bob'], ['dan', 'chloe'], { winnerSide: 'B' })),
      ...times(2, () => game(['dan', 'chloe'], ['eve', 'bob'])),
      // 1v1 matches count for no position.
      game(['fred'], ['alice']),
    ]
  }

  it('ranks by win rate at the position, value as wins and losses', () => {
    const records = recordsOf(positions())
    expect(ranksOf(records.avant, (l) => [l.playerId, l.wins, l.losses])).toEqual([
      [1, ['alice', 4, 1]],
      [2, ['bob', 3, 2]],
      [3, ['chloe', 2, 3]],
    ])
    expect(ranksOf(records.arriere, (l) => [l.playerId, l.wins, l.losses])).toEqual([
      [1, ['dan', 6, 4]],
      [2, ['eve', 4, 6]],
    ])
  })

  it('needs 5 matches at the position', () => {
    expect(MIN_POSITION_MATCHES).toBe(5)
    const four = times(4, () => game(['dan', 'alice'], ['eve', 'fred']))
    expect(recordsOf(four).avant.places).toEqual([])
    expect(recordsOf(four).arriere.places).toEqual([])
    const five = [...four, game(['eve', 'fred'], ['dan', 'alice'])]
    expect(recordsOf(five).avant.places.map((place) => place.line.playerId)).toEqual(['alice', 'fred'])
  })

  it('on the same rate, more matches first; same rate and matches → ex æquo, by name', () => {
    const matches = [
      // Avant: Bob 8-2 (80 % over 10), Alice 4-1 (80 % over 5), Chloé 4-1 too; the losing avants are Dan and Eve.
      ...times(8, () => game(['fred', 'bob'], ['eve', 'dan'])),
      ...times(2, () => game(['eve', 'dan'], ['fred', 'bob'])),
      ...times(4, () => game(['fred', 'chloe'], ['eve', 'dan'])),
      game(['eve', 'dan'], ['fred', 'chloe']),
      ...times(4, () => game(['fred', 'alice'], ['eve', 'dan'])),
      game(['eve', 'dan'], ['fred', 'alice']),
    ]
    expect(ranksOf(recordsOf(matches).avant, (l) => l.playerId)).toEqual([
      [1, 'bob'],
      [2, 'alice'],
      [2, 'chloe'],
    ])
  })
})

// ---------------------------------------------------------------------------
// Séries
// ---------------------------------------------------------------------------

describe('Séries (victoires / défaites)', () => {
  it('keeps each player’s longest run with its days, not « en cours » once broken', () => {
    const matches = [
      game(['alice'], ['bob'], { at: day(1) }),
      game(['alice'], ['bob'], { at: day(2) }),
      game(['alice'], ['bob'], { at: day(3) }),
      game(['bob'], ['alice'], { at: day(4) }),
      game(['alice'], ['bob'], { at: day(5) }),
    ]
    const records = recordsOf(matches)
    expect(records.winStreak.places).toEqual([
      {
        rank: 1,
        line: {
          playerId: 'alice',
          kind: 'win',
          length: 3,
          from: day(1),
          to: day(3),
          lastMatchId: 'm3',
          ongoing: false,
        },
      },
    ])
    expect(records.lossStreak.places.map((place) => place.line)).toEqual([
      { playerId: 'bob', kind: 'loss', length: 3, from: day(1), to: day(3), lastMatchId: 'm3', ongoing: false },
    ])
  })

  it('takes the most recent of two equal runs, « en cours » when it ends with the last match', () => {
    const matches = [
      game(['alice'], ['bob'], { at: day(1) }),
      game(['alice'], ['bob'], { at: day(2) }),
      game(['bob'], ['alice'], { at: day(3) }),
      game(['alice'], ['chloe'], { at: day(4) }),
      game(['alice'], ['chloe'], { at: day(9) }),
    ]
    const records = recordsOf(matches)
    expect(records.winStreak.places).toHaveLength(1)
    expect(records.winStreak.places[0].line).toMatchObject({ playerId: 'alice', length: 2, from: day(4), to: day(9) })
    expect(records.winStreak.places[0].line.ongoing).toBe(true)
    // Bob and Chloé both lost twice in a row: ex æquo, the most recent run (Chloé's, still running) first.
    expect(ranksOf(records.lossStreak, (l) => [l.playerId, l.ongoing])).toEqual([
      [1, ['chloe', true]],
      [1, ['bob', false]],
    ])
  })

  it('lists a player once, needs 2 results in a row and ranks longer runs first', () => {
    expect(MIN_STREAK).toBe(2)
    const matches = [
      game(['alice'], ['bob']),
      game(['bob'], ['alice']),
      game(['alice'], ['bob']),
      game(['bob'], ['alice']),
    ]
    expect(recordsOf(matches).winStreak.places).toEqual([])
    expect(recordsOf(matches).lossStreak.places).toEqual([])
    const longer = [
      ...times(4, () => game(['dan'], ['eve'])),
      ...times(2, () => game(['chloe'], ['fred'])),
      ...times(3, () => game(['dan', 'chloe'], ['eve', 'fred'])),
    ]
    expect(ranksOf(recordsOf(longer).winStreak, (l) => [l.playerId, l.length])).toEqual([
      [1, ['dan', 7]],
      [2, ['chloe', 5]],
    ])
    expect(ranksOf(recordsOf(longer).lossStreak, (l) => [l.playerId, l.length])).toEqual([
      [1, ['eve', 7]],
      [2, ['fred', 5]],
    ])
  })

  it('follows the replay order (playedAt, then seq), not the array order', () => {
    // In array order Alice would alternate W L W L; in replay order she wins 2, then loses 2.
    const matches = [
      game(['alice'], ['bob'], { at: day(1) }),
      game(['bob'], ['alice'], { at: day(3) }),
      game(['alice'], ['bob'], { at: day(2), seq: 5 }),
      game(['bob'], ['alice'], { at: day(2), seq: 6 }),
    ]
    const records = recordsOf(matches)
    // Bob then wins 2 too, more recently (still running): ex æquo, Bob first.
    expect(ranksOf(records.winStreak, (l) => [l.playerId, l.from, l.to, l.ongoing])).toEqual([
      [1, ['bob', day(2), day(3), true]],
      [1, ['alice', day(1), day(2), false]],
    ])
    expect(records.lossStreak.places[0].line).toMatchObject({ playerId: 'alice', length: 2, ongoing: true })
  })

  it('gives teammates of the same run the same rank, by name', () => {
    const matches = times(3, () => game(['dan', 'alice'], ['eve', 'bob']))
    expect(ranksOf(recordsOf(matches).winStreak, (l) => l.playerId)).toEqual([
      [1, 'alice'],
      [1, 'dan'],
    ])
  })
})

// ---------------------------------------------------------------------------
// Fanny et comebacks, assiduité
// ---------------------------------------------------------------------------

describe('Fanny et comebacks', () => {
  it('counts fannys given and conceded per player, 2v2 teammates each', () => {
    const matches = [
      game(['alice', 'bob'], ['chloe', 'dan'], { loserGoals: 0 }),
      game(['alice'], ['chloe'], { loserGoals: 0, target: 5 }),
      game(['eve'], ['chloe'], { loserGoals: 0 }),
      game(['chloe'], ['alice'], { loserGoals: 1 }),
    ]
    const records = recordsOf(matches)
    expect(ranksOf(records.fannyGiven, (l) => [l.playerId, l.count])).toEqual([
      [1, ['alice', 2]],
      [2, ['bob', 1]],
      [2, ['eve', 1]],
    ])
    expect(ranksOf(records.fannyTaken, (l) => [l.playerId, l.count])).toEqual([
      [1, ['chloe', 3]],
      [2, ['dan', 1]],
    ])
  })

  it('counts comebacks made and conceded: 5-4 in 5 with the box ticked only', () => {
    const matches = [
      game(['alice'], ['bob'], { target: 5, loserGoals: 4, comeback: true }),
      game(['alice', 'chloe'], ['bob', 'dan'], { target: 5, loserGoals: 4, comeback: true, winnerSide: 'B' }),
      game(['dan'], ['bob'], { target: 5, loserGoals: 4 }),
      // A stray flag on another score is not a comeback.
      game(['eve'], ['bob'], { target: 10, loserGoals: 4, comeback: true }),
    ]
    const records = recordsOf(matches)
    expect(ranksOf(records.comebacks, (l) => [l.playerId, l.count])).toEqual([
      [1, ['alice', 2]],
      [2, ['chloe', 1]],
    ])
    expect(ranksOf(records.comebacksTaken, (l) => [l.playerId, l.count])).toEqual([
      [1, ['bob', 2]],
      [2, ['dan', 1]],
    ])
  })

  it('stays empty below 1', () => {
    const records = recordsOf([game(['alice'], ['bob']), game(['bob'], ['alice'], { target: 5, loserGoals: 4 })])
    expect(records.fannyGiven.places).toEqual([])
    expect(records.fannyTaken.places).toEqual([])
    expect(records.comebacks.places).toEqual([])
    expect(records.comebacksTaken.places).toEqual([])
  })
})

describe('Le plus assidu', () => {
  it('counts every match played (1v1 and 2v2), every ex æquo shown by name', () => {
    const matches = [
      game(['alice', 'bob'], ['chloe', 'dan']),
      game(['alice'], ['eve']),
      game(['eve'], ['fred']),
    ]
    const records = recordsOf(matches)
    expect(ranksOf(records.played, (l) => [l.playerId, l.count])).toEqual([
      [1, ['alice', 2]],
      [1, ['eve', 2]],
      [3, ['bob', 1]],
      [3, ['chloe', 1]],
      [3, ['dan', 1]],
      [3, ['fred', 1]],
    ])
  })
})

// ---------------------------------------------------------------------------
// Points: fabricated replay results for exact control
// ---------------------------------------------------------------------------

function point(matchId: MatchId, ratingAfter: number, delta = 0): HistoryPoint {
  return { matchId, playedAt: day(Number(matchId.slice(1))), ratingBefore: ratingAfter - delta, ratingAfter, delta }
}

function statsOf(playerId: PlayerId, history: HistoryPoint[]): PlayerStats {
  const base = { playerId, rating: 1000, played: history.length, wins: 0, losses: 0 }
  return { ...base, status: 'rookie', rookieProgress: history.length, history }
}

function resultOf(matchId: MatchId, expectedA: number, deltas: Array<[PlayerId, Team, number]> = []): MatchResult {
  const perPlayer = deltas.map(([playerId, team, delta]) => ({ playerId, team, before: 0, after: 0, delta, why: '' }))
  return { matchId, expectedA, expectedB: 1 - expectedA, perPlayer, bets: [] }
}

function fabricated(byPlayer: PlayerStats[], byMatch: MatchResult[]): ReplayResult {
  return {
    byPlayer: new Map(byPlayer.map((stats) => [stats.playerId, stats])),
    byMatch: new Map(byMatch.map((result) => [result.matchId, result])),
  }
}

/** Match n on October n: Alice & Bob (team A) against Chloé & Dan (team B), team B winning the even ones. */
function fixedTeams(n: number): Match {
  if (n % 2 === 0) return game(['chloe', 'dan'], ['alice', 'bob'], { at: day(n), winnerSide: 'B' })
  return game(['alice', 'bob'], ['chloe', 'dan'], { at: day(n) })
}

/** m1…m5 on October 1…5 (fixedTeams). */
function fiveMatches(): Match[] {
  return [1, 2, 3, 4, 5].map(fixedTeams)
}

describe('Record de points', () => {
  it('takes each player’s peak rounded like the app, with the match that first reached it', () => {
    const result = fabricated(
      [
        statsOf('alice', [point('m1', 1050.2), point('m2', 1040), point('m3', 1050.2), point('m4', 1031)]),
        statsOf('bob', [point('m1', 990), point('m2', 1010), point('m3', 1049.6)]),
        statsOf('chloe', []),
        statsOf('dan', [point('m1', 1000.5)]),
        statsOf('eve', [point('m5', 1020.4)]),
      ],
      [],
    )
    const records = topRecords(PLAYERS, fiveMatches(), result)
    expect(ranksOf(records.peak, (l) => [l.playerId, l.rating, l.matchId, l.playedAt])).toEqual([
      // Alice reached 1 050 first (m1), Bob later (m3): ex æquo, the first to reach it first.
      [1, ['alice', 1050, 'm1', day(1)]],
      [1, ['bob', 1050, 'm3', day(3)]],
      [3, ['eve', 1020, 'm5', day(5)]],
    ])
  })
})

describe('Plus gros exploit', () => {
  it('lists the wins with the lowest chance of the winners, one entry per match, under 50 % only', () => {
    const result = fabricated(
      [],
      [
        resultOf('m1', 0.3), // A won at 30 %
        resultOf('m2', 0.8), // B won at 20 %
        resultOf('m3', 0.6), // A won at 60 %: no exploit
        resultOf('m4', 0.5), // B won at 50 %: no exploit
        resultOf('m5', 0.204), // A won at 20,4 %: same displayed 20 % as m2
      ],
    )
    const records = topRecords(PLAYERS, fiveMatches(), result)
    expect(ranksOf(records.exploit, (l) => [l.matchId, l.winners, l.chance])).toEqual([
      [1, ['m2', ['chloe', 'dan'], 1 - 0.8]],
      [1, ['m5', ['alice', 'bob'], 0.204]],
      [3, ['m1', ['alice', 'bob'], 0.3]],
    ])
    expect(records.exploit.places[0].line.playedAt).toBe(day(2))
  })

  it('puts the most recent match first on an exactly equal chance', () => {
    const result = fabricated([], [resultOf('m1', 0.25), resultOf('m3', 0.25)])
    expect(ranksOf(topRecords(PLAYERS, fiveMatches(), result).exploit, (l) => l.matchId)).toEqual([
      [1, 'm3'],
      [1, 'm1'],
    ])
  })

  it('stays empty without an underdog win', () => {
    const result = fabricated([], [resultOf('m1', 0.5), resultOf('m2', 0.4)])
    expect(topRecords(PLAYERS, fiveMatches(), result).exploit.places).toEqual([])
  })
})

describe('Plus gros gain en un match', () => {
  it('ranks single-match deltas, ex æquo on the rounded value, a player possibly twice', () => {
    const result = fabricated(
      [],
      [
        resultOf('m1', 0.5, [
          ['alice', 'A', 12.4],
          ['bob', 'A', 11.4],
          ['chloe', 'B', -12],
          ['dan', 'B', -12],
        ]),
        resultOf('m2', 0.5, [['chloe', 'B', 30.2]]),
        resultOf('m3', 0.5, [['alice', 'A', 30.4]]),
        resultOf('m5', 0.5, [['alice', 'A', 12.3]]),
      ],
    )
    const records = topRecords(PLAYERS, fiveMatches(), result)
    expect(ranksOf(records.gain, (l) => [l.playerId, l.matchId, l.delta])).toEqual([
      [1, ['alice', 'm3', 30.4]],
      [1, ['chloe', 'm2', 30.2]],
      [3, ['alice', 'm1', 12.4]],
      // Alice's +12,3 rounds like her +12,4: ex æquo at the 3rd place; Bob's +11,4 (5th) is left out.
      [3, ['alice', 'm5', 12.3]],
    ])
    expect(records.gain.places[0].line.playedAt).toBe(day(3))
  })
})

describe('Points from the real replay', () => {
  it('finds the upset, the gains and the peaks of the engine’s result', () => {
    const matches = [
      game(['alice'], ['bob'], { at: day(1) }),
      game(['alice'], ['bob'], { at: day(2) }),
      game(['alice'], ['bob'], { at: day(3) }),
      game(['bob'], ['alice'], { at: day(4) }),
    ]
    const result = replay(PLAYERS, matches, { now: NOW })
    const records = topRecords(PLAYERS, matches, result)
    const upset = result.byMatch.get('m4')
    expect(records.exploit.places).toHaveLength(1)
    expect(records.exploit.places[0].line).toEqual({
      matchId: 'm4',
      winners: ['bob'],
      // Bob was team A.
      chance: upset?.expectedA,
      playedAt: day(4),
    })
    const deltas = [...result.byMatch.values()].flatMap((r) => r.perPlayer.map((p) => p.delta))
    expect(records.gain.places[0].line.delta).toBe(Math.max(...deltas))
    const alice = result.byPlayer.get('alice')?.history ?? []
    expect(records.peak.places[0].line).toMatchObject({
      playerId: 'alice',
      rating: Math.round(Math.max(...alice.map((p) => p.ratingAfter))),
      matchId: 'm3',
    })
  })
})

// ---------------------------------------------------------------------------
// Fidélité: duos and rivalries
// ---------------------------------------------------------------------------

describe('Duo inséparable and Plus grosse rivalité', () => {
  function fidelity(): Match[] {
    return [
      game(['alice', 'bob'], ['chloe', 'dan']),
      game(['bob', 'alice'], ['chloe', 'dan']),
      game(['chloe', 'dan'], ['alice', 'bob']),
      game(['alice', 'chloe'], ['bob', 'dan']),
      game(['alice'], ['bob']),
    ]
  }

  it('counts the 2v2 matches of each pair of teammates, in any order', () => {
    const records = recordsOf(fidelity())
    expect(ranksOf(records.duo, (l) => [l.duoId, l.members, l.matches, l.wins, l.losses])).toEqual([
      [1, ['alice+bob', ['alice', 'bob'], 3, 2, 1]],
      [1, ['chloe+dan', ['chloe', 'dan'], 3, 1, 2]],
      [3, ['alice+chloe', ['alice', 'chloe'], 1, 1, 0]],
      [3, ['bob+dan', ['bob', 'dan'], 1, 0, 1]],
    ])
  })

  it('counts the matches as opponents (1v1 and 2v2), the one ahead in the head-to-head first', () => {
    const records = recordsOf(fidelity())
    expect(ranksOf(records.rivalry, (l) => [l.players, l.matches, l.wins])).toEqual([
      [1, [['alice', 'dan'], 4, [3, 1]]],
      // 2–2: alphabetical order.
      [1, [['bob', 'chloe'], 4, [2, 2]]],
      [3, [['alice', 'chloe'], 3, [2, 1]]],
      [3, [['bob', 'dan'], 3, [2, 1]]],
    ])
  })

  it('puts the leader of the head-to-head first even when the name comes later', () => {
    const matches = [game(['bob'], ['alice']), game(['bob'], ['alice']), game(['alice'], ['bob'])]
    expect(recordsOf(matches).rivalry.places[0].line).toEqual({ players: ['bob', 'alice'], matches: 3, wins: [2, 1] })
  })

  it('has no duo without a 2v2 match', () => {
    const records = recordsOf([game(['alice'], ['bob'])])
    expect(records.duo.places).toEqual([])
    expect(records.rivalry.places.map((place) => place.line.players)).toEqual([['alice', 'bob']])
  })
})

describe('Plus grosse rivalité de duos', () => {
  it('counts the 2v2 matches of each pair of duos, the duo ahead first, 1v1 ignored', () => {
    const matches = [
      game(['alice', 'bob'], ['chloe', 'dan']),
      // Same duos, members in another order and sides swapped: still the same pair of duos.
      game(['bob', 'alice'], ['dan', 'chloe'], { winnerSide: 'B' }),
      game(['chloe', 'dan'], ['alice', 'bob']),
      game(['alice', 'chloe'], ['bob', 'dan']),
      ...times(4, () => game(['alice'], ['bob'])),
    ]
    expect(ranksOf(recordsOf(matches).duoRivalry, (l) => [l.duos, l.matches, l.wins])).toEqual([
      [
        1,
        [
          [
            ['alice', 'bob'],
            ['chloe', 'dan'],
          ],
          3,
          [2, 1],
        ],
      ],
      [
        2,
        [
          [
            ['alice', 'chloe'],
            ['bob', 'dan'],
          ],
          1,
          [1, 0],
        ],
      ],
    ])
  })

  it('puts the duo ahead in the head-to-head first even when its name comes later; level → alphabetical', () => {
    const ahead = [
      game(['chloe', 'dan'], ['alice', 'bob']),
      game(['chloe', 'dan'], ['alice', 'bob']),
      game(['alice', 'bob'], ['chloe', 'dan']),
    ]
    expect(recordsOf(ahead).duoRivalry.places[0].line).toEqual({
      duos: [
        ['chloe', 'dan'],
        ['alice', 'bob'],
      ],
      matches: 3,
      wins: [2, 1],
    })
    // 1–1 between « Aaron & Eve » (id zed+eve, sorting after bob+dan) and « Bob & Dan »: alphabetical by duo name.
    const aaron: Player = { id: 'zed', name: 'Aaron', isGuest: false, createdAt: '2026-09-01T10:00:00.000Z' }
    const level = [game(['zed', 'eve'], ['dan', 'bob']), game(['dan', 'bob'], ['zed', 'eve'])]
    expect(recordsOf(level, [...PLAYERS, aaron]).duoRivalry.places[0].line).toEqual({
      duos: [
        ['eve', 'zed'],
        ['bob', 'dan'],
      ],
      matches: 2,
      wins: [1, 1],
    })
  })

  it('ranks ex æquo pairs of duos together, by the two duo names whichever duo leads', () => {
    const matches = [
      // « Dan & Eve » lead « Alice & Chloé » 2–0: the pair sorts as « Alice & Chloé – Dan & Eve ».
      ...times(2, () => game(['dan', 'eve'], ['alice', 'chloe'])),
      // « Bob & Fred » lead « Chloé & Eve » 2–0: the pair sorts as « Bob & Fred – Chloé & Eve », after the first one.
      ...times(2, () => game(['bob', 'fred'], ['chloe', 'eve'])),
      game(['alice', 'bob'], ['dan', 'fred']),
    ]
    expect(ranksOf(recordsOf(matches).duoRivalry, (l) => [l.duos[0], l.duos[1], l.matches])).toEqual([
      [1, [['dan', 'eve'], ['alice', 'chloe'], 2]],
      [1, [['bob', 'fred'], ['chloe', 'eve'], 2]],
      [3, [['alice', 'bob'], ['dan', 'fred'], 1]],
    ])
  })

  it('stays empty without a 2v2 match', () => {
    expect(recordsOf([game(['alice'], ['bob']), game(['chloe'], ['dan'])]).duoRivalry.places).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Couilles sur la table: announcements, rated by the real replay
// ---------------------------------------------------------------------------

/** `player` announces +1 against Fred and wins: a success. */
function madeIt(player: PlayerId): Match {
  return { ...game([player], ['fred']), betA: 1 }
}

/** `player` announces +6 against Fred and wins 10-5 only: a failure. */
function missedIt(player: PlayerId): Match {
  return { ...game([player], ['fred']), betA: 6 }
}

describe('Couilles sur la table', () => {
  it('counts each member of an announcing team (Flambeur, Mytho) and each opponent of a failed one (Briseur)', () => {
    const matches = [
      { ...game(['alice', 'bob'], ['chloe', 'dan']), betA: 1 },
      { ...game(['alice', 'bob'], ['chloe', 'dan']), betA: 6 },
      // Alice on the Noirs this time: she loses, so her +2 fails, broken by Eve.
      { ...game(['eve'], ['alice']), betB: 2 },
    ]
    const records = recordsOf(matches)
    expect(ranksOf(records.betsMade, (l) => [l.playerId, l.count])).toEqual([
      [1, ['alice', 3]],
      [2, ['bob', 2]],
    ])
    expect(ranksOf(records.betsFailed, (l) => [l.playerId, l.count])).toEqual([
      [1, ['alice', 2]],
      [2, ['bob', 1]],
    ])
    expect(ranksOf(records.betsBroken, (l) => [l.playerId, l.count])).toEqual([
      [1, ['chloe', 1]],
      [1, ['dan', 1]],
      [1, ['eve', 1]],
    ])
  })

  it('« Nostradamus » needs 3 announcements and 1 success; ties → more successes, ex æquo on the same rate and successes', () => {
    const matches = [
      ...times(3, () => madeIt('dan')),
      ...times(4, () => madeIt('bob')),
      ...times(2, () => missedIt('bob')),
      ...times(2, () => madeIt('chloe')),
      missedIt('chloe'),
      ...times(2, () => madeIt('alice')),
      missedIt('alice'),
      // 2 out of 2, but only 2 announcements.
      ...times(2, () => madeIt('eve')),
    ]
    expect(ranksOf(recordsOf(matches).betRate, (l) => [l.playerId, l.won, l.made])).toEqual([
      [1, ['dan', 3, 3]],
      [2, ['bob', 4, 6]],
      [3, ['alice', 2, 3]],
      [3, ['chloe', 2, 3]],
    ])
  })

  it('« Nostradamus » leaves out a player with no success', () => {
    expect(recordsOf(times(3, () => missedIt('dan'))).betRate.places).toEqual([])
  })

  it('« Coup de poker »: the successful announcement with the lowest chance, the most recent first on a tie', () => {
    const matches = [
      // Everybody at 1000: +4 in 10 at even odds, twice (Eve as the Noirs), the same chance.
      { ...game(['alice', 'bob'], ['chloe', 'dan'], { loserGoals: 2 }), betA: 4 },
      { ...game(['eve'], ['fred'], { loserGoals: 2, winnerSide: 'B' }), betB: 4 },
      // Favourites now, +1 only: a better chance.
      { ...game(['alice', 'bob'], ['chloe', 'dan'], { loserGoals: 9 }), betA: 1 },
      // Chloé & Dan announce +10 and lose: the lowest chance of all, but a failure.
      { ...game(['alice', 'bob'], ['chloe', 'dan']), betB: 10 },
    ]
    const { places } = recordsOf(matches).betLongshot
    expect(places.map((place) => [place.rank, place.line.matchId, place.line.team, place.line.players])).toEqual([
      [1, 'm2', 'B', ['eve']],
      [1, 'm1', 'A', ['alice', 'bob']],
      [3, 'm3', 'A', ['alice', 'bob']],
    ])
    expect(places[0].line.chance).toBeCloseTo(places[1].line.chance, 12)
    expect(places[0].line.chance).toBeLessThan(places[2].line.chance)
    expect(places[0].line).toMatchObject({ n: 4, playedAt: matches[1].playedAt })
  })

  it('stays empty without an announcement', () => {
    const records = recordsOf([game(['alice'], ['bob']), game(['alice', 'bob'], ['chloe', 'dan'])])
    for (const key of ['betsMade', 'betRate', 'betsFailed', 'betLongshot', 'betsBroken'] as const) {
      expect(records[key].places).toEqual([])
    }
  })
})
