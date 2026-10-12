import type { ReactNode } from 'react'

export type CardProps = {
  children: ReactNode
  /** Padding in px; 16 by default. */
  padding?: number
  className?: string
}

/** --surface panel, radius 16, --shadow-1 in light / 1 px --border in dark (base.css .card) (spec §5). */
export function Card({ children, padding, className }: CardProps) {
  const classes = ['card']
  if (padding === undefined) classes.push('card-pad')
  if (className) classes.push(className)
  const style = padding === undefined ? undefined : { padding }
  return (
    <div className={classes.join(' ')} style={style}>
      {children}
    </div>
  )
}
