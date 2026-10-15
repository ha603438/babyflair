import type { Target } from './types'

// French formatting helpers (spec §7). Intl fr-FR already gives comma decimals and narrow no-break
// space grouping, but it emits a hyphen-minus for negatives and a plain no-break space before « % »,
// so signs and the percent sign are assembled by hand.

const MINUS = '−'
const NARROW_NBSP = ' '
const EN_DASH = '–'
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const intFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const multiplierFormat = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const dayWithYearFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const shortDateFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const relativeFormat = new Intl.RelativeTimeFormat('fr', { numeric: 'auto', style: 'short' })

function withTrueMinus(text: string): string {
  return text.replace(/^-/, MINUS)
}

function toDate(iso: string): Date | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

// Math.round absorbs DST days of 23 or 25 hours.
function calendarDaysBetween(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
}

export function fmtInt(n: number): string {
  // `+ 0` turns -0 (from Math.round of a small negative) into 0 so it never prints as « −0 ».
  const rounded = Math.round(n) + 0
  return withTrueMinus(intFormat.format(rounded))
}

export function fmtDelta(n: number): string {
  const rounded = Math.round(n)
  if (rounded === 0) return '±0'
  if (rounded > 0) return `+${fmtInt(rounded)}`
  return `${MINUS}${fmtInt(-rounded)}`
}

export function fmtPercent(p: number): string {
  return `${fmtInt(p * 100)}${NARROW_NBSP}%`
}

export function fmtMultiplier(x: number): string {
  return `×${withTrueMinus(multiplierFormat.format(x))}`
}

export function fmtOrdinal(n: number): string {
  if (n === 1) return '1er'
  return `${fmtInt(n)}e`
}

export function fmtTime(iso: string): string {
  const date = toDate(iso)
  if (date === null) return ''
  return timeFormat.format(date)
}

export function fmtRelative(iso: string, now: Date): string {
  const date = toDate(iso)
  if (date === null) return ''
  const elapsed = Math.max(0, now.getTime() - date.getTime())
  if (elapsed < MINUTE_MS) return "à l'instant"
  if (elapsed < HOUR_MS) return relativeFormat.format(-Math.floor(elapsed / MINUTE_MS), 'minute')
  if (elapsed < DAY_MS) return relativeFormat.format(-Math.floor(elapsed / HOUR_MS), 'hour')
  return relativeFormat.format(-Math.floor(elapsed / DAY_MS), 'day')
}

export function fmtDayHeader(iso: string, now: Date): string {
  const date = toDate(iso)
  if (date === null) return ''
  const days = calendarDaysBetween(date, now)
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  if (date.getFullYear() === now.getFullYear()) return dayFormat.format(date)
  return dayWithYearFormat.format(date)
}

/** « lun. 5 oct. · 12:42 · en 10 », or « lun. 5 oct. · en 10 » without the time of day (profile/times.ts). */
export function fmtDateLine(iso: string, target: Target, withTime: boolean): string {
  const date = toDate(iso)
  if (date === null) return ''
  if (!withTime) return `${shortDateFormat.format(date)} · en ${target}`
  return `${shortDateFormat.format(date)} · ${timeFormat.format(date)} · en ${target}`
}

export function fmtScore(a: number, b: number): string {
  return `${fmtInt(a)} ${EN_DASH} ${fmtInt(b)}`
}

export function daysSince(iso: string, now: Date): number {
  const date = toDate(iso)
  if (date === null) return 0
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS))
}

export function plural(n: number, singular: string, pluralForm?: string): string {
  const rounded = Math.round(n)
  const count = fmtInt(rounded)
  // French keeps the singular for 0 and 1 (« 0 joueur sur 4 »).
  if (Math.abs(rounded) < 2) return `${count} ${singular}`
  return `${count} ${pluralForm ?? `${singular}s`}`
}
