import { createElement } from 'react'
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppStateProvider, DEFAULT_SETTINGS, STORAGE_KEY } from '../store'
import type { Match, MatchResult, Player, PlayerStats, ReplayResult, Store, Target } from '../types'
import type { Match as EngineMatch, Player as EnginePlayer, PlayerDelta, RatingsState } from './engine'
import { applyMatch, leaderboard, replay as engineReplay, round3, whyFr } from './engine'
import type { PreviewDraft } from './index'
import { DEFAULT_CONFIG, previewMatch, rank, replay, useReplay, whyLine } from './index'
import vectors from './test-vectors.json'

// ---------------------------------------------------------------------------
// Fixtures (ISO strings in, as the store holds them)
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-12T12:00:00.000Z')
const DAY = 86_400_000

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString()
}

function player(id: string, name: string, createdDaysAgo = 100): Player {
  return { id, name, isGuest: false, createdAt: daysAgo(createdDaysAgo) }
}

type MatchSpec = {
  id: string
  teamA: string[]
  teamB: string[]
  scoreA: number
  scoreB: number
  playedAt: string
  target?: Target
}

function withSeq(specs: MatchSpec[]): Match[] {
  return specs.map((s, i) => ({
    id: s.id,
    seq: i + 1,
    playedAt: s.playedAt,
    createdAt: s.playedAt,
    updatedAt: s.playedAt,
    target: s.target ?? 10,
    teamA: s.teamA,
    teamB: s.teamB,
    scoreA: s.scoreA,
    scoreB: s.scoreB,
  }))
}

const PLAYERS: Player[] = [
  player('alice', 'Alice'),
  player('bob', 'Bob'),
  player('chloe', 'Chloé'),
  player('dan', 'Dan', 2),
  player('eve', 'Ève'),
  player('fred', 'Fred'),
  player('gus', 'Gus'),
  player('hal', 'Hal'),
  player('emile', 'Émile', 1),
  player('zoe', 'Zoé', 1),
]

// alice/bob: ten 1v1 (20 to 11 days ago) then a 2v2 five days ago → ranked. eve/fred: three 1v1 two months ago plus
// that 2v2 → rookies. gus/hal: ten 1v1 ending 41 days ago → inactive despite the match count. chloe never played and
// was created 100 days ago → inactive. dan, émile, zoé never played and were created this week → rookies.
function fixtureMatches(): Match[] {
  const specs: MatchSpec[] = []
  for (let i = 0; i < 3; i++) {
    const eveWins = i !== 1
    const scores = eveWins ? { scoreA: 10, scoreB: 7 } : { scoreA: 7, scoreB: 10 }
    specs.push({ id: `ef${i}`, teamA: ['eve'], teamB: ['fred'], ...scores, playedAt: daysAgo(60 - i) })
  }
  for (let i = 0; i < 10; i++) {
    const gusWins = i % 3 !== 0
    const scores = gusWins ? { scoreA: 10, scoreB: 6 } : { scoreA: 4, scoreB: 10 }
    specs.push({ id: `gh${i}`, teamA: ['gus'], teamB: ['hal'], ...scores, playedAt: daysAgo(50 - i) })
  }
  for (let i = 0; i < 10; i++) {
    const aliceWins = i % 5 !== 4
    const scores = aliceWins ? { scoreA: 10, scoreB: i } : { scoreA: 8, scoreB: 10 }
    specs.push({ id: `ab${i}`, teamA: ['alice'], teamB: ['bob'], ...scores, playedAt: daysAgo(20 - i) })
  }
  specs.push({ id: 'duo', teamA: ['alice', 'eve'], teamB: ['bob', 'fred'], scoreA: 5, scoreB: 3, playedAt: daysAgo(5), target: 5 })
  return withSeq(specs)
}

const OWNER_PLAYERS: Player[] = [player('strong', 'Strong'), player('weak', 'Weak'), player('c1', 'C1'), player('c2', 'C2')]
const OWNER_RATINGS = { strong: 1400, weak: 800, c1: 1100, c2: 1100 }

// A PlayerStats block for an established player: 20 matches, the exact rating carried by the last history point.
function establishedStats(id: string, rating: number, played = 20): PlayerStats {
  const history = Array.from({ length: played }, (_, i) => ({
    matchId: `${id}-${i}`,
    playedAt: daysAgo(played - i),
    ratingBefore: rating,
    ratingAfter: rating,
    delta: 0,
  }))
  const wins = Math.floor(played / 2)
  return {
    playerId: id,
    rating: Math.round(rating),
    played,
    wins,
    losses: played - wins,
    lastPlayedAt: daysAgo(1),
    status: 'ranked',
    rookieProgress: Math.min(played, DEFAULT_CONFIG.rankedAfter),
    history,
  }
}

function handBuilt(stats: PlayerStats[]): ReplayResult {
  return { byPlayer: new Map<string, PlayerStats>(stats.map((s) => [s.playerId, s])), byMatch: new Map() }
}

function establishedState(ratings: Record<string, number>): RatingsState {
  return Object.fromEntries(
    Object.entries(ratings).map(([id, rating]) => [id, { rating, matches: 20, wins: 10, losses: 10, lastPlayedAt: null }]),
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toEnginePlayer(p: Player): EnginePlayer {
  return { id: p.id, name: p.name, isGuest: p.isGuest, createdAt: Date.parse(p.createdAt) }
}

function toEngineMatch(m: Match): EngineMatch {
  return {
    id: m.id,
    seq: m.seq,
    playedAt: Date.parse(m.playedAt),
    createdAt: Date.parse(m.createdAt),
    target: m.target,
    teamA: m.teamA,
    teamB: m.teamB,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
  }
}

function statsOf(result: ReplayResult, id: string): PlayerStats {
  const stats = result.byPlayer.get(id)
  if (stats === undefined) throw new Error(`no stats for ${id}`)
  return stats
}

function matchResultOf(result: ReplayResult, id: string): MatchResult {
  const match = result.byMatch.get(id)
  if (match === undefined) throw new Error(`no result for match ${id}`)
  return match
}

function toPerPlayer(d: PlayerDelta): MatchResult['perPlayer'][number] {
  return { playerId: d.playerId, team: d.team, before: d.ratingBefore, after: d.ratingAfter, delta: d.delta, why: whyFr(d) }
}

function ids(rows: Array<{ player: { id: string } }>): string[] {
  return rows.map((r) => r.player.id)
}

// Runs the adapter and the engine side by side on the same history and checks every field the UI reads.
function expectSameAsEngine(players: Player[], matches: Match[], now: Date): ReplayResult {
  const result = replay(players, matches, { now })
  const roster = players.map(toEnginePlayer)
  const engine = engineReplay(roster, matches.map(toEngineMatch))
  const board = leaderboard(roster, engine.players, now.getTime())
  const sectionOf = new Map<string, string>()
  for (const row of board.ranked) sectionOf.set(row.player.id, 'ranked')
  for (const row of board.rookies) sectionOf.set(row.player.id, 'rookie')
  for (const row of board.inactive) sectionOf.set(row.player.id, 'inactive')

  expect(result.byPlayer.size).toBe(players.length)
  for (const p of players) {
    const stats = statsOf(result, p.id)
    const state = engine.players[p.id]
    expect(stats.playerId).toBe(p.id)
    expect(stats.rating, p.id).toBe(Math.round(state.rating))
    expect(stats.played).toBe(state.matches)
    expect(stats.wins).toBe(state.wins)
    expect(stats.losses).toBe(state.losses)
    expect(stats.lastPlayedAt === undefined ? null : Date.parse(stats.lastPlayedAt)).toBe(state.lastPlayedAt)
    expect(stats.status, p.id).toBe(sectionOf.get(p.id))
    expect(stats.rookieProgress).toBe(Math.min(state.matches, DEFAULT_CONFIG.rankedAfter))
    expect(stats.history).toHaveLength(state.matches)
  }

  expect([...result.byMatch.keys()]).toEqual(engine.matches.map((m) => m.matchId))
  for (const m of engine.matches) {
    const r = matchResultOf(result, m.matchId)
    expect(r.perPlayer).toEqual(m.deltas.map(toPerPlayer))
    expect(r.expectedA).toBe(m.deltas[0].expected)
    expect(r.expectedB).toBe(1 - m.deltas[0].expected)
  }

  expect(rank(result, players)).toEqual({ ranked: ids(board.ranked), rookies: ids(board.rookies), inactive: ids(board.inactive) })
  return result
}

type VectorInput = {
  players: Array<{ id: string; name: string; isGuest: boolean; createdAt: number }>
  matches: Array<{
    id: string
    seq: number
    playedAt: number
    createdAt: number
    target: number
    teamA: string[]
    teamB: string[]
    scoreA: number
    scoreB: number
  }>
}

// The 20-player, 100-match seeded history of test-vectors.json, converted to the store's ISO-string shapes.
function randomHistory(): { players: Player[]; matches: Match[]; now: Date; rankedIds: string[] } {
  const found = vectors.scenarios.find((s) => s.name === 'random_100_matches')
  if (found === undefined) throw new Error('missing scenario random_100_matches')
  const input = found.input as unknown as VectorInput
  const expected = found.expected as unknown as { leaderboard: { ranked: Array<[number, string, number, number]> } }
  const iso = (ms: number): string => new Date(ms).toISOString()
  return {
    players: input.players.map((p) => ({ id: p.id, name: p.name, isGuest: p.isGuest, createdAt: iso(p.createdAt) })),
    matches: input.matches.map((m) => ({
      id: m.id,
      seq: m.seq,
      playedAt: iso(m.playedAt),
      createdAt: iso(m.createdAt),
      updatedAt: iso(m.createdAt),
      target: m.target as Target,
      teamA: m.teamA,
      teamB: m.teamB,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
    })),
    // make-vectors.ts ranked this history at T0 + 1 day.
    now: new Date(Date.parse('2026-10-12T12:00:00Z') + DAY),
    rankedIds: expected.leaderboard.ranked.map(([, id]) => id),
  }
}

function appended(matches: Match[], draft: PreviewDraft, scoreA: number, scoreB: number): Match {
  const seq = matches.reduce((max, m) => Math.max(max, m.seq), 0) + 1
  const playedAt = NOW.toISOString()
  const { target, teamA, teamB } = draft
  return { id: 'next', seq, playedAt, createdAt: playedAt, updatedAt: playedAt, target, teamA, teamB, scoreA, scoreB }
}

function appendedDeltas(matches: Match[], draft: PreviewDraft, scoreA: number, scoreB: number): number[] {
  const result = replay(PLAYERS, [...matches, appended(matches, draft, scoreA, scoreB)], { now: NOW })
  return matchResultOf(result, 'next').perPlayer.map((p) => p.delta)
}

const DRAFTS: Array<[string, PreviewDraft]> = [
  ['2v2 to 10 between ranked players and rookies', { teamA: ['alice', 'eve'], teamB: ['bob', 'fred'], target: 10 }],
  ['1v1 to 5 between an inactive player and a never-played rookie', { teamA: ['gus'], teamB: ['dan'], target: 5 }],
  ['1v1 to 10 between two never-played rookies', { teamA: ['dan'], teamB: ['emile'], target: 10 }],
]

// ---------------------------------------------------------------------------
// replay
// ---------------------------------------------------------------------------

describe('replay', () => {
  it('gives everyone 1000, no match and the rookie status on an empty history', () => {
    const players = [player('alice', 'Alice', 29), player('dan', 'Dan', 2), player('emile', 'Émile', 1), player('zoe', 'Zoé', 1)]
    const result = replay(players, [], { now: NOW })
    expect(result.byMatch.size).toBe(0)
    expect(result.byPlayer.size).toBe(4)
    for (const p of players) {
      expect(statsOf(result, p.id)).toEqual({
        playerId: p.id,
        rating: 1000,
        played: 0,
        wins: 0,
        losses: 0,
        status: 'rookie',
        rookieProgress: 0,
        history: [],
      })
      expect(statsOf(result, p.id).lastPlayedAt).toBeUndefined()
    }
    expect(rank(result, players)).toEqual({ ranked: [], rookies: ['alice', 'dan', 'emile', 'zoe'], inactive: [] })
  })

  it('lists a never-played player created 30 days ago or more as inactive, as the engine does', () => {
    const players = [player('old', 'Old', 30), player('fresh', 'Fresh', 29)]
    const result = replay(players, [], { now: NOW })
    expect(statsOf(result, 'old').status).toBe('inactive')
    expect(statsOf(result, 'fresh').status).toBe('rookie')
  })

  it('matches the engine field by field on the fixture history', () => {
    expectSameAsEngine(PLAYERS, fixtureMatches(), NOW)
  })

  it('matches the engine on the 100-match random vector fed as ISO strings', () => {
    const { players, matches, now, rankedIds } = randomHistory()
    const result = expectSameAsEngine(players, matches, now)
    expect(rank(result, players).ranked).toEqual(rankedIds)
    expect(statsOf(result, 'p09').rating).toBe(1125) // 1125.252 in the vector
    expect(statsOf(result, 'p11').rating).toBe(883) // 883.358 in the vector
  })

  it('exposes status, rookieProgress and a chronological history per player', () => {
    const matches = fixtureMatches()
    const playedAtOf = new Map<string, string>(matches.map((m) => [m.id, m.playedAt]))
    const result = replay(PLAYERS, matches, { now: NOW })

    const alice = statsOf(result, 'alice')
    expect(alice.status).toBe('ranked')
    expect(alice.played).toBe(11)
    expect(alice.wins).toBe(9)
    expect(alice.losses).toBe(2)
    expect(alice.rookieProgress).toBe(10)
    expect(alice.history.map((h) => h.matchId)).toEqual([...Array.from({ length: 10 }, (_, i) => `ab${i}`), 'duo'])
    expect(alice.history[0].ratingBefore).toBe(1000)
    alice.history.forEach((point, i) => {
      if (i > 0) expect(point.ratingBefore).toBe(alice.history[i - 1].ratingAfter)
      expect(point.delta).toBe(round3(point.ratingAfter - point.ratingBefore))
      expect(point.playedAt).toBe(playedAtOf.get(point.matchId))
    })
    expect(alice.lastPlayedAt).toBe(daysAgo(5))
    expect(alice.rating).toBe(Math.round(alice.history[alice.history.length - 1].ratingAfter))

    const eve = statsOf(result, 'eve')
    expect(eve.status).toBe('rookie')
    expect(eve.played).toBe(4)
    expect(eve.rookieProgress).toBe(4)

    const gus = statsOf(result, 'gus')
    expect(gus.status).toBe('inactive')
    expect(gus.played).toBe(10)
    expect(gus.rookieProgress).toBe(10)
    expect(gus.lastPlayedAt).toBe(daysAgo(41))

    const chloe = statsOf(result, 'chloe')
    expect(chloe.status).toBe('inactive')
    expect(chloe.played).toBe(0)
    expect(chloe.rating).toBe(1000)
    expect(chloe.lastPlayedAt).toBeUndefined()
    expect(chloe.history).toEqual([])

    expect(statsOf(result, 'dan').status).toBe('rookie')
    expect(statsOf(result, 'dan').rookieProgress).toBe(0)
  })

  it('exposes per-match team expectations and the engine French why line', () => {
    const result = replay(PLAYERS, fixtureMatches(), { now: NOW })
    const duo = matchResultOf(result, 'duo')
    expect(duo.matchId).toBe('duo')
    expect(duo.perPlayer.map((p) => [p.playerId, p.team])).toEqual([['alice', 'A'], ['eve', 'A'], ['bob', 'B'], ['fred', 'B']])
    expect(duo.expectedA + duo.expectedB).toBeCloseTo(1, 12)
    for (const p of duo.perPlayer) {
      const prefix = p.team === 'A' ? 'Victoire 5-3 (en 5)' : 'Défaite 3-5 (en 5)'
      expect(p.why.startsWith(prefix), p.why).toBe(true)
      expect(p.delta).toBe(round3(p.after - p.before))
      const point = statsOf(result, p.playerId).history.find((h) => h.matchId === 'duo')
      expect(point).toEqual({ matchId: 'duo', playedAt: daysAgo(5), ratingBefore: p.before, ratingAfter: p.after, delta: p.delta })
    }
    expect(whyLine).toBe(whyFr)
  })

  it('rates a fresh pool 10-8 with the rookie multiplier and the exact why lines', () => {
    const players = [player('a', 'A', 10), player('b', 'B', 10), player('c', 'C', 10), player('d', 'D', 10)]
    const matches = withSeq([{ id: 'm1', teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 10, scoreB: 8, playedAt: daysAgo(1) }])
    const result = replay(players, matches, { now: NOW })
    const m1 = matchResultOf(result, 'm1')
    expect(m1.expectedA).toBe(0.5)
    expect(m1.expectedB).toBe(0.5)
    // Per player: teamSize 2 × base (16 × 1.2 × 0.5) × share 0.5 × rookie ×3 = 28.8
    expect(m1.perPlayer.map((p) => p.delta)).toEqual([28.8, 28.8, -28.8, -28.8])
    expect(m1.perPlayer[0].why).toBe('Victoire 10-8 (en 10) · 50 % de chances · marge ×1,2 · part 50 % · débutant ×3,0 → +28,8')
    expect(m1.perPlayer[2].why).toBe('Défaite 8-10 (en 10) · 50 % de chances · marge ×1,2 · part 50 % · débutant ×3,0 → −28,8')
    expect(statsOf(result, 'a').rating).toBe(1029)
    expect(statsOf(result, 'c').rating).toBe(971)
    expect(statsOf(result, 'a').history).toEqual([{ matchId: 'm1', playedAt: daysAgo(1), ratingBefore: 1000, ratingAfter: 1028.8, delta: 28.8 }])
  })

  it('does not mutate its inputs', () => {
    const matches = fixtureMatches()
    const frozenPlayers = structuredClone(PLAYERS)
    const frozenMatches = structuredClone(matches)
    replay(PLAYERS, matches, { now: NOW })
    expect(PLAYERS).toEqual(frozenPlayers)
    expect(matches).toEqual(frozenMatches)
  })

  it('propagates engine validation errors', () => {
    const matches = fixtureMatches()
    expect(() => replay(PLAYERS, [...matches, { ...matches[0], id: 'dup-seq' }], { now: NOW })).toThrow('duplicate match seq')
    const unknown = { ...matches[0], id: 'x', seq: 99, teamB: ['nobody'] }
    expect(() => replay(PLAYERS, [...matches, unknown], { now: NOW })).toThrow(/unknown player nobody/)
    const unparsable = { ...matches[0], playedAt: 'hier' }
    expect(() => replay(PLAYERS, [unparsable], { now: NOW })).toThrow(/playedAt must be a finite timestamp/)
  })
})

// ---------------------------------------------------------------------------
// rank
// ---------------------------------------------------------------------------

describe('rank', () => {
  it('buckets by status and orders rows like the engine', () => {
    const result = replay(PLAYERS, fixtureMatches(), { now: NOW })
    const ranking = rank(result, PLAYERS)
    for (const [section, status] of [['ranked', 'ranked'], ['rookies', 'rookie'], ['inactive', 'inactive']] as const) {
      for (const id of ranking[section]) expect(statsOf(result, id).status, id).toBe(status)
    }
    expect([...ranking.ranked, ...ranking.rookies, ...ranking.inactive].sort()).toEqual(PLAYERS.map((p) => p.id).sort())

    expect(new Set(ranking.ranked)).toEqual(new Set(['alice', 'bob']))
    expect(new Set(ranking.inactive)).toEqual(new Set(['chloe', 'gus', 'hal']))
    for (const section of [ranking.ranked, ranking.rookies, ranking.inactive]) {
      const ratings = section.map((id) => statsOf(result, id).rating)
      expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
    }
    // Never-played rookies tie on rating and matches: accent- and case-insensitive name order.
    expect(ranking.rookies.filter((id) => statsOf(result, id).played === 0)).toEqual(['dan', 'emile', 'zoe'])
  })

  it('orders by the exact engine rating carried by the history, not the displayed integer', () => {
    const result = handBuilt([establishedStats('a', 999.6), establishedStats('b', 1000.4)])
    expect(statsOf(result, 'a').rating).toBe(1000)
    expect(statsOf(result, 'b').rating).toBe(1000)
    const players = [player('a', 'Aaron'), player('b', 'Zed')]
    expect(rank(result, players)).toEqual({ ranked: ['b', 'a'], rookies: [], inactive: [] })
  })

  it('lists a player unknown to the result as a rookie', () => {
    const result = handBuilt([establishedStats('a', 1200)])
    const ranking = rank(result, [player('a', 'Aaron'), player('new', 'New')])
    expect(ranking).toEqual({ ranked: ['a'], rookies: ['new'], inactive: [] })
  })
})

// ---------------------------------------------------------------------------
// previewMatch
// ---------------------------------------------------------------------------

describe('previewMatch', () => {
  const ownerResult = (): ReplayResult =>
    handBuilt(Object.entries(OWNER_RATINGS).map(([id, rating]) => establishedStats(id, rating)))

  it('owner example, exact: Strong 1400 + Weak 800 beat two 1100s 10-8', () => {
    const preview = previewMatch(ownerResult(), OWNER_PLAYERS, {
      teamA: ['strong', 'weak'],
      teamB: ['c1', 'c2'],
      target: 10,
      score: { winner: 'A', loserGoals: 8 },
    })
    expect(preview).toEqual({
      expectedA: 0.5,
      expectedB: 0.5,
      rows: [
        { playerId: 'strong', team: 'A', delta: 8.64 },
        { playerId: 'weak', team: 'A', delta: 10.56 },
        { playerId: 'c1', team: 'B', delta: -9.6 },
        { playerId: 'c2', team: 'B', delta: -9.6 },
      ],
    })
  })

  it('owner example, exact loss: same deltas as the engine on the established state', () => {
    const preview = previewMatch(ownerResult(), OWNER_PLAYERS, {
      teamA: ['strong', 'weak'],
      teamB: ['c1', 'c2'],
      target: 10,
      score: { winner: 'B', loserGoals: 8 },
    })
    const match: EngineMatch = {
      id: 'm',
      seq: 1,
      playedAt: 0,
      createdAt: 0,
      target: 10,
      teamA: ['strong', 'weak'],
      teamB: ['c1', 'c2'],
      scoreA: 8,
      scoreB: 10,
    }
    const deltas = applyMatch(establishedState(OWNER_RATINGS), match).deltas
    expect('rows' in preview && preview.rows.map((r) => ('delta' in r ? r.delta : null))).toEqual(deltas.map((d) => d.delta))
    expect(deltas[0].delta).toBeLessThan(deltas[1].delta) // Strong loses more than Weak
  })

  it('owner example, what-if: minimal-margin win and loss for each player', () => {
    const preview = previewMatch(ownerResult(), OWNER_PLAYERS, { teamA: ['strong', 'weak'], teamB: ['c1', 'c2'], target: 10 })
    // 10-9: base 16 × 1.1 × 0.5 = 8.8 per member; win shares 45/55, loss shares 55/45 for Strong/Weak, 50/50 for the 1100s.
    expect(preview).toEqual({
      expectedA: 0.5,
      expectedB: 0.5,
      rows: [
        { playerId: 'strong', team: 'A', winDelta: 7.92, lossDelta: -9.68 },
        { playerId: 'weak', team: 'A', winDelta: 9.68, lossDelta: -7.92 },
        { playerId: 'c1', team: 'B', winDelta: 8.8, lossDelta: -8.8 },
        { playerId: 'c2', team: 'B', winDelta: 8.8, lossDelta: -8.8 },
      ],
    })
  })

  it.each(DRAFTS)('exact preview equals the appended replay: %s', (_label, draft) => {
    const matches = fixtureMatches()
    const result = replay(PLAYERS, matches, { now: NOW })
    const loserGoals = draft.target - 3
    for (const winner of ['A', 'B'] as const) {
      const preview = previewMatch(result, PLAYERS, { ...draft, score: { winner, loserGoals } })
      const scoreA = winner === 'A' ? draft.target : loserGoals
      const scoreB = winner === 'B' ? draft.target : loserGoals
      const real = replay(PLAYERS, [...matches, appended(matches, draft, scoreA, scoreB)], { now: NOW })
      const realResult = matchResultOf(real, 'next')
      expect(preview).toEqual({
        expectedA: realResult.expectedA,
        expectedB: realResult.expectedB,
        rows: realResult.perPlayer.map((p) => ({ playerId: p.playerId, team: p.team, delta: p.delta })),
      })
    }
  })

  it.each(DRAFTS)('what-if preview equals the two minimal-margin appended replays: %s', (_label, draft) => {
    const matches = fixtureMatches()
    const result = replay(PLAYERS, matches, { now: NOW })
    const preview = previewMatch(result, PLAYERS, draft)
    const aWins = appendedDeltas(matches, draft, draft.target, draft.target - 1)
    const bWins = appendedDeltas(matches, draft, draft.target - 1, draft.target)
    const real = replay(PLAYERS, [...matches, appended(matches, draft, draft.target, draft.target - 1)], { now: NOW })
    const realResult = matchResultOf(real, 'next')
    expect(preview).toEqual({
      expectedA: realResult.expectedA,
      expectedB: realResult.expectedB,
      rows: realResult.perPlayer.map((p, i) => ({
        playerId: p.playerId,
        team: p.team,
        winDelta: p.team === 'A' ? aWins[i] : bWins[i],
        lossDelta: p.team === 'A' ? bWins[i] : aWins[i],
      })),
    })
  })

  it('is pure and leaves the result untouched', () => {
    const result = replay(PLAYERS, fixtureMatches(), { now: NOW })
    const frozen = structuredClone(result)
    const draft = DRAFTS[0][1]
    expect(previewMatch(result, PLAYERS, draft)).toEqual(previewMatch(result, PLAYERS, draft))
    expect(result).toEqual(frozen)
  })

  it('works on an empty history', () => {
    const players = [player('dan', 'Dan', 2), player('zoe', 'Zoé', 1)]
    const result = replay(players, [], { now: NOW })
    const preview = previewMatch(result, players, { teamA: ['dan'], teamB: ['zoe'], target: 10 })
    // 10-9 between two fresh players: 16 × 1.1 × 0.5 × rookie ×3 = 26.4
    expect(preview).toEqual({
      expectedA: 0.5,
      expectedB: 0.5,
      rows: [
        { playerId: 'dan', team: 'A', winDelta: 26.4, lossDelta: -26.4 },
        { playerId: 'zoe', team: 'B', winDelta: 26.4, lossDelta: -26.4 },
      ],
    })
  })

  it('throws on an invalid draft', () => {
    const result = replay(PLAYERS, fixtureMatches(), { now: NOW })
    const run = (draft: PreviewDraft): (() => unknown) => () => previewMatch(result, PLAYERS, draft)
    const base: PreviewDraft = { teamA: ['alice', 'eve'], teamB: ['bob', 'fred'], target: 10 }
    expect(run({ ...base, teamB: ['bob', 'nobody'] })).toThrow(/unknown player nobody/)
    expect(run({ ...base, teamA: ['alice', 'alice'] })).toThrow(/a player cannot appear twice/)
    expect(run({ ...base, teamB: ['alice', 'fred'] })).toThrow(/a player cannot appear twice/)
    expect(run({ ...base, teamA: ['alice'] })).toThrow(/both teams must have the same number of players/)
    expect(run({ ...base, teamA: [], teamB: [] })).toThrow(/each team has 1 or 2 players/)
    expect(run({ ...base, teamA: ['alice', 'eve', 'gus'], teamB: ['bob', 'fred', 'hal'] })).toThrow(/each team has 1 or 2 players/)
    expect(run({ ...base, score: { winner: 'A', loserGoals: 10 } })).toThrow(/exactly one team must have the target score/)
    expect(run({ ...base, score: { winner: 'B', loserGoals: -1 } })).toThrow(/the losing score must be between 0 and target - 1/)
    expect(run({ ...base, score: { winner: 'B', loserGoals: 2.5 } })).toThrow(/scores must be integers/)
    expect(run({ ...base, target: 7 as Target })).toThrow(/target must be 5 or 10/)
  })
})

// ---------------------------------------------------------------------------
// useReplay
// ---------------------------------------------------------------------------

describe('useReplay', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function Probe(): ReactElement {
    const view = useReplay()
    const text = [
      view.ranking.ranked.length,
      view.ranking.rookies.length,
      view.ranking.inactive.length,
      view.result.byPlayer.size,
      view.result.byMatch.size,
      view.players.size,
      view.matches.size,
      view.now instanceof Date,
    ].join('|')
    return createElement('p', null, text)
  }

  it('replays the persisted store under the app state provider', () => {
    const store: Store = {
      version: 1,
      players: PLAYERS,
      matches: fixtureMatches(),
      settings: DEFAULT_SETTINGS,
      nextSeq: 25,
      calls: [],
      callPlayers: [],
    }
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key === STORAGE_KEY ? JSON.stringify(store) : null),
      setItem: () => undefined,
    })
    vi.setSystemTime(NOW)
    const html = renderToString(createElement(AppStateProvider, null, createElement(Probe)))
    expect(html).toContain('>2|5|3|10|24|10|24|true<')
  })

  it('renders an empty store without players or matches', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
    const html = renderToString(createElement(AppStateProvider, null, createElement(Probe)))
    expect(html).toContain('>0|0|0|0|0|0|0|true<')
  })
})
