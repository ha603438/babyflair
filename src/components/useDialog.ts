import { useCallback, useEffect, useRef } from 'react'
import type { MouseEvent, RefObject } from 'react'

export type DialogHandlers = {
  ref: RefObject<HTMLDialogElement | null>
  /** `onClose` of the <dialog>: fires `onCancel` only when the browser closed it (Escape), not when the prop did. */
  onClose: () => void
  /** `onClick` of the <dialog>: a click whose target is the box itself landed on the backdrop. */
  onClick: (event: MouseEvent<HTMLDialogElement>) => void
}

/** Native <dialog> driven by an `open` prop (showModal / close), shared by ConfirmDialog and the call dialogs. */
export function useDialog(open: boolean, onCancel: () => void): DialogHandlers {
  const ref = useRef<HTMLDialogElement>(null)
  const wantedOpen = useRef(open)

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

  const onClose = useCallback(() => {
    if (wantedOpen.current) onCancel()
  }, [onCancel])

  const onClick = useCallback(
    (event: MouseEvent<HTMLDialogElement>) => {
      if (event.target === ref.current) onCancel()
    },
    [onCancel],
  )

  return { ref, onClose, onClick }
}
