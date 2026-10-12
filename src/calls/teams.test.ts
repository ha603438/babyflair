import { describe, expect, it } from 'vitest'
import { balanceTeams, bestSplit, pairSplits, shuffle } from './teams'

const RATINGS: Record<string, number> = { a: 1200, b: 1000, c: 1100, d: 900 }
const ratingOf = (id: string): number => RATINGS[id]
const zero = () => 0
/** A deterministic sequence of "random" numbers, cycled. */
function sequence(values: number[]): () => number {
  let index = 0
  return () => {
    const value = values[index % values.length]
    index += 1
    return value
  }
}

describe('pairSplits', () => {
  it('lists the 3 ways to pair 4 players, the first id always in the first pair', () => {
    expect(pairSplits(['a', 'b', 'c', 'd'])).toEqual([
      { first: ['a', 'b'], second: ['c', 'd'] },
      { first: ['a', 'c'], second: ['b', 'd'] },
      { first: ['a', 'd'], second: ['b', 'c'] },
    ])
  })
})

describe('bestSplit', () => {
  it('minimises the gap between the mean ratings', () => {
    // a+d = 2100 vs b+c = 2100 → gap 0; the other splits give 200 and 400.
    expect(bestSplit(['a', 'b', 'c', 'd'], ratingOf, zero)).toEqual({ first: ['a', 'd'], second: ['b', 'c'] })
  })

  it('breaks ties with the random source', () => {
    const equal = () => 1000
    expect(bestSplit(['a', 'b', 'c', 'd'], equal, zero)).toEqual({ first: ['a', 'b'], second: ['c', 'd'] })
    expect(bestSplit(['a', 'b', 'c', 'd'], equal, () => 0.99)).toEqual({ first: ['a', 'd'], second: ['b', 'c'] })
  })
})

describe('shuffle', () => {
  it('keeps the order with random = 0 and reverses pairs with random → 1', () => {
    expect(shuffle(['x', 'y'], zero)).toEqual(['y', 'x'])
    expect(shuffle(['x', 'y'], () => 0.99)).toEqual(['x', 'y'])
    expect(shuffle(['x', 'y', 'z'], zero)).toHaveLength(3)
  })

  it('does not mutate its input', () => {
    const input = ['x', 'y', 'z']
    shuffle(input, zero)
    expect(input).toEqual(['x', 'y', 'z'])
  })
})

describe('balanceTeams', () => {
  it('is deterministic with an injected random: best split, positions and sides', () => {
    // random: tie-break (unused, single best), shuffle pair 1, shuffle pair 2, side draw (< 0.5 → first pair = A).
    const teams = balanceTeams(['a', 'b', 'c', 'd'], ratingOf, sequence([0, 0.99, 0.99, 0]))
    expect(teams).toEqual({ teamA: ['a', 'd'], teamB: ['b', 'c'] })
  })

  it('draws the sides: random ≥ 0.5 puts the first pair in Noirs', () => {
    const teams = balanceTeams(['a', 'b', 'c', 'd'], ratingOf, sequence([0, 0.99, 0.99, 0.9]))
    expect(teams).toEqual({ teamA: ['b', 'c'], teamB: ['a', 'd'] })
  })

  it('shuffles positions inside each pair (index 0 = arrière, 1 = avant)', () => {
    const teams = balanceTeams(['a', 'b', 'c', 'd'], ratingOf, sequence([0, 0, 0, 0]))
    expect(teams).toEqual({ teamA: ['d', 'a'], teamB: ['c', 'b'] })
  })

  it('always uses the 4 players exactly once', () => {
    for (let i = 0; i < 50; i += 1) {
      const teams = balanceTeams(['a', 'b', 'c', 'd'], ratingOf, Math.random)
      expect([...teams.teamA, ...teams.teamB].sort()).toEqual(['a', 'b', 'c', 'd'])
      expect(teams.teamA.sort().join()).toMatch(/^(a,d|b,c)$/)
    }
  })

  it('refuses anything but 4 distinct players', () => {
    expect(() => balanceTeams(['a', 'b', 'c'], ratingOf, zero)).toThrow()
    expect(() => balanceTeams(['a', 'a', 'c', 'd'], ratingOf, zero)).toThrow()
  })
})
