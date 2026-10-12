import type { ReactNode } from 'react'
import { back } from '../router'
import { IconButton } from './Button'
import { ChevronLeft } from './icons'

export type HeaderProps = {
  title: string
  /** Pushed screen: 44 × 44 back chevron on the left (aria-label « Retour », history.back()), title centred. */
  back?: boolean
  /** At most one 44 × 44 icon button (tab roots) or the format segmented control (compact). */
  right?: ReactNode
  /** Match screen: « BabyFlair » 15 px / 600 in --text-2 on the left, `right` on the right (spec §2). */
  compact?: boolean
}

function headerClass(isBack: boolean, compact: boolean): string {
  if (compact) return 'header header-compact'
  if (isBack) return 'header header-pushed'
  return 'header header-root'
}

export function Header({ title, back: isBack = false, right, compact = false }: HeaderProps) {
  return (
    <header className={headerClass(isBack, compact)}>
      <div className="header-inner">
        {isBack && (
          <IconButton label="Retour" onClick={() => back()} className="header-back">
            <ChevronLeft />
          </IconButton>
        )}
        {compact ? (
          <span className="header-brand">
            <img className="header-brand-mark" src={`${import.meta.env.BASE_URL}logo-mark.png`} alt="" width="26" height="26" />
            {title}
          </span>
        ) : (
          <h1 className="header-title">
            {!isBack && (
              <img className="header-brand-mark" src={`${import.meta.env.BASE_URL}logo-mark.png`} alt="" width="28" height="28" />
            )}
            {title}
          </h1>
        )}
        <div className="header-right">{right}</div>
      </div>
    </header>
  )
}
