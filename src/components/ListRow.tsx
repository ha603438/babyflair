import type { MouseEventHandler, ReactNode } from 'react'
import { ChevronRight } from './icons'

export type ListRowProps = {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  trailingSub?: ReactNode
  chevron?: boolean
  onClick?: MouseEventHandler<HTMLElement>
  /** Renders the row as <a href>; takes precedence over onClick for the element type. */
  href?: string
  minHeight?: number
  /** Variant classes added by the wrappers (row--rank, row--history…). */
  className?: string
  'aria-label'?: string
}

function rowClasses(className: string | undefined, tappable: boolean): string {
  const classes = ['row', 'row-divider']
  if (tappable) classes.push('row--tap')
  if (className) classes.push(className)
  return classes.join(' ')
}

function RowContent({ leading, title, subtitle, trailing, trailingSub, chevron }: ListRowProps) {
  const hasTrailing = trailing !== undefined || trailingSub !== undefined
  return (
    <>
      {leading !== undefined && <div className="row-leading">{leading}</div>}
      <div className="row-body">
        <div className="row-title">{title}</div>
        {subtitle !== undefined && <div className="row-sub">{subtitle}</div>}
      </div>
      {hasTrailing && (
        <div className="row-trailing">
          {trailing !== undefined && <div className="row-trailing-main">{trailing}</div>}
          {trailingSub !== undefined && <div className="row-trailing-sub">{trailingSub}</div>}
        </div>
      )}
      {chevron && <ChevronRight size={16} className="row-chevron" />}
    </>
  )
}

/**
 * Generic row shell (spec §5): min 56 px, padding 12 16, divider inset 16, pressed --surface-2.
 * <a> when `href` is given, <button> when only `onClick`, <div> otherwise.
 */
export function ListRow(props: ListRowProps) {
  const { href, onClick, minHeight, className, 'aria-label': ariaLabel } = props
  const classes = rowClasses(className, Boolean(href || onClick))
  const style = minHeight === undefined ? undefined : { minHeight }
  if (href) {
    return (
      <a className={classes} href={href} onClick={onClick} style={style} aria-label={ariaLabel}>
        <RowContent {...props} />
      </a>
    )
  }
  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} style={style} aria-label={ariaLabel}>
        <RowContent {...props} />
      </button>
    )
  }
  return (
    <div className={classes} style={style} aria-label={ariaLabel}>
      <RowContent {...props} />
    </div>
  )
}
