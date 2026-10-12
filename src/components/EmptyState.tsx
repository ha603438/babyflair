import type { ReactNode } from 'react'
import { Button } from './Button'

export type EmptyStateAction = {
  label: string
  onClick: () => void
  disabled?: boolean
  /** Shown under the button, e.g. « Il faut au moins 2 joueurs » when it is disabled. */
  caption?: string
}

export type EmptyStateProps = {
  icon?: ReactNode
  title: string
  body: string
  action?: EmptyStateAction
  /** Smaller top margin when the state sits above other content (0-match Classement). */
  compact?: boolean
}

function emptyClass(compact: boolean): string {
  if (compact) return 'empty empty--compact'
  return 'empty'
}

/** Centred title / body / single primary button (spec §5). */
export function EmptyState({ icon, title, body, action, compact = false }: EmptyStateProps) {
  return (
    <section className={emptyClass(compact)}>
      {icon !== undefined && (
        <div className="empty-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="empty-title">{title}</h2>
      <p className="empty-body">{body}</p>
      {action && (
        <div className="empty-action">
          <Button variant="primary" size="lg" disabled={action.disabled} onClick={action.onClick}>
            {action.label}
          </Button>
          {action.caption && <p className="empty-caption">{action.caption}</p>}
        </div>
      )}
    </section>
  )
}
