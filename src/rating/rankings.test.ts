import { describe, expect, it } from 'vitest'

import type { Match, Player, Target } from '../types'
import { previewMatch, replay, teamExpectation } from './index'
import { matchesOfFormat, MODE_RANKED_AFTER, replayMode } from './modes'
import {
  careerOf,
  draftExpectation,
  formatOfMatch,
  formatOfTeam,
  matchResult,
  ofFormat,
  rankedAfterOf,
  replayMain,
  replayRankings,
} from './rankings'

// The three separate rankings (./rankings.ts): 2V2 mixte over the 2v2 matches, 1V1 over the 1v1 ones, each match
// rated by the ranking of its format only.

const NOW = new Date('2026-10-20T12:00:00.000Z')
const DAY = 86_400_000

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString()
}

const PLAYERS: Player[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
  id,
  name: id.toUpperCase(),
  isGuest: false,
  createdAt: daysAgo(100),
}))

type Spec = {
  id: string
  teamA: string[]
  teamB: string[]
  scoreA: number
  scoreB: number
  days: number
  target?: Target
  betA?: number
}

function matches(specs: Spec[]): Match[] {
  return specs.map(({ days, target = 10, ...spec }, i) => ({
    ...spec,
    seq: i + 1,
    playedAt: daysAgo(days),
    createdAt: daysAgo(days),
    updatedAt: daysAgo(days),
    target,
  }))
}

// 2v2 and 1v1 interleaved; e and f only ever played one 1v1, three days ago.
const HISTORY = matches([
  { id: 'm1', teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 10, scoreB: 6, days: 40 },
  { id: 'm2', teamA: ['a'], teamB: ['c'], scoreA: 10, scoreB: 3, days: 35 },
  { id: 'm3', teamA: ['c', 'd'], teamB: ['a', 'b'], scoreA: 10, scoreB: 8, days: 30 },
  { id: 'm4', teamA: ['b'], teamB: ['d'], scoreA: 5, scoreB: 4, days: 20, target: 5 },
  { id: 'm5', teamA: ['a', 'c'], teamB: ['b', 'd'], scoreA: 10, scoreB: 9, days: 10 },
  { id: 'm6', teamA: ['a'], teamB: ['b'], scoreA: 10, scoreB: 7, days: 5 },
  { id: 'm7', teamA: ['e'], teamB: ['f'], scoreA: 10, scoreB: 2, days: 3 },
])

const RANKINGS = replayRankings(PLAYERS, HISTORY, NOW)

function ratings(result: { byPlayer: Map<string, { history: { ratingAfter: number }[] }> }): Record<string, number> {
  return Object.fromEntries([...result.byPlayer].map(([id, stats]) => [id, stats.history.at(-1)?.ratingAfter ?? 1000]))
}

function at(days: number, spec: Omit<Spec, 'days'>, seq: number): Match {
  const [match] = matches([{ ...spec, days }])
  return { ...match, seq }
}

describe('replayRankings: three separate rankings', () => {
  it('2V2 mixte is the engine replay of the 2v2 matches only, with every player and the default thresholds', () => {
    const main = replayMain(PLAYERS, HISTORY, NOW)
    expect(main.result).toEqual(replay(PLAYERS, matchesOfFormat(HISTORY, '2v2'), { now: NOW }))
    expect(main.matches.map((m) => m.id)).toEqual(['m1', 'm3', 'm5'])
    expect(main.result.byPlayer.size).toBe(PLAYERS.length)
    expect([...main.result.byMatch.keys()]).toEqual(['m1', 'm3', 'm5'])
    expect(main.result.byPlayer.get('a')).toMatchObject({ played: 3, rookieProgress: 3, status: 'rookie' })
    expect(RANKINGS.main.result).toEqual(main.result)
  })

  it('1V1 is the 1v1 ranking of modes.ts (ranked after 3)', () => {
    expect(RANKINGS.oneVsOne.result).toEqual(replayMode('1v1', PLAYERS, HISTORY, NOW).result)
    expect([...RANKINGS.oneVsOne.result.byMatch.keys()]).toEqual(['m2', 'm4', 'm6', 'm7'])
  })

  it('a 1v1 match leaves every 2V2 mixte rating and result unchanged', () => {
    const extra = at(1, { id: 'x', teamA: ['a'], teamB: ['d'], scoreA: 10, scoreB: 0, betA: 10 }, 99)
    const more = replayRankings(PLAYERS, [...HISTORY, extra], NOW)
    expect(more.main.result).toEqual(RANKINGS.main.result)
    expect(more.main.ranking).toEqual(RANKINGS.main.ranking)
    // Without any 1v1 at all, the 2V2 mixte ranking is the same too.
    const only2v2 = replayRankings(PLAYERS, matchesOfFormat(HISTORY, '2v2'), NOW)
    expect(only2v2.main.result).toEqual(RANKINGS.main.result)
    // The 1V1 ranking did move.
    expect(ratings(more.oneVsOne.result)).not.toEqual(ratings(RANKINGS.oneVsOne.result))
  })

  it('a 2v2 match leaves every 1V1 rating and result unchanged', () => {
    const extra = at(1, { id: 'x', teamA: ['e', 'f'], teamB: ['a', 'b'], scoreA: 10, scoreB: 0 }, 99)
    const more = replayRankings(PLAYERS, [...HISTORY, extra], NOW)
    expect(more.oneVsOne.result).toEqual(RANKINGS.oneVsOne.result)
    expect(more.oneVsOne.ranking).toEqual(RANKINGS.oneVsOne.ranking)
    const only1v1 = replayRankings(PLAYERS, matchesOfFormat(HISTORY, '1v1'), NOW)
    expect(only1v1.oneVsOne.result).toEqual(RANKINGS.oneVsOne.result)
    expect(ratings(more.main.result)).not.toEqual(ratings(RANKINGS.main.result))
  })

  it('judges and pays a 1v1 announcement in the 1V1 ranking only', () => {
    const bet = HISTORY.map((m) => (m.id === 'm6' ? { ...m, betA: 3 } : m))
    const rankings = replayRankings(PLAYERS, bet, NOW)
    const result = matchResult(rankings, 'm6')
    expect(result?.bets).toEqual([expect.objectContaining({ team: 'A', n: 3, success: true })])
    expect(result).toBe(rankings.oneVsOne.result.byMatch.get('m6'))
    // m6 opposes a (1V1 winner of m2) and b (winner of m4): its chance comes from their 1V1 ratings.
    const a = rankings.oneVsOne.result.byPlayer.get('a')?.history.find((p) => p.matchId === 'm2')?.ratingAfter
    const b = rankings.oneVsOne.result.byPlayer.get('b')?.history.find((p) => p.matchId === 'm4')?.ratingAfter
    expect(result?.perPlayer[0].before).toBe(a)
    expect(result?.perPlayer[1].before).toBe(b)
    expect(rankings.main.result).toEqual(RANKINGS.main.result)
  })
})

describe('matchResult: the rating of a match is the ranking of its format', () => {
  it('lists every match once, in replay order, each from its own ranking', () => {
    expect([...RANKINGS.byMatch.keys()]).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'])
    for (const match of HISTORY) {
      const own = ofFormat(RANKINGS, formatOfMatch(match)).result
      expect(matchResult(RANKINGS, match.id)).toBe(own.byMatch.get(match.id))
    }
    expect(matchResult(RANKINGS, 'nope')).toBeUndefined()
  })

  it('keeps the replay order when a match is moved earlier (playedAt, then seq)', () => {
    const moved = HISTORY.map((m) => (m.id === 'm6' ? { ...m, playedAt: daysAgo(45) } : m))
    const rankings = replayRankings(PLAYERS, moved, NOW)
    expect([...rankings.byMatch.keys()]).toEqual(['m6', 'm1', 'm2', 'm3', 'm4', 'm5', 'm7'])
  })

  it('maps a format to its ranking and threshold', () => {
    expect(formatOfTeam(['a'])).toBe('1v1')
    expect(formatOfTeam(['a', 'b'])).toBe('2v2')
    expect(ofFormat(RANKINGS, '1v1')).toBe(RANKINGS.oneVsOne)
    expect(ofFormat(RANKINGS, '2v2')).toBe(RANKINGS.main)
    expect(rankedAfterOf('1v1')).toBe(MODE_RANKED_AFTER)
    expect(rankedAfterOf('2v2')).toBe(10)
  })
})

describe('draftExpectation', () => {
  it('judges a new draft in the ranking of its format, like the preview', () => {
    const solo = { teamA: ['a'], teamB: ['b'], target: 10 as const }
    const duo = { teamA: ['a', 'c'], teamB: ['b', 'd'], target: 10 as const }
    expect(draftExpectation(RANKINGS, solo)).toBe(teamExpectation(RANKINGS.oneVsOne.result, solo))
    expect(draftExpectation(RANKINGS, solo)).toBe(previewMatch(RANKINGS.oneVsOne.result, PLAYERS, solo).expectedA)
    expect(draftExpectation(RANKINGS, duo)).toBe(teamExpectation(RANKINGS.main.result, duo))
    expect(draftExpectation(RANKINGS, duo)).toBe(previewMatch(RANKINGS.main.result, PLAYERS, duo).expectedA)
  })

  it('ignores the other format: e and f, even in 1v1, start their first 2v2 at 1 000', () => {
    const draft = { teamA: ['e', 'f'], teamB: ['c', 'd'], target: 10 as const }
    expect(draftExpectation(RANKINGS, { teamA: ['e'], teamB: ['f'], target: 10 })).toBeGreaterThan(0.5)
    expect(draftExpectation(RANKINGS, draft)).toBe(teamExpectation(RANKINGS.main.result, draft))
    const mean = (ids: string[]) => ids.reduce((sum, id) => sum + ratings(RANKINGS.main.result)[id], 0) / ids.length
    expect(mean(['e', 'f'])).toBe(1000)
  })

  it('places an edited match where it stands in the replay, as the stored result did', () => {
    const solo = { teamA: ['b'], teamB: ['d'], target: 5 as const }
    expect(draftExpectation(RANKINGS, solo, 'm4')).toBe(matchResult(RANKINGS, 'm4')?.expectedA)
    const duo = { teamA: ['a', 'c'], teamB: ['b', 'd'], target: 10 as const }
    expect(draftExpectation(RANKINGS, duo, 'm5')).toBe(matchResult(RANKINGS, 'm5')?.expectedA)
  })

  it('keeps that place when the edit changes the format (the chance the saved edit will be rated with)', () => {
    const toDuo = { teamA: ['b', 'e'], teamB: ['d', 'f'], target: 5 as const }
    const asDuo = HISTORY.map((m) => (m.id === 'm4' ? { ...m, ...toDuo } : m))
    const duoReplay = replayRankings(PLAYERS, asDuo, NOW)
    expect(draftExpectation(RANKINGS, toDuo, 'm4')).toBe(matchResult(duoReplay, 'm4')?.expectedA)

    const toSolo = { teamA: ['a'], teamB: ['b'], target: 10 as const }
    const asSolo = HISTORY.map((m) => (m.id === 'm5' ? { ...m, ...toSolo } : m))
    const soloReplay = replayRankings(PLAYERS, asSolo, NOW)
    expect(draftExpectation(RANKINGS, toSolo, 'm5')).toBe(matchResult(soloReplay, 'm5')?.expectedA)

    // The last 1v1 edited into a 2v2: nothing after it, so after every 2v2.
    const last = { teamA: ['e', 'a'], teamB: ['f', 'b'], target: 10 as const }
    const asLast = HISTORY.map((m) => (m.id === 'm7' ? { ...m, ...last } : m))
    const lastReplay = replayRankings(PLAYERS, asLast, NOW)
    expect(draftExpectation(RANKINGS, last, 'm7')).toBe(matchResult(lastReplay, 'm7')?.expectedA)
  })
})

describe('careerOf: a profile over every match', () => {
  it('adds both rankings up and merges their points in replay order', () => {
    const career = careerOf(RANKINGS, 'a')
    // a: m1 W, m2 W (1v1), m3 L, m5 W, m6 W (1v1).
    expect(career).toMatchObject({ playerId: 'a', played: 5, wins: 4, losses: 1 })
    expect(career.history.map((point) => point.matchId)).toEqual(['m1', 'm2', 'm3', 'm5', 'm6'])
    expect(careerOf(RANKINGS, 'e')).toMatchObject({ played: 1, wins: 1, losses: 0 })
    expect(careerOf(RANKINGS, 'nobody')).toEqual({ playerId: 'nobody', played: 0, wins: 0, losses: 0, history: [] })
  })
})

describe('presence: who still plays, whatever the format', () => {
  it('takes the latest match of any format', () => {
    expect(RANKINGS.presence.get('a')?.lastPlayedAt).toBe(daysAgo(5))
    expect(RANKINGS.main.result.byPlayer.get('a')?.lastPlayedAt).toBe(daysAgo(10))
    expect(RANKINGS.presence.get('c')?.lastPlayedAt).toBe(daysAgo(10))
  })

  it('is inactive only without any match for 30 days', () => {
    // e and f never played 2v2 (inactive in 2V2 mixte) but played a 1v1 three days ago.
    expect(RANKINGS.main.result.byPlayer.get('e')?.status).toBe('inactive')
    expect(RANKINGS.presence.get('e')?.status).not.toBe('inactive')
    const later = replayRankings(PLAYERS, HISTORY, new Date(NOW.getTime() + 40 * DAY))
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) expect(later.presence.get(id)?.status).toBe('inactive')
    const idle = replayRankings([...PLAYERS, { ...PLAYERS[0], id: 'g', name: 'G' }], HISTORY, NOW)
    expect(idle.presence.get('g')).toEqual({ lastPlayedAt: undefined, status: 'inactive' })
  })
})
