import { describe, expect, it } from 'vitest'
import { nextScore } from './score'

describe('nextScore', () => {
  it('a loser score on one side makes the other side the winner', () => {
    expect(nextScore(null, 'B', 3, 5)).toEqual({ winner: 'A', loserGoals: 3 })
    expect(nextScore(null, 'A', 8, 10)).toEqual({ winner: 'B', loserGoals: 8 })
  })
  it('the target on a side makes it the winner, keeping the loser goals when already set', () => {
    expect(nextScore(null, 'A', 5, 5)).toEqual({ winner: 'A', loserGoals: 0 })
    expect(nextScore({ winner: 'A', loserGoals: 3 }, 'A', 5, 5)).toEqual({ winner: 'A', loserGoals: 3 })
    expect(nextScore({ winner: 'A', loserGoals: 3 }, 'B', 5, 5)).toEqual({ winner: 'B', loserGoals: 0 })
  })
})
