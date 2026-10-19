import { Fragment } from 'react'
import { betOddsParts, DEFAULT_BET, draftBetSucceeds, goalsLabel, SIDE_NAME } from '../../bets'
import { fmtDelta } from '../../format'
import { betOutlook } from '../../rating'
import type { DraftAction } from '../../store'
import type { Draft, Score, Target, Team } from '../../types'

export type BetPickerProps = {
  /** A complete roster (the score step), on the shared draft (new match) or a local one (edit). */
  draft: Draft
  dispatch: (action: DraftAction) => void
  /** Team A's win expectation for this roster (rating/index.ts teamExpectation): the stepper's live chances. */
  expectedA: number
}

const TEAMS: readonly Team[] = ['A', 'B']

function expectedOf(team: Team, expectedA: number): number {
  if (team === 'A') return expectedA
  return 1 - expectedA
}

function betIn(draft: Draft, team: Team): number | null {
  if (team === 'A') return draft.betA ?? null
  return draft.betB ?? null
}

type Outlook = ReturnType<typeof betOutlook>

/** « 23 % · +12 si réussi · −4 sinon », each part kept on one line so a narrow column wraps between them. */
function Odds({ outlook }: { outlook: Outlook }) {
  const parts = betOddsParts(outlook)
  return (
    <p className="bet__odds">
      {parts.map((part, index) => (
        <Fragment key={part}>
          {index > 0 && <span className="bet__odds-sep"> · </span>}
          <span className="bet__odds-part">{part}</span>
        </Fragment>
      ))}
    </p>
  )
}

type StatusProps = { score: Score | null; target: Target; team: Team; n: number; outlook: Outlook }

/** Once the score is chosen: « ✓ Réussie : +12 » or « ✗ Ratée : −4 » (the preview below has the exact totals). */
function Status({ score, target, team, n, outlook }: StatusProps) {
  if (score === null) return null
  if (draftBetSucceeds(score, target, team, n)) {
    return <p className="bet__status bet__status--won">✓ Réussie{' '}: {fmtDelta(outlook.success)}</p>
  }
  return <p className="bet__status bet__status--lost">✗ Ratée{' '}: {fmtDelta(outlook.failure)}</p>
}

type SideProps = { team: Team; draft: Draft; dispatch: (action: DraftAction) => void; expected: number }

function BetToggle({ team, dispatch }: Pick<SideProps, 'team' | 'dispatch'>) {
  return (
    <button
      type="button"
      className={`bet-toggle bet-toggle--${team}`}
      aria-label={`Annoncer un écart pour les ${SIDE_NAME[team]}`}
      onClick={() => dispatch({ type: 'setBet', team, n: DEFAULT_BET })}
    >
      🎯 Annoncer un écart
    </button>
  )
}

/** The compact stepper « Gagner d'au moins N buts » (1..target) with its live stake and « Retirer ». */
function BetStepper({ team, n, draft, dispatch, expected }: SideProps & { n: number }) {
  const outlook = betOutlook(expected, draft.target, n)
  const set = (value: number | null) => dispatch({ type: 'setBet', team, n: value })
  return (
    <div className={`bet bet--${team}`} role="group" aria-label={`Annonce des ${SIDE_NAME[team]}`}>
      <p className="bet__wink">🎯 Couilles sur la table</p>
      <p className="bet__label">Gagner d’au moins</p>
      <div className="bet__stepper">
        <button
          type="button"
          className="bet__step"
          aria-label="Un but de moins"
          disabled={n <= 1}
          onClick={() => set(n - 1)}
        >
          −
        </button>
        <span className="bet__value" aria-live="polite">
          {goalsLabel(n)}
        </span>
        <button
          type="button"
          className="bet__step"
          aria-label="Un but de plus"
          disabled={n >= draft.target}
          onClick={() => set(n + 1)}
        >
          +
        </button>
      </div>
      <Odds outlook={outlook} />
      <Status score={draft.score} target={draft.target} team={team} n={n} outlook={outlook} />
      <button type="button" className="bet__remove" onClick={() => set(null)}>
        Retirer
      </button>
    </div>
  )
}

function BetSide(props: SideProps) {
  const n = betIn(props.draft, props.team)
  if (n === null) return <BetToggle team={props.team} dispatch={props.dispatch} />
  return <BetStepper {...props} n={n} />
}

/**
 * « Annonces d'écart » on the match sheet, one column per team (Blancs left, Noirs right, under the slots): a discreet
 * « 🎯 Annoncer un écart » toggle, then the stepper. Set before playing; any change of team resets them (draft.ts).
 */
export function BetPicker({ draft, dispatch, expectedA }: BetPickerProps) {
  return (
    <div className="bets">
      {TEAMS.map((team) => (
        <BetSide key={team} team={team} draft={draft} dispatch={dispatch} expected={expectedOf(team, expectedA)} />
      ))}
    </div>
  )
}
