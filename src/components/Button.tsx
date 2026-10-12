import type { MouseEventHandler, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'text'
export type ButtonSize = 'lg' | 'md'

export type ButtonProps = {
  variant: ButtonVariant
  danger?: boolean
  /** 56 px ('lg') or 48 px ('md'). Defaults: primary → 'lg', secondary → 'md', text → 44 px min-height. */
  size?: ButtonSize
  disabled?: boolean
  onClick?: MouseEventHandler<HTMLButtonElement>
  children: ReactNode
  'aria-label'?: string
  /** Defaults to 'button' so a Button inside a form never submits by accident. */
  type?: 'button' | 'submit'
  /** Full width is the default (spec §5); `inline` lets action rows and roster bars size to content. */
  inline?: boolean
  autoFocus?: boolean
  className?: string
}

function sizeClass(variant: ButtonVariant, size: ButtonSize | undefined): string {
  if (size) return `btn-${size}`
  if (variant === 'primary') return 'btn-lg'
  if (variant === 'secondary') return 'btn-md'
  return ''
}

export function Button({
  variant,
  danger = false,
  size,
  disabled = false,
  onClick,
  children,
  type = 'button',
  inline = false,
  autoFocus,
  className,
  'aria-label': ariaLabel,
}: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, sizeClass(variant, size)]
  if (danger) classes.push('btn-danger')
  if (inline) classes.push('btn-inline')
  if (className) classes.push(className)

  return (
    <button
      type={type}
      className={classes.filter(Boolean).join(' ')}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
    >
      {children}
    </button>
  )
}

export type IconButtonProps = {
  /** Accessible name (« Retour », « Réglages », « Renommer »…); the icon itself is decorative. */
  label: string
  children: ReactNode
  onClick?: MouseEventHandler<HTMLElement>
  /** Renders an <a> instead of a <button> (e.g. the « ? » that opens « Comment ça marche »). */
  href?: string
  className?: string
}

/** 44 × 44 icon-only tap target used in headers (spec §2) and slots. */
export function IconButton({ label, children, onClick, href, className }: IconButtonProps) {
  const cls = className ? `icon-btn ${className}` : 'icon-btn'
  if (href) {
    return (
      <a className={cls} href={href} aria-label={label} onClick={onClick}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" className={cls} aria-label={label} onClick={onClick}>
      {children}
    </button>
  )
}
