import { useId } from 'react'
import type { PlayerId, Score, Target, Team } from '../types'
import { nextScore } from './score'

/** One side of the match as the grid sees it: the display label and the ids. */
export type ScoreTeam = { label: string; players: PlayerId[] }

export type ScoreGridProps = {
  /** Index 0 is team A (Blancs, left), index 1 is team B (Noirs, right). */
  teams: readonly [ScoreTeam, ScoreTeam]
  target: Target
  value: Score | null
  onChange: (score: Score) => void
}

const TEAM_KEYS: readonly [Team, Team] = ['A', 'B']
const SIDE_NAMES: readonly [string, string] = ['Blancs', 'Noirs']

function goalsRange(target: Target): number[] {
  return Array.from({ length: target + 1 }, (_, goals) => goals)
}

/** The goals shown as selected on this side: the target for the winner, the loser's goals for the loser. */
function selectedGoalsFor(value: Score | null, teamKey: Team, target: Target): number | null {
  if (value === null) return null
  if (value.winner === teamKey) return target
  return value.loserGoals
}

type SideProps = {
  team: ScoreTeam
  index: 0 | 1
  target: Target
  value: Score | null
  onChange: (score: Score) => void
}

function sideClassName(index: 0 | 1, status: 'winner' | 'loser' | 'none'): string {
  const parts = ['scoregrid__side', `scoregrid__side--team${index + 1}`]
  if (status === 'winner') parts.push('is-winner')
  if (status === 'loser') parts.push('is-loser')
  return parts.join(' ')
}

function ScoreSide({ team, index, target, value, onChange }: SideProps) {
  const labelId = useId()
  const teamKey = TEAM_KEYS[index]
  const selected = selectedGoalsFor(value, teamKey, target)
  const status = value === null ? 'none' : value.winner === teamKey ? 'winner' : 'loser'
  return (
    <div className={sideClassName(index, status)} role="group" aria-labelledby={labelId}>
      <p id={labelId} className="scoregrid__label">
        <span className="scoregrid__side-name">{SIDE_NAMES[index]}</span>
        <span className="scoregrid__team">{team.label}</span>
      </p>
      <div className="scoregrid__cells">
        {goalsRange(target).map((goals) => {
          const isSelected = selected === goals
          const isTarget = goals === target
          const cls = ['scoregrid__cell', isTarget ? 'scoregrid__cell--target' : '', isSelected ? 'is-selected' : '']
          return (
            <button
              key={goals}
              type="button"
              className={cls.filter(Boolean).join(' ')}
              aria-label={isTarget ? `${team.label} gagne ${target}` : `${team.label} ${goals} but${goals > 1 ? 's' : ''}`}
              aria-pressed={isSelected}
              onClick={() => onChange(nextScore(value, teamKey, goals, target))}
            >
              {goals}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Step B key widget: the two teams side by side (Blancs left, Noirs right), each with its goals 0…target.
 * Tapping the target on a side makes it the winner; tapping any other number makes that side the loser with
 * that many goals (the other side wins). The winner's side is highlighted, the loser's dimmed.
 */
export function ScoreGrid({ teams, target, value, onChange }: ScoreGridProps) {
  return (
    <div className="scoregrid">
      <ScoreSide team={teams[0]} index={0} target={target} value={value} onChange={onChange} />
      <span className="scoregrid__vs" aria-hidden="true">
        –
      </span>
      <ScoreSide team={teams[1]} index={1} target={target} value={value} onChange={onChange} />
    </div>
  )
}
