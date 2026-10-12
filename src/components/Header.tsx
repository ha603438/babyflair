import type { ReactNode } from 'react'
import { back } from '../router'
import { IconButton } from './Button'
import { ChevronLeft } from './icons'

export type HeaderProps = {
  title: string
  /** Pushed screen: 44 × 44 back chevron on the left (aria-label « Retour », history.back()), title centred. */
  back?: boolean
  /** At most one 44 × 44 icon button, or the format segmented control on the Match screen. */
  right?: ReactNode
  /** Kept for compatibility: tab roots all render the brand header now. */
  compact?: boolean
  /** Double-tap on the brand (every tab root): forces an app update. */
  onBrandDoubleTap?: () => void
  /** Tab roots only: a full-width row under the title (the Match screen puts its 1v1 | 2v2 control there). */
  below?: ReactNode
  /** Tab roots only: a compact action on the left (the « ＋ Match » shortcut). */
  left?: ReactNode
}

/** « BabyFlair » with the B in blue and the R in red, like the logo. */
function Wordmark() {
  return (
    <span className="header-wordmark" aria-label="BabyFlair">
      <span className="header-wordmark-b">B</span>abyFlai<span className="header-wordmark-r">R</span>
    </span>
  )
}

function PushedHeader({ title, right }: Pick<HeaderProps, 'title' | 'right'>) {
  return (
    <header className="header header-pushed">
      <div className="header-inner">
        <IconButton label="Retour" onClick={() => back()} className="header-back">
          <ChevronLeft />
        </IconButton>
        <h1 className="header-title">{title}</h1>
        <div className="header-right">{right}</div>
      </div>
    </header>
  )
}

/** Tab roots: the brand (mark + wordmark) centred on top, the screen title under it, the right slot on the side. */
export function Header({ title, back: isBack = false, right, onBrandDoubleTap, below, left }: HeaderProps) {
  if (isBack) return <PushedHeader title={title} right={right} />
  return (
    <header className="header header-root">
      <div className="header-inner header-inner--brand">
        <div className="header-brandline" onDoubleClick={onBrandDoubleTap}>
          <img className="header-brand-mark" src={`${import.meta.env.BASE_URL}logo-mark.png`} alt="" width="40" height="40" />
          <Wordmark />
        </div>
        <h1 className="header-title">{title}</h1>
        {left && <div className="header-left">{left}</div>}
        <div className="header-right">{right}</div>
        {below && <div className="header-below">{below}</div>}
      </div>
    </header>
  )
}
