import type { ReactNode } from 'react'
import { Button } from '../../components/Button'
import { ScoreGrid } from '../../components/ScoreGrid'
import type { ScoreTeam } from '../../components/ScoreGrid'
import { SegmentedControl } from '../../components/SegmentedControl'
import { teamLabel } from '../../stats'
import { canBeComeback } from '../../store'
import type { DraftAction } from '../../store'
import type { Draft, Player, PlayerId, Target } from '../../types'
import { TEAM_A_FIRST_SLOT, TEAM_B_FIRST_SLOT } from './draftMatch'
import type { DraftTeams } from './draftMatch'
import { RosterSlots } from './RosterSlots'

const TARGET_OPTIONS = [
  { value: '5', label: 'En 5' },
  { value: '10', label: 'En 10' },
] as const

type TargetValue = (typeof TARGET_OPTIONS)[number]['value']

function targetValueOf(target: Target): TargetValue {
  if (target === 5) return '5'
  return '10'
}

function targetOf(value: TargetValue): Target {
  if (value === '5') return 5
  return 10
}

function panelClassOf(animate: boolean): string {
  if (animate) return 'content match-panel match-panel--enter'
  return 'content match-panel'
}

type ComebackCheckProps = { draft: Draft; dispatch: (action: DraftAction) => void }

/** « Comeback » box under the grid, only on a 5-4 in 5 (same look as the « Invité » box of InlinePlayerForm). */
function ComebackCheck({ draft, dispatch }: ComebackCheckProps) {
  if (!canBeComeback(draft)) return null
  return (
    <label className="inline-form-check comeback-check">
      <input
        type="checkbox"
        checked={draft.comeback === true}
        onChange={(event) => dispatch({ type: 'setComeback', value: event.target.checked })}
      />
      <span className="inline-form-check-text">
        <span className="inline-form-check-label">Comeback</span>
        <span className="inline-form-check-caption">Les vainqueurs étaient menés 0-4</span>
      </span>
    </label>
  )
}

export type ScorePanelProps = {
  draft: Draft
  /** The complete roster (the parent only renders the panel once `draftTeams` is non-null). */
  teams: DraftTeams
  dispatch: (action: DraftAction) => void
  playersById: Map<PlayerId, Player>
  /** New-match preview under the grid; omitted in edit mode (spec §3.5). */
  preview?: ReactNode
  saveText: string
  canSave: boolean
  onSave: () => void
  /** Plays the 220 ms slide-up of the step A → B transition (spec §8). */
  animate?: boolean
}

/**
 * Step B (spec §4): roster bar (team names return to step A with that team's first slot active, « Modifier » with
 * nothing changed), « Score » header with [En 5 | En 10], the ScoreGrid, the « Comeback » box on a 5-4, the
 * optional preview and the sticky CTA.
 * On viewports ≥ 760 px tall the CSS swaps the bar for the slot block.
 */
export function ScorePanel({
  draft,
  teams,
  dispatch,
  playersById,
  preview,
  saveText,
  canSave,
  onSave,
  animate = false,
}: ScorePanelProps) {
  const scoreTeams: readonly [ScoreTeam, ScoreTeam] = [
    { label: teamLabel(teams.teamA, playersById), players: teams.teamA },
    { label: teamLabel(teams.teamB, playersById), players: teams.teamB },
  ]
  return (
    <div className="match-screen match-screen--score">
      <div className={panelClassOf(animate)}>
        <div className="match-roster">
          <button
            type="button"
            className="match-roster__team match-roster__team--1"
            onClick={() => dispatch({ type: 'setActiveSlot', index: TEAM_A_FIRST_SLOT })}
          >
            {scoreTeams[0].label}
          </button>
          <span className="match-roster__vs">vs</span>
          <button
            type="button"
            className="match-roster__team match-roster__team--2"
            onClick={() => dispatch({ type: 'setActiveSlot', index: TEAM_B_FIRST_SLOT })}
          >
            {scoreTeams[1].label}
          </button>
          <Button variant="text" inline className="match-roster__edit" onClick={() => dispatch({ type: 'goToPlayers' })}>
            Modifier
          </Button>
        </div>
        <div className="match-panel__slots">
          <RosterSlots draft={draft} dispatch={dispatch} playersById={playersById} />
        </div>
        <div className="match-panel__header">
          <h2 className="match-panel__title">Score</h2>
          <SegmentedControl
            options={TARGET_OPTIONS}
            value={targetValueOf(draft.target)}
            onChange={(value) => dispatch({ type: 'setTarget', target: targetOf(value) })}
            aria-label="Cible"
          />
        </div>
        <ScoreGrid
          teams={scoreTeams}
          target={draft.target}
          value={draft.score}
          onChange={(score) => dispatch({ type: 'setScore', score })}
        />
        <ComebackCheck draft={draft} dispatch={dispatch} />
        {preview}
      </div>
      <div className="match-save">
        <div className="content">
          <Button variant="primary" size="lg" disabled={!canSave} onClick={onSave}>
            {saveText}
          </Button>
        </div>
      </div>
    </div>
  )
}
