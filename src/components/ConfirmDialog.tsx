import { useEffect, useId, useRef } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { Button } from './Button'

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
  const ref = useRef<HTMLDialogElement>(null)
  // Mirrors the prop so the native `close` event can tell "closed by the browser" (Escape) from "closed by us".
  const wantedOpen = useRef(open)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    wantedOpen.current = open
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
      return
    }
    if (!open && el.open) el.close()
  }, [open])

  const handleClose = () => {
    if (wantedOpen.current) onCancel()
  }

  // The dialog box is the event target only when the click lands outside `.dialog-body` (i.e. on the backdrop).
  const handleClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) onCancel()
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onClose={handleClose}
      onClick={handleClick}
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
