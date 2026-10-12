import { useId } from 'react'
import type { PlayerId, Score, Target, Team } from '../types'
import { fmtScore } from '../format'

/** One side of the match as the grid sees it: the display label and the ids (count drives « gagne » / « gagnent »). */
export type ScoreTeam = { label: string; players: PlayerId[] }

export type ScoreGridProps = {
  /** Index 0 is team A (Équipe 1), index 1 is team B (Équipe 2). */
  teams: readonly [ScoreTeam, ScoreTeam]
  target: Target
  value: Score | null
  onChange: (score: Score) => void
}

const TEAM_KEYS: readonly [Team, Team] = ['A', 'B']

function verbOf(team: ScoreTeam): string {
  if (team.players.length > 1) return 'gagnent'
  return 'gagne'
}

function loserGoalsRange(target: Target): number[] {
  return Array.from({ length: target }, (_, goals) => goals)
}

/** The loser goals selected for this team, or null when the selection is empty or belongs to the other team. */
function selectedGoalsFor(value: Score | null, teamKey: Team): number | null {
  if (value === null || value.winner !== teamKey) return null
  return value.loserGoals
}

function blockClassName(index: 0 | 1, winner: boolean, dimmed: boolean): string {
  const parts = ['scoregrid__block', `scoregrid__block--team${index + 1}`]
  if (winner) parts.push('is-winner')
  if (dimmed) parts.push('is-dimmed')
  return parts.join(' ')
}

type BlockProps = {
  team: ScoreTeam
  index: 0 | 1
  target: Target
  value: Score | null
  onChange: (score: Score) => void
}

function BlockLabel({ team, target, selectedGoals }: { team: ScoreTeam; target: Target; selectedGoals: number | null }) {
  const verb = verbOf(team)
  if (selectedGoals === null) {
    return (
      <>
        <span className="scoregrid__team">{team.label}</span> {verb} {target} à
      </>
    )
  }
  return (
    <>
      <span className="scoregrid__check" aria-hidden="true">
        ✓
      </span>{' '}
      <span className="scoregrid__team">{team.label}</span> {verb} {fmtScore(target, selectedGoals)}
    </>
  )
}

function ScoreBlock({ team, index, target, value, onChange }: BlockProps) {
  const labelId = useId()
  const teamKey = TEAM_KEYS[index]
  const selectedGoals = selectedGoalsFor(value, teamKey)
  const winner = selectedGoals !== null
  const dimmed = value !== null && !winner
  const verb = verbOf(team)
  return (
    <div className={blockClassName(index, winner, dimmed)} role="group" aria-labelledby={labelId}>
      <p id={labelId} className="scoregrid__label">
        <BlockLabel team={team} target={target} selectedGoals={selectedGoals} />
      </p>
      <div className="scoregrid__cells">
        {loserGoalsRange(target).map((goals) => {
          const selected = selectedGoals === goals
          return (
            <button
              key={goals}
              type="button"
              className={selected ? 'scoregrid__cell is-selected' : 'scoregrid__cell'}
              aria-label={`${team.label} ${verb} ${target} à ${goals}`}
              aria-pressed={selected}
              onClick={() => onChange({ winner: teamKey, loserGoals: goals })}
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
 * Step B key widget: one block per team, « {Équipe} gagne(nt) {target} à » over the loser's possible goals.
 * One tap encodes the winner and the loser's score; the other block dims once a value exists.
 */
export function ScoreGrid({ teams, target, value, onChange }: ScoreGridProps) {
  return (
    <div className="scoregrid">
      <ScoreBlock team={teams[0]} index={0} target={target} value={value} onChange={onChange} />
      <ScoreBlock team={teams[1]} index={1} target={target} value={value} onChange={onChange} />
    </div>
  )
}
