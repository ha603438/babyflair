import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AddChip } from '../../components/AddChip'
import { Button } from '../../components/Button'
import { Chip } from '../../components/Chip'
import { InlinePlayerForm } from '../../components/InlinePlayerForm'
import type { PlayerFormValue } from '../../components/InlinePlayerForm'
import { chipOrder } from '../../stats'
import { draftReducer, isDraftComplete, useAppState } from '../../store'
import type { DraftAction } from '../../store'
import type { Draft, Player, PlayerId, PlayerStats } from '../../types'
import { chipStateOf, draftTeams, entryCaption } from './draftMatch'
import { RosterSlots } from './RosterSlots'
import { useShake } from './useShake'

export type PlayersStepProps = {
  draft: Draft
  dispatch: (action: DraftAction) => void
  playersById: Map<PlayerId, Player>
  byPlayer: Map<PlayerId, PlayerStats>
  /** Edit screen only: its local [1v1 | 2v2] control (the new-match flow has it in the shell header). */
  formatControl?: ReactNode
}

/**
 * Step A (spec §4): slot block, helper caption, inline « + Nouveau joueur » form under the slots, bottom-anchored
 * chip grid. Works on the shared draft (Match) or on a local one (MatchEdit): the reducer and dispatch are injected.
 */
export function PlayersStep({ draft, dispatch, playersById, byPlayer, formatControl }: PlayersStepProps) {
  const { store, dispatch: storeDispatch } = useAppState()
  const { shaking, shake } = useShake()
  const [adding, setAdding] = useState(false)
  const ordered = useMemo(() => chipOrder(store.players, byPlayer), [store.players, byPlayer])
  const existingNames = useMemo(() => store.players.map((player) => player.name), [store.players])
  const complete = isDraftComplete(draft)

  function onChipTap(playerId: PlayerId) {
    const action: DraftAction = { type: 'pick', playerId }
    // Every slot full and none active: the reducer hands the same draft back, so the only feedback is the shake.
    if (Object.is(draftReducer(draft, action), draft)) {
      shake()
      return
    }
    dispatch(action)
  }

  function onAddPlayer(value: PlayerFormValue) {
    const id = crypto.randomUUID()
    const player: Player = { id, name: value.name, isGuest: value.isGuest, createdAt: new Date().toISOString() }
    storeDispatch({ type: 'addPlayer', player })
    dispatch({ type: 'pick', playerId: id })
    setAdding(false)
  }

  // Back from « Modifier » with the roster still complete: re-open the score step without touching the slots.
  function onContinue() {
    const teams = draftTeams(draft)
    if (teams === null) return
    dispatch({ type: 'prefill', teamA: teams.teamA, teamB: teams.teamB, target: draft.target })
  }

  return (
    <div className="match-screen match-screen--players">
      <div className="content match-top">
        {formatControl}
        <RosterSlots draft={draft} dispatch={dispatch} playersById={playersById} shaking={shaking} />
        <div className="match-caption">
          <p className="match-caption__text">{entryCaption(draft, store.players.length)}</p>
          {complete && (
            <Button variant="text" inline onClick={onContinue}>
              Continuer
            </Button>
          )}
        </div>
        {adding && (
          <div className="match-form">
            <InlinePlayerForm
              mode="add"
              existingNames={existingNames}
              onSubmit={onAddPlayer}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}
      </div>
      <div className="match-chips">
        <div className="content match-chips__inner">
          <div className="entry-chips">
            {ordered.map((player) => (
              <Chip
                key={player.id}
                player={player}
                state={chipStateOf(draft, player.id)}
                inactive={byPlayer.get(player.id)?.status === 'inactive'}
                onClick={() => onChipTap(player.id)}
              />
            ))}
            <AddChip onClick={() => setAdding(true)} />
          </div>
        </div>
      </div>
    </div>
  )
}
