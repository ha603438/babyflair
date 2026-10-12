import type { Score, Target, Team } from '../types'

function otherOf(team: Team): Team {
  if (team === 'A') return 'B'
  return 'A'
}

/** One tap: the target on a side makes it the winner (loser goals kept, else 0); any other value makes it the loser. */
export function nextScore(current: Score | null, teamKey: Team, goals: number, target: Target): Score {
  if (goals === target) {
    const loserGoals = current !== null && current.winner === teamKey ? current.loserGoals : 0
    return { winner: teamKey, loserGoals }
  }
  return { winner: otherOf(teamKey), loserGoals: goals }
}
