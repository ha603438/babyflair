// « Qui es-tu ? » (mode partagé): shown instead of the shell right after the office code, until this phone picks a
// player profile or the read-only visitor mode. Two taps for an existing player: the name, then « C'est moi ».
import { useMemo, useState } from 'react'
import { Button } from '../components/Button'
import { InlinePlayerForm } from '../components/InlinePlayerForm'
import type { PlayerFormValue } from '../components/InlinePlayerForm'
import { sortByName } from '../stats'
import { useAppState } from '../store'
import type { Player, PlayerId } from '../types'
import { playerProfilePatch, PROFILE_COPY, VISITOR_PATCH } from './profile'

function newPlayer({ name, isGuest }: PlayerFormValue): Player {
  return { id: crypto.randomUUID(), name, isGuest, createdAt: new Date().toISOString() }
}

type ChoicesProps = { players: Player[]; selected: PlayerId | undefined; onPick: (id: PlayerId) => void }

function PlayerChoices({ players, selected, onPick }: ChoicesProps) {
  if (players.length === 0) return null
  return (
    <div className="profile-list" role="group" aria-label={PROFILE_COPY.title}>
      {players.map((player) => (
        <button
          key={player.id}
          type="button"
          className="profile-choice"
          aria-pressed={player.id === selected}
          onClick={() => onPick(player.id)}
        >
          <span className="profile-choice__name">{player.name}</span>
          {player.isGuest && <span className="chip__tag">invité</span>}
        </button>
      ))}
    </div>
  )
}

type NotListedProps = {
  open: boolean
  names: string[]
  onOpen: () => void
  onCreate: (value: PlayerFormValue) => void
  onCancel: () => void
}

function NotListed({ open, names, onOpen, onCreate, onCancel }: NotListedProps) {
  if (!open) {
    return (
      <Button variant="text" onClick={onOpen}>
        {PROFILE_COPY.notListed}
      </Button>
    )
  }
  return (
    <div className="profile-form">
      <InlinePlayerForm mode="add" existingNames={names} onSubmit={onCreate} onCancel={onCancel} hideGuestToggle />
    </div>
  )
}

export function ProfileGate() {
  const { store, dispatch, sync } = useAppState()
  const players = useMemo(() => sortByName(store.players), [store.players])
  const [picked, setPicked] = useState<PlayerId | undefined>(store.settings.myPlayerId)
  const [adding, setAdding] = useState(false)
  const selected = players.some((player) => player.id === picked) ? picked : undefined
  // Right after the office code the first fetch is still running: no « empty office » flash.
  const loading = players.length === 0 && sync.mode === 'shared' && sync.lastSyncAt === undefined

  function create(value: PlayerFormValue): void {
    const player = newPlayer(value)
    dispatch({ type: 'addPlayer', player })
    setPicked(player.id)
    setAdding(false)
  }

  function confirm(): void {
    if (selected === undefined) return
    dispatch({ type: 'setSetting', patch: playerProfilePatch(selected) })
  }

  return (
    <div className="gate profile-gate safe-top safe-bottom">
      <div className="gate-card">
        <img
          className="gate-logo profile-logo"
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt=""
          width="240"
          height="240"
        />
        <h1 className="profile-title">{PROFILE_COPY.title}</h1>
        <p className="gate-body">{PROFILE_COPY.body}</p>
        {loading && <p className="gate-body">{PROFILE_COPY.loading}</p>}
        <PlayerChoices players={players} selected={selected} onPick={setPicked} />
        {!loading && (
          <NotListed
            open={adding || players.length === 0}
            names={players.map((player) => player.name)}
            onOpen={() => setAdding(true)}
            onCreate={create}
            onCancel={() => setAdding(false)}
          />
        )}
        <Button variant="primary" disabled={selected === undefined} onClick={confirm}>
          {PROFILE_COPY.confirm}
        </Button>
        <Button variant="text" onClick={() => dispatch({ type: 'setSetting', patch: VISITOR_PATCH })}>
          {PROFILE_COPY.visit}
        </Button>
      </div>
    </div>
  )
}
