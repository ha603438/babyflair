import { useId } from 'react'
import { Button } from '../components/Button'
import { useDialog } from '../components/useDialog'
import { CALL_COPY } from './calls'

export type ProposeDialogProps = {
  open: boolean
  busy: boolean
  onSend: () => void
  onCancel: () => void
}

/** « Proposer un baby » → « Envoyer la notification à tout le monde ? »; the organizer is this phone's profile. */
export function ProposeDialog({ open, busy, onSend, onCancel }: ProposeDialogProps) {
  const { ref, onClose, onClick } = useDialog(open, onCancel)
  const titleId = useId()

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose} onClick={onClick}>
      <div className="dialog-body">
        <h2 id={titleId} className="dialog-title">
          {CALL_COPY.confirmSend}
        </h2>
        <div className="dialog-actions">
          <Button variant="secondary" size="md" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="primary" size="md" disabled={busy} onClick={onSend}>
            {CALL_COPY.send}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
