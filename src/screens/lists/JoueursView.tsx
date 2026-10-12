import { useCallback, useRef, useState } from 'react'
import { InlinePlayerForm } from '../../components/InlinePlayerForm'
import type { PlayerFormValue } from '../../components/InlinePlayerForm'
import { PlayerRow } from '../../components/rows'
import { hrefOf } from '../../router'
import { sortByName } from '../../stats'
import type { Player } from '../../types'
import type { ReplayData, ScreenContext } from './context'
import { playerCountText } from './labels'
import { useOutsideTap } from './useOutsideTap'

// Joueurs screen body (spec §3.6): sub-count, the « + Ajouter un joueur » row expanding into the inline form at the
// top (bulk adds keep it open), and the alphabetical PlayerRow list.

export type JoueursViewProps = { app: ScreenContext; replay: ReplayData; add: boolean }

const EMPTY_TEXT = "Aucun joueur pour l'instant. Il en faut au moins 2 pour un match."

function newPlayer({ name, isGuest }: PlayerFormValue): Player {
  return { id: crypto.randomUUID(), name, isGuest, createdAt: new Date().toISOString() }
}

function formTitle(playerCount: number): string | undefined {
  if (playerCount === 0) return 'Ajoute tes collègues'
  return undefined
}

function SubCount({ players }: { players: Player[] }) {
  if (players.length === 0) return null
  return <p className="sub-count">{playerCountText(players)}</p>
}

type AddAreaProps = {
  open: boolean
  players: Player[]
  onOpen: () => void
  onSubmit: (value: PlayerFormValue) => void
  onCancel: () => void
}

function AddArea({ open, players, onOpen, onSubmit, onCancel }: AddAreaProps) {
  if (!open) {
    return (
      <button type="button" className="add-row" onClick={onOpen}>
        + Ajouter un joueur
      </button>
    )
  }
  return (
    <InlinePlayerForm
      mode="add"
      keepOpenAfterAdd
      existingNames={players.map((player) => player.name)}
      onSubmit={onSubmit}
      onCancel={onCancel}
      title={formTitle(players.length)}
    />
  )
}

function PlayerList({ players, replay }: { players: Player[]; replay: ReplayData }) {
  if (players.length === 0) return <p className="content lists-empty">{EMPTY_TEXT}</p>
  return (
    <div className="rows">
      {sortByName(players).map((player) => (
        <PlayerRow
          key={player.id}
          player={player}
          stats={replay.result.byPlayer.get(player.id)}
          now={replay.now}
          href={hrefOf({ name: 'joueur', id: player.id })}
        />
      ))}
    </div>
  )
}

export function JoueursView({ app, replay, add }: JoueursViewProps) {
  const { store, dispatch, toast } = app
  const { players } = store
  // `add` only changes with the hash; the shell keys this view by it, so a change remounts and re-reads it here.
  const [formOpen, setFormOpen] = useState(add || players.length === 0)
  const formRef = useRef<HTMLDivElement>(null)
  const open = useCallback(() => setFormOpen(true), [])
  const close = useCallback(() => setFormOpen(false), [])
  useOutsideTap(formRef, formOpen, close)

  const handleAdd = (value: PlayerFormValue): void => {
    dispatch({ type: 'addPlayer', player: newPlayer(value) })
    toast.show({ text: `Joueur ajouté : ${value.name}` })
  }

  return (
    <div className="lists-screen joueurs">
      <SubCount players={players} />
      <div ref={formRef} className="content">
        <AddArea open={formOpen} players={players} onOpen={open} onSubmit={handleAdd} onCancel={close} />
      </div>
      <PlayerList players={players} replay={replay} />
    </div>
  )
}
