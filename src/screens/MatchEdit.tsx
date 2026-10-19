import { useEffect, useReducer } from 'react'
import { SegmentedControl } from '../components/SegmentedControl'
import { useWriteGuard } from '../profile/useWriteGuard'
import { teamExpectation } from '../rating'
import { useReplay } from '../rating/useReplay'
import { back, navigate } from '../router'
import { draftReducer, useAppState } from '../store'
import type { DraftAction } from '../store'
import type { Draft, Format, Match, MatchId } from '../types'
import { draftTeams, draftToMatch, isDraftChanged, matchToDraft } from './match/draftMatch'
import { PlayersStep } from './match/PlayersStep'
import { ScorePanel } from './match/ScorePanel'

const FORMAT_OPTIONS = [
  { value: '1v1', label: '1v1' },
  { value: '2v2', label: '2v2' },
] as const satisfies readonly { value: Format; label: string }[]

// The local draft plus one flag: the panel slides up only when it comes back from the players step, opening the
// screen is instant (spec §8). Kept in the reducer so no effect has to mirror the step.
type EditState = { draft: Draft; visitedPlayers: boolean }

function initialEditState(stored: Match): EditState {
  return { draft: matchToDraft(stored), visitedPlayers: false }
}

function editReducer(state: EditState, action: DraftAction): EditState {
  const draft = draftReducer(state.draft, action)
  if (draft === state.draft) return state
  return { draft, visitedPlayers: state.visitedPlayers || draft.step === 'players' }
}

/**
 * « Modifier le match » (spec §3.5): a local draft seeded from the stored match; the shared draft is never touched.
 * The announcements are edited with the same stepper, their chances taken right before this match in the replay.
 */
function MatchEditForm({ stored }: { stored: Match }) {
  const { dispatch, toast } = useAppState()
  const { result, players: playersById } = useReplay()
  const [{ draft, visitedPlayers }, draftDispatch] = useReducer(editReducer, stored, initialEditState)
  const teams = draftTeams(draft)
  const canSave = isDraftChanged(draft, stored)
  const showToast = toast.show
  const guard = useWriteGuard()

  function save() {
    if (!canSave) return
    const previous = stored
    dispatch({ type: 'updateMatch', match: draftToMatch(draft, stored, new Date().toISOString()) })
    back()
    showToast({
      text: 'Match modifié',
      action: { label: 'Annuler', onClick: () => dispatch({ type: 'updateMatch', match: previous }) },
    })
  }

  if (draft.step === 'score' && teams !== null) {
    return (
      <ScorePanel
        draft={draft}
        teams={teams}
        dispatch={draftDispatch}
        playersById={playersById}
        expectedA={teamExpectation(result, { ...teams, target: draft.target }, stored.id)}
        saveText="Enregistrer les modifications"
        canSave={canSave}
        onSave={() => guard('modifier ce match', save)}
        animate={visitedPlayers}
      />
    )
  }

  // The pushed header has no format control (spec §2), so the edit flow carries its own above the slots.
  const formatControl = (
    <div className="match-edit__format">
      <span className="match-edit__format-label">Format</span>
      <SegmentedControl
        options={FORMAT_OPTIONS}
        value={draft.format}
        onChange={(format) => draftDispatch({ type: 'setFormat', format })}
        aria-label="Format"
      />
    </div>
  )

  return (
    <PlayersStep
      draft={draft}
      dispatch={draftDispatch}
      playersById={playersById}
      byPlayer={result.byPlayer}
      formatControl={formatControl}
    />
  )
}

export function MatchEdit({ id }: { id: MatchId }) {
  const { store } = useAppState()
  const stored = store.matches.find((match) => match.id === id)

  // Unknown id (spec §3.4 / §3.5): back to the history list.
  useEffect(() => {
    if (stored === undefined) navigate({ name: 'historique' })
  }, [stored])

  if (stored === undefined) return null
  return <MatchEditForm key={stored.id} stored={stored} />
}
