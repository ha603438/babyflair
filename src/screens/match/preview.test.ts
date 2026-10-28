import { describe, expect, it } from 'vitest'
import { replay } from '../../rating'
import { formatOfTeam, matchResult, ofFormat, replayRankings } from '../../rating/rankings'
import type { Match, Player } from '../../types'
import { computePreview } from './preview'

const NOW = new Date('2025-10-10T12:00:00.000Z')

const PLAYERS: Player[] = [
  { id: 'alice', name: 'Alice', isGuest: false, createdAt: '2025-09-01T10:00:00.000Z' },
  { id: 'bob', name: 'Bob', isGuest: false, createdAt: '2025-09-02T10:00:00.000Z' },
  { id: 'chloe', name: 'Chloé', isGuest: true, createdAt: '2025-09-03T10:00:00.000Z' },
  { id: 'dan', name: 'Dan', isGuest: false, createdAt: '2025-09-04T10:00:00.000Z' },
]

const RESULT = replay(PLAYERS, [], { now: NOW })
const TEAMS_2V2 = { teamA: ['alice', 'bob'], teamB: ['chloe', 'dan'] }
const TEAMS_1V1 = { teamA: ['alice'], teamB: ['dan'] }

describe('computePreview', () => {
  it('gives the what-if rows (one per player, win > 0 > loss) before a score', () => {
    const preview = computePreview(RESULT, PLAYERS, TEAMS_2V2, 10, null)
    expect(preview?.mode).toBe('whatif')
    if (preview?.mode !== 'whatif') return
    expect(preview.data.rows).toHaveLength(4)
    expect(preview.data.rows.map((row) => row.playerId).sort()).toEqual(['alice', 'bob', 'chloe', 'dan'])
    for (const row of preview.data.rows) {
      expect(row.winDelta).toBeGreaterThan(0)
      expect(row.lossDelta).toBeLessThan(0)
    }
    expect(preview.data.expectedA + preview.data.expectedB).toBeCloseTo(1, 6)
  })

  it('gives the exact deltas once a score exists, signed by the winning side', () => {
    const preview = computePreview(RESULT, PLAYERS, TEAMS_2V2, 10, { winner: 'B', loserGoals: 8 })
    expect(preview?.mode).toBe('exact')
    if (preview?.mode !== 'exact') return
    expect(preview.data.rows).toHaveLength(4)
    for (const row of preview.data.rows) {
      if (row.team === 'B') expect(row.delta).toBeGreaterThan(0)
      if (row.team === 'A') expect(row.delta).toBeLessThan(0)
    }
  })

  it('handles 1v1 and both targets', () => {
    expect(computePreview(RESULT, PLAYERS, TEAMS_1V1, 5, null)?.data.rows).toHaveLength(2)
    expect(computePreview(RESULT, PLAYERS, TEAMS_1V1, 5, { winner: 'A', loserGoals: 4 })?.data.rows).toHaveLength(2)
  })

  it('hides the preview instead of throwing on a draft the engine rejects', () => {
    expect(computePreview(RESULT, PLAYERS, { teamA: ['alice', 'alice'], teamB: ['chloe', 'dan'] }, 10, null)).toBeNull()
    expect(computePreview(RESULT, PLAYERS, { teamA: ['alice', 'bob'], teamB: ['ghost', 'dan'] }, 10, null)).toBeNull()
    expect(computePreview(RESULT, PLAYERS, { teamA: ['alice', 'bob'], teamB: ['dan'] }, 10, null)).toBeNull()
    expect(
      computePreview(RESULT, PLAYERS, { teamA: ['alice'], teamB: ['alice'] }, 10, { winner: 'A', loserGoals: 3 }),
    ).toBeNull()
  })
})

describe('computePreview on the ranking of the draft (as the match screen calls it)', () => {
  function played(id: string, seq: number, teamA: string[], teamB: string[], scoreA: number, scoreB: number): Match {
    const at = new Date(Date.parse('2025-10-01T12:00:00.000Z') + seq * 60_000).toISOString()
    return { id, seq, playedAt: at, createdAt: at, updatedAt: at, target: 10, teamA, teamB, scoreA, scoreB }
  }
  // Alice & Bob won two 2v2; in 1v1, Chloé beat Bob once (Alice and Dan never played one).
  const HISTORY = [
    played('m1', 1, ['alice', 'bob'], ['chloe', 'dan'], 10, 2),
    played('m2', 2, ['bob', 'alice'], ['dan', 'chloe'], 10, 4),
    played('m3', 3, ['chloe'], ['bob'], 10, 6),
  ]
  const RANKINGS = replayRankings(PLAYERS, HISTORY, NOW)

  function previewOf(teams: { teamA: string[]; teamB: string[] }, score: { winner: 'A' | 'B'; loserGoals: number }) {
    const { result } = ofFormat(RANKINGS, formatOfTeam(teams.teamA))
    return computePreview(result, PLAYERS, teams, 10, score)
  }

  function appended(teams: { teamA: string[]; teamB: string[] }, scoreA: number, scoreB: number): number[] {
    const next = played('next', 4, teams.teamA, teams.teamB, scoreA, scoreB)
    const rankings = replayRankings(PLAYERS, [...HISTORY, next], NOW)
    return matchResult(rankings, 'next')?.perPlayer.map((row) => row.delta) ?? []
  }

  it('previews a 1v1 on the 1V1 ratings: Alice, top of 2V2 mixte, starts her first 1v1 at 50 %', () => {
    const before = computePreview(ofFormat(RANKINGS, '1v1').result, PLAYERS, TEAMS_1V1, 10, null)
    expect(before?.data.expectedA).toBe(0.5)
    const exact = previewOf(TEAMS_1V1, { winner: 'A', loserGoals: 7 })
    if (exact?.mode !== 'exact') throw new Error('exact preview expected')
    expect(exact.data.rows.map((row) => row.delta)).toEqual(appended(TEAMS_1V1, 10, 7))
    // On the 2V2 mixte ratings, the same roster would not be even.
    expect(computePreview(RANKINGS.main.result, PLAYERS, TEAMS_1V1, 10, null)?.data.expectedA).toBeGreaterThan(0.5)
  })

  it('previews a 2v2 on the 2V2 mixte ratings, whatever the 1v1 matches', () => {
    const exact = previewOf(TEAMS_2V2, { winner: 'B', loserGoals: 8 })
    if (exact?.mode !== 'exact') throw new Error('exact preview expected')
    expect(exact.data.rows.map((row) => row.delta)).toEqual(appended(TEAMS_2V2, 8, 10))
    const without1v1 = replayRankings(PLAYERS, HISTORY.slice(0, 2), NOW)
    const plain = computePreview(without1v1.main.result, PLAYERS, TEAMS_2V2, 10, null)
    expect(computePreview(RANKINGS.main.result, PLAYERS, TEAMS_2V2, 10, null)).toEqual(plain)
  })
})
