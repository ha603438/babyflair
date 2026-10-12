// Balanced 2v2 teams for a full call. Pure: the ratings and the random source are injected, so the choice is
// deterministic in tests (random = () => 0 always takes the first option).
import type { PlayerId, Team } from '../types'

export type BalancedTeams = { teamA: PlayerId[]; teamB: PlayerId[] }
export type Random = () => number

type Split = { first: PlayerId[]; second: PlayerId[] }

/** The 3 ways to split 4 players into 2 pairs (index 0 stays in `first` each time). */
export function pairSplits(ids: PlayerId[]): Split[] {
  const [a, b, c, d] = ids
  return [
    { first: [a, b], second: [c, d] },
    { first: [a, c], second: [b, d] },
    { first: [a, d], second: [b, c] },
  ]
}

function mean(ids: PlayerId[], ratingOf: (id: PlayerId) => number): number {
  return ids.reduce((sum, id) => sum + ratingOf(id), 0) / ids.length
}

function gapOf(split: Split, ratingOf: (id: PlayerId) => number): number {
  return Math.abs(mean(split.first, ratingOf) - mean(split.second, ratingOf))
}

function pickIndex(random: Random, count: number): number {
  const index = Math.floor(random() * count)
  return Math.min(Math.max(index, 0), count - 1)
}

/** Fisher–Yates with the injected random source. */
export function shuffle<T>(items: T[], random: Random): T[] {
  const result = items.slice()
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = pickIndex(random, i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** The split minimising |mean A − mean B|; ties are broken at random. */
export function bestSplit(ids: PlayerId[], ratingOf: (id: PlayerId) => number, random: Random): Split {
  const splits = pairSplits(ids)
  const gaps = splits.map((split) => gapOf(split, ratingOf))
  const best = Math.min(...gaps)
  const tied = splits.filter((_, index) => Math.abs(gaps[index] - best) < 1e-9)
  return tied[pickIndex(random, tied.length)]
}

/**
 * Four players → Blancs (teamA) / Noirs (teamB), positions shuffled inside each pair (index 0 = arrière, 1 = avant)
 * and the sides drawn at random. Throws on anything but exactly 4 distinct ids.
 */
export function balanceTeams(ids: PlayerId[], ratingOf: (id: PlayerId) => number, random: Random): BalancedTeams {
  if (ids.length !== 4 || new Set(ids).size !== 4) throw new Error('balanceTeams: exactly 4 distinct players expected')
  const split = bestSplit(ids, ratingOf, random)
  const first = shuffle(split.first, random)
  const second = shuffle(split.second, random)
  const firstSide: Team = random() < 0.5 ? 'A' : 'B'
  if (firstSide === 'A') return { teamA: first, teamB: second }
  return { teamA: second, teamB: first }
}
