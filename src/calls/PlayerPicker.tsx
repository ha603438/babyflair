import { Chip } from '../components/Chip'
import type { Player, PlayerId } from '../types'

export type PlayerPickerProps = {
  players: Player[]
  value: PlayerId | undefined
  /** Ids that cannot be picked (already in the call); rendered pressed and disabled. */
  taken?: ReadonlySet<PlayerId>
  onChange: (id: PlayerId) => void
}

/** « Qui es-tu ? »: the office's players as chips, one selected (badge « 1 »). Shared by both call dialogs. */
export function PlayerPicker({ players, value, taken, onChange }: PlayerPickerProps) {
  return (
    <div className="entry-chips call-picker" role="group" aria-label="Qui es-tu ?">
      {players.map((player) => {
        const isTaken = taken?.has(player.id) === true
        const selected = player.id === value && !isTaken
        return (
          <Chip
            key={player.id}
            player={player}
            state={selected || isTaken ? 'team1' : 'default'}
            disabled={isTaken}
            onClick={() => onChange(player.id)}
          />
        )
      })}
    </div>
  )
}
