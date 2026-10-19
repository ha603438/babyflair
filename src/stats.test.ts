import { describe, expect, it } from 'vitest'

import type { ImportResult } from './stats'
import {
  buildExport,
  chipOrder,
  currentStreak,
  favouritePartner,
  isInactive,
  rankIndexOf,
  sevenDayDelta,
  sortByName,
  teamLabel,
  validateImport,
  positionOf,
  positionRecord,
  sideRecord,
  bestAlly,
  nemesis,
  fannyComebackRecord,
  isComeback,
  isComebackScore,
  isFanny,
  withValidComeback,
} from './stats'
import type { HistoryPoint, Match, MatchId, Player, PlayerId, PlayerStats, Ranking, Settings, Store, Target } from './types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2025-10-10T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

const A = 'alice'
const B = 'bob'
const C = 'chloe'
const D = 'dan'
const E = 'elodie'
const F = 'fanny'

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString()
}

function player(id: PlayerId, name: string, extra: Partial<Player> = {}): Player {
  return { id, name, isGuest: false, createdAt: daysAgo(100), ...extra }
}

type MatchInput = {
  id: MatchId
  teamA: PlayerId[]
  teamB: PlayerId[]
  scoreA: number
  scoreB: number
  target?: Target
  playedAt?: string
  seq?: number
}

function match(input: MatchInput): Match {
  const playedAt = input.playedAt ?? daysAgo(1)
  return {
    id: input.id,
    seq: input.seq ?? 1,
    playedAt,
    createdAt: playedAt,
    updatedAt: playedAt,
    target: input.target ?? 10,
    teamA: input.teamA,
    teamB: input.teamB,
    scoreA: input.scoreA,
    scoreB: input.scoreB,
  }
}

function point(matchId: MatchId, playedAt: string, delta: number, ratingBefore = 1000): HistoryPoint {
  return { matchId, playedAt, ratingBefore, ratingAfter: ratingBefore + delta, delta }
}

function stats(playerId: PlayerId, history: HistoryPoint[], extra: Partial<PlayerStats> = {}): PlayerStats {
  const last = history.at(-1)
  return {
    playerId,
    rating: last?.ratingAfter ?? 1000,
    played: history.length,
    wins: 0,
    losses: 0,
    lastPlayedAt: last?.playedAt,
    status: 'ranked',
    rookieProgress: Math.min(history.length, 10),
    history,
    ...extra,
  }
}

function matchMap(matches: Match[]): Map<MatchId, Match> {
  return new Map(matches.map((m): [MatchId, Match] => [m.id, m]))
}

function playerMap(players: Player[]): Map<PlayerId, Player> {
  return new Map(players.map((p): [PlayerId, Player] => [p.id, p]))
}

function statsMap(entries: PlayerStats[]): Map<PlayerId, PlayerStats> {
  return new Map(entries.map((s): [PlayerId, PlayerStats] => [s.playerId, s]))
}

function ids(players: Player[]): PlayerId[] {
  return players.map((p) => p.id)
}

function sampleStore(): Store {
  const players = [player(A, 'Alice'), player(B, 'Bob'), player(C, 'Chloé', { isGuest: true }), player(D, 'Dan')]
  const matches = [
    match({ id: 'm1', seq: 1, teamA: [A, B], teamB: [C, D], scoreA: 10, scoreB: 8, playedAt: daysAgo(2) }),
    match({ id: 'm2', seq: 2, teamA: [A], teamB: [C], scoreA: 3, scoreB: 5, target: 5, playedAt: daysAgo(1) }),
  ]
  const settings: Settings = { lastFormat: '1v1', lastTarget: 5, lastExportAt: daysAgo(12) }
  return { version: 1, players, matches, settings, nextSeq: 3, calls: [], callPlayers: [] }
}

// ---------------------------------------------------------------------------
// sevenDayDelta
// ---------------------------------------------------------------------------

describe('sevenDayDelta', () => {
  it('returns null without any history', () => {
    expect(sevenDayDelta(stats(A, []), NOW)).toBeNull()
  })

  it('returns null when every match is older than 7 days', () => {
    const s = stats(A, [point('m1', daysAgo(8), 12), point('m2', daysAgo(30), -4)])
    expect(sevenDayDelta(s, NOW)).toBeNull()
  })

  it('sums only the deltas of the last 7 days', () => {
    const s = stats(A, [point('m1', daysAgo(10), 20), point('m2', daysAgo(3), 16), point('m3', daysAgo(1), -9)])
    expect(sevenDayDelta(s, NOW)).toBe(7)
  })

  it('includes a match played exactly 7 days ago', () => {
    expect(sevenDayDelta(stats(A, [point('m1', daysAgo(7), 5)]), NOW)).toBe(5)
  })

  it('returns 0 rather than null when the deltas cancel out', () => {
    const s = stats(A, [point('m1', daysAgo(2), 11), point('m2', daysAgo(1), -11)])
    expect(sevenDayDelta(s, NOW)).toBe(0)
  })

  it('ignores points whose date cannot be parsed', () => {
    expect(sevenDayDelta(stats(A, [point('m1', 'pas une date', 5)]), NOW)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// currentStreak
// ---------------------------------------------------------------------------

describe('currentStreak', () => {
  // A: loss, win (team B), win (1v1 en 5), loss, loss
  const m1 = match({ id: 'm1', teamA: [A, B], teamB: [C, D], scoreA: 6, scoreB: 10, playedAt: daysAgo(5) })
  const m2 = match({ id: 'm2', teamA: [C, D], teamB: [A, B], scoreA: 3, scoreB: 10, playedAt: daysAgo(4) })
  const m3 = match({ id: 'm3', teamA: [A], teamB: [C], scoreA: 5, scoreB: 2, target: 5, playedAt: daysAgo(3) })
  const m4 = match({ id: 'm4', teamA: [A], teamB: [D], scoreA: 9, scoreB: 10, playedAt: daysAgo(2) })
  const m5 = match({ id: 'm5', teamA: [B], teamB: [A], scoreA: 10, scoreB: 0, playedAt: daysAgo(1) })
  const all = matchMap([m1, m2, m3, m4, m5])

  function historyOf(matches: Match[]): HistoryPoint[] {
    return matches.map((m) => point(m.id, m.playedAt, 0))
  }

  it('returns null with fewer than 2 matches', () => {
    expect(currentStreak(stats(A, []), all)).toBeNull()
    expect(currentStreak(stats(A, historyOf([m3])), all)).toBeNull()
  })

  it('counts the trailing wins, whichever team the player was on', () => {
    expect(currentStreak(stats(A, historyOf([m1, m2, m3])), all)).toEqual({ kind: 'win', length: 2 })
  })

  it('counts the trailing losses', () => {
    expect(currentStreak(stats(A, historyOf([m2, m3, m4, m5])), all)).toEqual({ kind: 'loss', length: 2 })
  })

  it('returns null when the last two results differ', () => {
    expect(currentStreak(stats(A, historyOf([m2, m3, m4])), all)).toBeNull()
  })

  it('walks the whole history while the result does not change', () => {
    expect(currentStreak(stats(A, historyOf([m2, m3, m4, m5, m1])), all)).toEqual({ kind: 'loss', length: 3 })
  })

  it('stops at a history point whose match is unknown', () => {
    const before = [point('ghost', daysAgo(6), 0), ...historyOf([m2, m3])]
    expect(currentStreak(stats(A, before), all)).toEqual({ kind: 'win', length: 2 })
    const after = [...historyOf([m2, m3]), point('ghost', daysAgo(0), 0)]
    expect(currentStreak(stats(A, after), all)).toBeNull()
  })

  it('reads the results of the stats owner, not of a teammate', () => {
    expect(currentStreak(stats(B, historyOf([m1, m2, m5])), all)).toEqual({ kind: 'win', length: 2 })
  })
})

// ---------------------------------------------------------------------------
// favouritePartner
// ---------------------------------------------------------------------------

describe('favouritePartner', () => {
  const players = playerMap([
    player(A, 'Alice'),
    player(B, 'Bob'),
    player(C, 'Chloé'),
    player(D, 'Dan'),
    player(E, 'Élodie'),
    player(F, 'Fanny'),
  ])

  function duo(id: MatchId, partner: PlayerId, win: boolean, opponents: PlayerId[] = [C, D]): Match {
    if (win) return match({ id, teamA: [A, partner], teamB: opponents, scoreA: 10, scoreB: 7 })
    return match({ id, teamA: opponents, teamB: [A, partner], scoreA: 10, scoreB: 4 })
  }

  it('returns null when the player has no 2v2 match', () => {
    const solo = match({ id: 'm1', teamA: [A], teamB: [B], scoreA: 10, scoreB: 1 })
    expect(favouritePartner(A, [solo], players)).toBeNull()
  })

  it('returns null when no teammate shares at least 2 matches', () => {
    expect(favouritePartner(A, [duo('m1', B, true), duo('m2', C, true, [B, D])], players)).toBeNull()
  })

  it('picks the teammate with the most shared matches, whatever the results', () => {
    const matches = [
      duo('m1', B, false),
      duo('m2', B, false),
      duo('m3', B, false),
      duo('m4', C, true, [B, D]),
      duo('m5', C, true, [B, D]),
    ]
    expect(favouritePartner(A, matches, players)).toEqual({ partnerId: B, shared: 3, winRate: 0 })
  })

  it('breaks a tie on shared matches by the shared win rate', () => {
    const matches = [duo('m1', B, false), duo('m2', B, true), duo('m3', C, true, [B, D]), duo('m4', C, true, [B, D])]
    expect(favouritePartner(A, matches, players)).toEqual({ partnerId: C, shared: 2, winRate: 1 })
  })

  it('breaks a full tie by name, accent-insensitively', () => {
    const matches = [duo('m1', F, true), duo('m2', F, false), duo('m3', E, true), duo('m4', E, false)]
    expect(favouritePartner(A, matches, players)?.partnerId).toBe(E)
  })

  it('computes the win rate from the player’s own results', () => {
    const matches = [duo('m1', B, true), duo('m2', B, true), duo('m3', B, false)]
    const result = favouritePartner(A, matches, players)
    expect(result?.shared).toBe(3)
    expect(result?.winRate).toBeCloseTo(2 / 3)
  })

  it('ignores matches the player did not take part in', () => {
    const others = match({ id: 'm9', teamA: [B, C], teamB: [D, E], scoreA: 10, scoreB: 2 })
    expect(favouritePartner(A, [others, others, duo('m1', B, true)], players)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// chipOrder / sortByName
// ---------------------------------------------------------------------------

describe('chipOrder', () => {
  it('orders by last match desc, then never-played players by creation desc', () => {
    const old = player('old', 'Old', { createdAt: daysAgo(50) })
    const fresh = player('fresh', 'Fresh', { createdAt: daysAgo(2) })
    const recent = player('recent', 'Recent')
    const earlier = player('earlier', 'Earlier')
    const byPlayer = statsMap([
      stats(recent.id, [point('m2', daysAgo(1), 5)]),
      stats(earlier.id, [point('m1', daysAgo(3), 5)]),
    ])
    expect(ids(chipOrder([old, earlier, fresh, recent], byPlayer))).toEqual(['recent', 'earlier', 'fresh', 'old'])
  })

  it('breaks ties by name, accent- and case-insensitively', () => {
    const same = daysAgo(1)
    const played = [player('z', 'zoé'), player('e', 'Émile'), player('b', 'bob')]
    const byPlayer = statsMap(played.map((p) => stats(p.id, [point('m', same, 1)])))
    expect(ids(chipOrder(played, byPlayer))).toEqual(['b', 'e', 'z'])

    const created = daysAgo(4)
    const never = [
      player('z2', 'zoé', { createdAt: created }),
      player('e2', 'Émile', { createdAt: created }),
      player('b2', 'bob', { createdAt: created }),
    ]
    expect(ids(chipOrder(never, new Map()))).toEqual(['b2', 'e2', 'z2'])
  })

  it('treats a player with stats but no match as never played', () => {
    const p = player('p', 'P', { createdAt: daysAgo(9) })
    const q = player('q', 'Q', { createdAt: daysAgo(1) })
    expect(ids(chipOrder([p, q], statsMap([stats(p.id, [])])))).toEqual(['q', 'p'])
  })

  it('does not mutate the input', () => {
    const input = [player('b', 'Bob'), player('a', 'Alice')]
    chipOrder(input, new Map())
    expect(ids(input)).toEqual(['b', 'a'])
  })
})

describe('sortByName', () => {
  it('sorts with French collation, ignoring case and accents', () => {
    const list = [player('1', 'zoé'), player('2', 'Émile'), player('3', 'alice'), player('4', 'Bob'), player('5', 'eve')]
    expect(sortByName(list).map((p) => p.name)).toEqual(['alice', 'Bob', 'Émile', 'eve', 'zoé'])
  })

  it('returns a new array', () => {
    const input = [player('b', 'Bob'), player('a', 'Alice')]
    expect(sortByName(input)).not.toBe(input)
    expect(ids(input)).toEqual(['b', 'a'])
  })
})

// ---------------------------------------------------------------------------
// isInactive / rankIndexOf / teamLabel
// ---------------------------------------------------------------------------

describe('isInactive', () => {
  it('is false without stats or without any match', () => {
    expect(isInactive(undefined, NOW)).toBe(false)
    expect(isInactive(stats(A, []), NOW)).toBe(false)
  })

  it('is true once 30 days have passed since the last match', () => {
    expect(isInactive(stats(A, [point('m', daysAgo(30), 1)]), NOW)).toBe(true)
    expect(isInactive(stats(A, [point('m', daysAgo(42), 1)]), NOW)).toBe(true)
  })

  it('is false while the last match is less than 30 days old', () => {
    expect(isInactive(stats(A, [point('m', daysAgo(29.9), 1)]), NOW)).toBe(false)
    expect(isInactive(stats(A, [point('m', daysAgo(0), 1)]), NOW)).toBe(false)
  })

  it('relies on lastPlayedAt and played, not on the history', () => {
    expect(isInactive(stats(A, [], { played: 3, lastPlayedAt: daysAgo(31) }), NOW)).toBe(true)
    expect(isInactive(stats(A, [], { played: 0, lastPlayedAt: daysAgo(31) }), NOW)).toBe(false)
  })
})

describe('rankIndexOf', () => {
  const ranking: Ranking = { ranked: [B, A, C], rookies: [D], inactive: [E] }

  it('is the 1-based position among ranked players', () => {
    expect(rankIndexOf(ranking, B)).toBe(1)
    expect(rankIndexOf(ranking, A)).toBe(2)
    expect(rankIndexOf(ranking, C)).toBe(3)
  })

  it('is null for rookies, inactive and unknown players', () => {
    expect(rankIndexOf(ranking, D)).toBeNull()
    expect(rankIndexOf(ranking, E)).toBeNull()
    expect(rankIndexOf(ranking, 'ghost')).toBeNull()
  })
})

describe('teamLabel', () => {
  const players = playerMap([player(A, 'Alice'), player(B, 'Bob')])

  it('joins two names with an ampersand', () => {
    expect(teamLabel([A, B], players)).toBe('Alice & Bob')
  })

  it('returns the single name in 1v1', () => {
    expect(teamLabel([B], players)).toBe('Bob')
  })

  it('marks an unknown id instead of throwing', () => {
    expect(teamLabel([A, 'ghost'], players)).toBe('Alice & ?')
  })
})

// ---------------------------------------------------------------------------
// buildExport
// ---------------------------------------------------------------------------

describe('buildExport', () => {
  it('wraps the store in the export envelope', () => {
    const store = sampleStore()
    expect(buildExport(store, NOW)).toEqual({
      app: 'babyflair',
      version: 1,
      exportedAt: NOW.toISOString(),
      players: store.players,
      matches: store.matches,
      settings: store.settings,
    })
  })

  it('copies the data so that mutating the file leaves the store intact', () => {
    const store = sampleStore()
    const file = buildExport(store, NOW)
    file.players[0].name = 'X'
    file.matches[0].teamA.push('ghost')
    file.settings.lastTarget = 10
    expect(store.players[0].name).toBe('Alice')
    expect(store.matches[0].teamA).toEqual([A, B])
    expect(store.settings.lastTarget).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// validateImport
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>

function validFile(): Json {
  return structuredClone(buildExport(sampleStore(), NOW)) as unknown as Json
}

function withPlayer(file: Json, index: number, patch: Json): Json {
  const players = (file.players as Json[]).map((p, i) => (i === index ? { ...p, ...patch } : p))
  return { ...file, players }
}

function withMatch(file: Json, index: number, patch: Json): Json {
  const matches = (file.matches as Json[]).map((m, i) => (i === index ? { ...m, ...patch } : m))
  return { ...file, matches }
}

function expectOk(result: ImportResult): asserts result is Extract<ImportResult, { ok: true }> {
  if (result.ok) return
  throw new Error(`import rejected: ${result.reason}`)
}

function expectKo(result: ImportResult, pattern: RegExp): void {
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.reason).toMatch(pattern)
}

describe('validateImport', () => {
  it('accepts a valid export and returns its data', () => {
    const store = sampleStore()
    const result = validateImport(validFile())
    expectOk(result)
    expect(result.players).toEqual(store.players)
    expect(result.matches).toEqual(store.matches)
    expect(result.settings).toEqual(store.settings)
  })

  it('round-trips an export through JSON text', () => {
    const result = validateImport(JSON.parse(JSON.stringify(buildExport(sampleStore(), NOW))))
    expectOk(result)
    expect(result.matches).toHaveLength(2)
  })

  it('rejects anything that is not a JSON object', () => {
    for (const input of [null, undefined, 42, 'babyflair', [], true]) {
      expectKo(validateImport(input), /objet JSON/)
    }
  })

  it('rejects a file from another app or another version', () => {
    expectKo(validateImport({ ...validFile(), app: 'autre' }), /BabyFlair/)
    expectKo(validateImport({ ...validFile(), app: undefined }), /BabyFlair/)
    expectKo(validateImport({ ...validFile(), version: 2 }), /Version/)
    expectKo(validateImport({ ...validFile(), version: '1' }), /Version/)
  })

  it('rejects players and matches that are not lists', () => {
    expectKo(validateImport({ ...validFile(), players: {} }), /players/)
    expectKo(validateImport({ ...validFile(), matches: 'm1' }), /matches/)
  })

  it('rejects malformed players and names the entry', () => {
    expectKo(validateImport(withPlayer(validFile(), 1, { id: '' })), /Joueur n°2/)
    expectKo(validateImport(withPlayer(validFile(), 0, { name: '   ' })), /Joueur n°1/)
    expectKo(validateImport(withPlayer(validFile(), 2, { createdAt: 'hier' })), /Joueur n°3/)
    expectKo(validateImport(withPlayer(validFile(), 3, { isGuest: 'oui' })), /Joueur n°4/)
    expectKo(validateImport({ ...validFile(), players: [42] }), /Joueur n°1/)
  })

  it('defaults isGuest to false and trims names', () => {
    const result = validateImport(withPlayer(validFile(), 0, { isGuest: undefined, name: '  Alice  ' }))
    expectOk(result)
    expect(result.players[0]).toMatchObject({ name: 'Alice', isGuest: false })
  })

  it('rejects duplicate ids', () => {
    expectKo(validateImport(withPlayer(validFile(), 1, { id: A })), /double/)
    expectKo(validateImport(withMatch(validFile(), 1, { id: 'm1' })), /double/)
  })

  it('rejects a team member that is not in the player list', () => {
    expectKo(validateImport(withMatch(validFile(), 0, { teamB: [C, 'ghost'] })), /Match n°1.*ghost/)
  })

  it('rejects teams of unequal or illegal sizes', () => {
    expectKo(validateImport(withMatch(validFile(), 0, { teamB: [C] })), /taille/)
    expectKo(validateImport(withMatch(validFile(), 0, { teamA: [A, B, D] })), /équipe 1/)
    expectKo(validateImport(withMatch(validFile(), 1, { teamA: [] })), /équipe 1/)
    expectKo(validateImport(withMatch(validFile(), 1, { teamB: C })), /équipe 2/)
    expectKo(validateImport(withMatch(validFile(), 1, { teamB: [7] })), /équipe 2/)
  })

  it('rejects a player who appears twice in a match', () => {
    expectKo(validateImport(withMatch(validFile(), 0, { teamB: [A, D] })), /deux fois/)
    expectKo(validateImport(withMatch(validFile(), 0, { teamA: [B, B] })), /deux fois/)
  })

  it('rejects scores where the winner does not reach the target exactly', () => {
    const cases: Array<[number, number, Target]> = [
      [10, 10, 10],
      [8, 9, 10],
      [10, -1, 10],
      [10, 12, 10],
      [5, 3, 10],
      [10, 7.5, 10],
      [5, 5, 5],
      [6, 2, 5],
    ]
    for (const [scoreA, scoreB, target] of cases) {
      expectKo(validateImport(withMatch(validFile(), 0, { scoreA, scoreB, target })), /Match n°1 : score incohérent/)
    }
    expectKo(validateImport(withMatch(validFile(), 0, { scoreA: '10' })), /score incohérent/)
  })

  it('accepts every legal score on either side', () => {
    const cases: Array<[number, number, Target]> = [
      [10, 0, 10],
      [0, 10, 10],
      [10, 9, 10],
      [9, 10, 10],
      [5, 4, 5],
      [4, 5, 5],
      [5, 0, 5],
    ]
    for (const [scoreA, scoreB, target] of cases) {
      expectOk(validateImport(withMatch(validFile(), 0, { scoreA, scoreB, target })))
    }
  })

  it('rejects an unknown target', () => {
    expectKo(validateImport(withMatch(validFile(), 0, { target: 7 })), /cible/)
    expectKo(validateImport(withMatch(validFile(), 0, { target: '10' })), /cible/)
  })

  it('rejects dates that do not parse', () => {
    for (const field of ['playedAt', 'createdAt', 'updatedAt']) {
      expectKo(validateImport(withMatch(validFile(), 1, { [field]: 'jamais' })), new RegExp(`Match n°2.*${field}`))
      expectKo(validateImport(withMatch(validFile(), 1, { [field]: 1728000000 })), new RegExp(field))
    }
  })

  it('defaults the settings when they are missing or partially invalid', () => {
    const missing = validateImport({ ...validFile(), settings: undefined })
    expectOk(missing)
    expect(missing.settings).toEqual({ lastFormat: '2v2', lastTarget: 5 })

    const partial = validateImport({
      ...validFile(),
      settings: { lastFormat: '3v3', lastTarget: 5, lastExportAt: 'jamais', installHintDismissedAt: daysAgo(3) },
    })
    expectOk(partial)
    expect(partial.settings).toEqual({ lastFormat: '2v2', lastTarget: 5, installHintDismissedAt: daysAgo(3) })
  })

  it('keeps unique sequence numbers and renumbers from the array order otherwise', () => {
    const kept = validateImport(validFile())
    expectOk(kept)
    expect(kept.matches.map((m) => m.seq)).toEqual([1, 2])

    const custom = validateImport(withMatch(withMatch(validFile(), 0, { seq: 7 }), 1, { seq: 3 }))
    expectOk(custom)
    expect(custom.matches.map((m) => m.seq)).toEqual([7, 3])

    const missing = validateImport(withMatch(withMatch(validFile(), 0, { seq: undefined }), 1, { seq: undefined }))
    expectOk(missing)
    expect(missing.matches.map((m) => m.seq)).toEqual([1, 2])

    const duplicated = validateImport(withMatch(withMatch(validFile(), 0, { seq: 4 }), 1, { seq: 4 }))
    expectOk(duplicated)
    expect(duplicated.matches.map((m) => m.seq)).toEqual([1, 2])

    const partial = validateImport(withMatch(validFile(), 1, { seq: '2' }))
    expectOk(partial)
    expect(partial.matches.map((m) => m.seq)).toEqual([1, 2])
  })

  it('drops unknown fields', () => {
    const file = withMatch(withPlayer(validFile(), 0, { avatar: 'x' }), 0, { note: 'y' })
    const result = validateImport({ ...file, extra: true })
    expectOk(result)
    expect(result.players[0]).toEqual(sampleStore().players[0])
    expect(result.matches[0]).toEqual(sampleStore().matches[0])
  })

  it('reads the announcements: absent or null = none, clamped to the target, round-tripped through an export', () => {
    const result = validateImport(withMatch(withMatch(validFile(), 0, { betA: 3, betB: null }), 1, { betB: 9 }))
    expectOk(result)
    expect(result.matches[0]).toMatchObject({ betA: 3 })
    expect('betB' in result.matches[0]).toBe(false)
    expect(result.matches[1]).toMatchObject({ target: 5, betB: 5 })
    expect('betA' in result.matches[1]).toBe(false)
    const store = sampleStore()
    store.matches[0] = { ...store.matches[0], betA: 2, betB: 4 }
    const again = validateImport(JSON.parse(JSON.stringify(buildExport(store, NOW))))
    expectOk(again)
    expect(again.matches).toEqual(store.matches)
  })

  it('rejects an unreadable announcement', () => {
    expectKo(validateImport(withMatch(validFile(), 0, { betA: 0 })), /Match n°1 : annonce des Blancs invalide \(0\)/)
    expectKo(validateImport(withMatch(validFile(), 1, { betB: 'deux' })), /Match n°2 : annonce des Noirs invalide/)
    expectKo(validateImport(withMatch(validFile(), 1, { betB: 1.5 })), /annonce des Noirs invalide/)
  })

  it('keeps a comeback on a 5-4 in 5 and round-trips it through an export', () => {
    const result = validateImport(withMatch(validFile(), 1, { scoreA: 4, comeback: true }))
    expectOk(result)
    expect(result.matches[1]).toMatchObject({ scoreA: 4, scoreB: 5, target: 5, comeback: true })
    const store = sampleStore()
    store.matches[1] = { ...store.matches[1], scoreA: 4, comeback: true }
    const again = validateImport(JSON.parse(JSON.stringify(buildExport(store, NOW))))
    expectOk(again)
    expect(again.matches).toEqual(store.matches)
  })

  it('drops a stray comeback on another score to false instead of rejecting the file', () => {
    const stray = validateImport(withMatch(withMatch(validFile(), 0, { comeback: true }), 1, { comeback: true }))
    expectOk(stray)
    expect(stray.matches.map((m) => m.comeback)).toEqual([false, false])
    const unflagged = validateImport(withMatch(validFile(), 1, { scoreA: 4, comeback: false }))
    expectOk(unflagged)
    expect(unflagged.matches[1].comeback).toBe(false)
  })

  it('ignores a comeback that is not a boolean, and older files without it', () => {
    const odd = validateImport(withMatch(validFile(), 1, { scoreA: 4, comeback: 'oui' }))
    expectOk(odd)
    expect('comeback' in odd.matches[1]).toBe(false)
    const older = validateImport(validFile())
    expectOk(older)
    expect(older.matches.some((m) => 'comeback' in m)).toBe(false)
  })

  it('accepts an empty export', () => {
    const result = validateImport({ app: 'babyflair', version: 1, exportedAt: NOW.toISOString(), players: [], matches: [] })
    expectOk(result)
    expect(result.players).toEqual([])
    expect(result.matches).toEqual([])
    expect(result.settings).toEqual({ lastFormat: '2v2', lastTarget: 5 })
  })
})

describe('positions and sides', () => {
  const m = (id: string, teamA: string[], teamB: string[], scoreA: number, scoreB: number): Match => ({
    id, seq: 1, playedAt: '2026-10-12T10:00:00.000Z', createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z', target: 10, teamA, teamB, scoreA, scoreB,
  })
  const matches = [m('m1', ['a', 'b'], ['c', 'd'], 10, 5), m('m2', ['b', 'a'], ['c', 'd'], 3, 10), m('m3', ['a'], ['c'], 10, 2)]
  it('reads the position from the team order, 2v2 only', () => {
    expect(positionOf('a', matches[0])).toBe('arriere')
    expect(positionOf('b', matches[0])).toBe('avant')
    expect(positionOf('a', matches[1])).toBe('avant')
    expect(positionOf('a', matches[2])).toBeNull()
    expect(positionOf('zz', matches[0])).toBeNull()
  })
  it('tallies wins and losses per position', () => {
    expect(positionRecord('a', matches)).toEqual({ arriere: { wins: 1, losses: 0 }, avant: { wins: 0, losses: 1 } })
  })
  it('counts the winning side', () => {
    expect(sideRecord(matches)).toEqual({ blancs: 2, noirs: 1 })
  })
})

describe('best ally and nemesis', () => {
  const m = (id: string, teamA: string[], teamB: string[], aWins: boolean): Match => ({
    id, seq: 1, playedAt: '2026-10-12T10:00:00.000Z', createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z', target: 5, teamA, teamB, scoreA: aWins ? 5 : 2, scoreB: aWins ? 2 : 5,
  })
  const names = new Map(['b', 'c', 'd', 'e'].map((id) => [id, { id, name: id.toUpperCase(), isGuest: false, createdAt: '2026-01-01T00:00:00.000Z' }]))
  const matches = [
    m('1', ['a', 'b'], ['c', 'd'], true), m('2', ['a', 'b'], ['c', 'e'], true), m('3', ['b', 'a'], ['d', 'c'], true),
    m('4', ['a', 'e'], ['c', 'b'], false), m('5', ['a', 'e'], ['c', 'd'], false), m('6', ['e', 'a'], ['b', 'c'], true),
    m('7', ['a'], ['c'], false),
  ]
  it('picks the teammate with the best record together', () => {
    expect(bestAlly('a', matches, names)).toEqual({ playerId: 'b', matches: 3, wins: 3, losses: 0 })
  })
  it('picks the opponent with the worst record against', () => {
    const worst = nemesis('a', matches, names)
    expect(worst?.playerId).toBe('c')
    expect(worst).toMatchObject({ matches: 7, wins: 4, losses: 3 })
  })
  it('needs at least 3 matches', () => {
    expect(bestAlly('a', matches.slice(0, 2), names)).toBeNull()
    expect(nemesis('a', matches.slice(0, 2), names)).toBeNull()
  })
})

describe('fanny and comeback', () => {
  const flagged = (input: MatchInput): Match => ({ ...match({ target: 5, ...input }), comeback: true })

  it('a fanny is a win where the loser scored 0, in 5 or in 10', () => {
    expect(isFanny({ target: 5, scoreA: 5, scoreB: 0 })).toBe(true)
    expect(isFanny({ target: 5, scoreA: 0, scoreB: 5 })).toBe(true)
    expect(isFanny({ target: 10, scoreA: 10, scoreB: 0 })).toBe(true)
    expect(isFanny({ target: 10, scoreA: 0, scoreB: 10 })).toBe(true)
    expect(isFanny({ target: 5, scoreA: 5, scoreB: 1 })).toBe(false)
    expect(isFanny({ target: 10, scoreA: 10, scoreB: 1 })).toBe(false)
  })

  it('a comeback score is a 5-4 in a game to 5 only', () => {
    expect(isComebackScore({ target: 5, scoreA: 5, scoreB: 4 })).toBe(true)
    expect(isComebackScore({ target: 5, scoreA: 4, scoreB: 5 })).toBe(true)
    expect(isComebackScore({ target: 5, scoreA: 5, scoreB: 3 })).toBe(false)
    expect(isComebackScore({ target: 10, scoreA: 10, scoreB: 4 })).toBe(false)
    expect(isComebackScore({ target: 5, scoreA: 4, scoreB: 4 })).toBe(false)
  })

  it('isComeback needs the flag and the score; withValidComeback drops a stray flag', () => {
    const valid = flagged({ id: 'm1', teamA: [A], teamB: [B], scoreA: 4, scoreB: 5 })
    const stray = flagged({ id: 'm2', teamA: [A], teamB: [B], scoreA: 3, scoreB: 5 })
    const plain = match({ id: 'm3', teamA: [A], teamB: [B], scoreA: 4, scoreB: 5, target: 5 })
    expect(isComeback(valid)).toBe(true)
    expect(isComeback(stray)).toBe(false)
    expect(isComeback(plain)).toBe(false)
    expect(withValidComeback(valid)).toBe(valid)
    expect(withValidComeback(plain)).toBe(plain)
    expect(withValidComeback(stray)).toEqual({ ...stray, comeback: false })
  })

  it('tallies fannys and comebacks as winner and as loser', () => {
    const matches = [
      match({ id: 'm1', teamA: [A, B], teamB: [C, D], scoreA: 5, scoreB: 0, target: 5 }),
      match({ id: 'm2', teamA: [A], teamB: [C], scoreA: 0, scoreB: 10 }),
      flagged({ id: 'm3', teamA: [C], teamB: [A], scoreA: 4, scoreB: 5 }),
      flagged({ id: 'm4', teamA: [A, D], teamB: [B, C], scoreA: 4, scoreB: 5 }),
      match({ id: 'm5', teamA: [A], teamB: [B], scoreA: 5, scoreB: 4, target: 5 }),
      flagged({ id: 'm6', teamA: [A], teamB: [B], scoreA: 5, scoreB: 2 }),
      match({ id: 'm7', teamA: [B], teamB: [D], scoreA: 5, scoreB: 0, target: 5 }),
      match({ id: 'm8', teamA: [A], teamB: [D], scoreA: 10, scoreB: 0 }),
    ]
    const record = (fannyGiven: number, fannyTaken: number, comebackDone: number, comebackSuffered: number) => ({
      fannyGiven,
      fannyTaken,
      comebackDone,
      comebackSuffered,
    })
    expect(fannyComebackRecord(A, matches)).toEqual(record(2, 1, 1, 1))
    expect(fannyComebackRecord(C, matches)).toEqual(record(1, 1, 1, 1))
    expect(fannyComebackRecord(E, matches)).toEqual(record(0, 0, 0, 0))
  })
})
