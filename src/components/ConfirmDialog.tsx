import { useId } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { useDialog } from './useDialog'

export type ConfirmDialogProps = {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Destructive confirm: --neg background + white text, still on the right (spec §10). */
  danger?: boolean
  onConfirm: () => void
  /** Also fired by Escape and by a tap on the backdrop. */
  onCancel: () => void
  /** One [OK] button (confirmLabel) wired to onConfirm; used for « Fichier invalide ». */
  single?: boolean
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Annuler',
  danger = false,
  onConfirm,
  onCancel,
  single = false,
}: ConfirmDialogProps) {
  const { ref, onClose, onClick } = useDialog(open, onCancel)
  const titleId = useId()
  const bodyId = useId()

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onClose={onClose}
      onClick={onClick}
    >
      <div className="dialog-body">
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        <div id={bodyId} className="dialog-text">
          {body}
        </div>
        <div className={single ? 'dialog-actions dialog-actions-single' : 'dialog-actions'}>
          {!single && (
            <Button variant="secondary" size="md" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          <Button variant="primary" size="md" danger={danger} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
