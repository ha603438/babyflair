import { describe, expect, it } from 'vitest'
import { replay } from '../../rating'
import type { Player } from '../../types'
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
