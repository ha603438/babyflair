import type { ToastInput } from '../store'

export type ToastProps = {
  toast: (ToastInput & { id: number }) | null
  onDismiss: () => void
}

/**
 * Pure presentation: the provider owns the queue, the TTL timer and the pending undo. The live region is always
 * mounted (empty when there is no toast) so assistive tech announces new toasts; the `key` on the inner element
 * restarts the slide-in for each new toast id.
 */
export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div key={toast.id} className="toast">
          <span className="toast-text">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                // Dismiss first: an undo action may show its own toast synchronously and must not be wiped by this one.
                onDismiss()
                toast.action?.onClick()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
