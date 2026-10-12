import { fmtDelta, plural } from '../format'

export type DeltaSize = 13 | 15 | 17 | 28

export type DeltaProps = {
  value: number
  size?: DeltaSize
  /** Rendered after the number, e.g. « · 7 j » or « sur 7 j ». */
  suffix?: string
}

function toneClass(value: number): string {
  if (value > 0) return 'pos'
  if (value < 0) return 'neg'
  return 'muted'
}

function signWord(value: number): string {
  if (value > 0) return 'plus '
  if (value < 0) return 'moins '
  return ''
}

function ariaLabel(value: number, suffix: string | undefined): string {
  const base = `${signWord(value)}${plural(Math.abs(Math.round(value)), 'point')}`
  if (!suffix) return base
  return `${base} ${suffix}`
}

/** Signed rating delta: U+2212 minus, tabular numerals, --pos / --neg / --text-3 for zero (spec §5). */
export function Delta({ value, size = 15, suffix }: DeltaProps) {
  const text = suffix ? `${fmtDelta(value)} ${suffix}` : fmtDelta(value)
  return (
    <span className={`delta delta--${size} ${toneClass(value)}`} aria-label={ariaLabel(value, suffix)}>
      {text}
    </span>
  )
}
