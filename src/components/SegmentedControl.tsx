import type { KeyboardEvent } from 'react'

export type SegmentedOption<T extends string> = { value: T; label: string }

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  'aria-label': string
}

function nextIndex(key: string, current: number, count: number): number | null {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

/** Generic pill switch (1v1 | 2v2, En 5 | En 10). Radio-group semantics with roving focus and arrow keys. */
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  const { options, value, onChange, 'aria-label': ariaLabel } = props

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = options.findIndex((option) => option.value === value)
    const target = nextIndex(event.key, Math.max(current, 0), options.length)
    if (target === null) return
    event.preventDefault()
    const option = options[target]
    if (option === undefined) return
    onChange(option.value)
    const radios = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    radios[target]?.focus()
  }

  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {options.map((option) => {
        const checked = option.value === value
        const className = checked ? 'segmented__option is-active' : 'segmented__option'
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={className}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
