import { useId, useState } from 'react'
import { Button } from '../components/Button'
import { useDialog } from '../components/useDialog'
import type { Player, PlayerId } from '../types'
import { CALL_COPY } from './calls'
import { PlayerPicker } from './PlayerPicker'

export type ProposeDialogProps = {
  open: boolean
  players: Player[]
  /** Pre-selected name (settings.myPlayerId). */
  initial: PlayerId | undefined
  busy: boolean
  onSend: (playerId: PlayerId) => void
  onCancel: () => void
}

/** « Proposer un baby » → « Qui es-tu ? » → « Envoyer la notification ». */
export function ProposeDialog({ open, players, initial, busy, onSend, onCancel }: ProposeDialogProps) {
  const { ref, onClose, onClick } = useDialog(open, onCancel)
  const titleId = useId()
  const [picked, setPicked] = useState<PlayerId | undefined>(initial)
  const value = players.some((player) => player.id === picked) ? picked : undefined

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose} onClick={onClick}>
      <div className="dialog-body">
        <h2 id={titleId} className="dialog-title">
          {CALL_COPY.whoAreYou}
        </h2>
        <div className="dialog-text call-dialog__picker">
          <PlayerPicker players={players} value={value} onChange={setPicked} />
        </div>
        <div className="dialog-actions">
          <Button variant="secondary" size="md" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={value === undefined || busy}
            onClick={() => {
              if (value !== undefined) onSend(value)
            }}
          >
            {CALL_COPY.send}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
