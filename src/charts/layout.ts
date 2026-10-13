import type { Domain } from './curves'

// Pixel geometry of the rating chart (src/charts/RatingChart.tsx): frame, scales, end-label and tick placement,
// tooltip side. The chart draws in real pixels (viewBox = 0 0 width height) so text never stretches.

export const CHART_HEIGHT = 260
/** Content width of a 375 px phone; used until the ResizeObserver reports the real width. */
export const FALLBACK_WIDTH = 343
export const MARGIN = { left: 40, right: 64, top: 12, bottom: 28 }
/** End labels are nudged apart by at least this much. */
export const LABEL_GAP = 14
/** From the last match's x to the start of an end label (the leader tick sits in between). */
export const LABEL_OFFSET = 22
/** Space between the name and the rating in an end label. */
export const LABEL_SPACE = 4
export const LABEL_FONT = 12
export const TICK_FONT = 11
/** The label column may grow past 64 px for long names, up to this share of the chart width. */
const MAX_RIGHT_RATIO = 0.38
const ELLIPSIS = '…'

export type Frame = { left: number; top: number; width: number; height: number; x: Domain; y: Domain }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function makeFrame(width: number, right: number, x: Domain, y: Domain): Frame {
  const plotWidth = Math.max(1, width - MARGIN.left - right)
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom
  return { left: MARGIN.left, top: MARGIN.top, width: plotWidth, height: plotHeight, x, y }
}

export function xPx(frame: Frame, x: number): number {
  const span = frame.x.max - frame.x.min
  return frame.left + ((x - frame.x.min) / span) * frame.width
}

export function yPx(frame: Frame, y: number): number {
  const span = frame.y.max - frame.y.min
  return frame.top + (1 - (y - frame.y.min) / span) * frame.height
}

/** Crosshair snap: the match index nearest to a pixel column, clamped to 1..count. */
export function indexAtPx(frame: Frame, px: number, count: number): number {
  const span = frame.x.max - frame.x.min
  const x = frame.x.min + ((px - frame.left) / frame.width) * span
  return clamp(Math.round(x), 1, Math.max(1, count))
}

// ---------------------------------------------------------------------------
// Text measurement (estimate: SVG text cannot be measured during the server render or the tests)
// ---------------------------------------------------------------------------

const NARROW = new Set([' ', '\u00a0', '\u202f', '.', ',', ':', ';', "'", '’', 'i', 'l', 'j', 'I', '|', '!'])
const WIDE = new Set(['m', 'w', 'M', 'W'])

function charEm(char: string): number {
  if (NARROW.has(char)) return 0.3
  if (WIDE.has(char)) return 0.85
  if (char === char.toUpperCase() && char !== char.toLowerCase()) return 0.68
  return 0.58
}

export function textWidth(text: string, fontSize: number): number {
  let em = 0
  for (const char of text) em += charEm(char)
  return em * fontSize
}

export function endLabelWidth(name: string, rating: string): number {
  return textWidth(name, LABEL_FONT) + LABEL_SPACE + textWidth(rating, LABEL_FONT)
}

/** Right margin wide enough for the widest « name rating » end label, between 64 px and 38 % of the chart. */
export function rightMargin(labels: Array<{ name: string; rating: string }>, width: number): number {
  const widest = Math.max(0, ...labels.map((label) => endLabelWidth(label.name, label.rating)))
  const wanted = Math.ceil(widest + LABEL_OFFSET + 4)
  return clamp(wanted, MARGIN.right, Math.max(MARGIN.right, Math.round(width * MAX_RIGHT_RATIO)))
}

/** Cuts the name (code points, with « … ») until « name rating » fits `maxWidth`. */
export function fitName(name: string, rating: string, maxWidth: number): string {
  if (endLabelWidth(name, rating) <= maxWidth) return name
  const chars = Array.from(name)
  for (let keep = chars.length - 1; keep > 0; keep -= 1) {
    const cut = `${chars.slice(0, keep).join('').trimEnd()}${ELLIPSIS}`
    if (endLabelWidth(cut, rating) <= maxWidth) return cut
  }
  return `${chars[0] ?? ''}${ELLIPSIS}`
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * Vertical de-collision of the end labels: keeps their order, pushes them apart by `gap` and inside [min, max].
 * Returns the label centres in the order of `targets`.
 */
export function spreadLabels(targets: number[], gap: number, min: number, max: number): number[] {
  const items = targets.map((y, i) => ({ y: clamp(y, min, max), i })).sort((a, b) => a.y - b.y || a.i - b.i)
  for (let k = 1; k < items.length; k += 1) items[k].y = Math.max(items[k].y, items[k - 1].y + gap)
  const last = items.length - 1
  if (last >= 0 && items[last].y > max) {
    items[last].y = max
    for (let k = last - 1; k >= 0; k -= 1) items[k].y = Math.min(items[k].y, items[k + 1].y - gap)
  }
  const out = new Array<number>(targets.length)
  for (const item of items) out[item.i] = item.y
  return out
}

export type TickInput = { index: number; label: string; at: number }
export type PlacedTick = TickInput & { center: number }

/**
 * X day labels, left to right: each label is centred on its tick but kept inside [lo, hi]; a label that would
 * overlap the previous kept one (or not fit at all) is dropped.
 */
export function placeTicks(ticks: TickInput[], lo: number, hi: number, gap: number): PlacedTick[] {
  const placed: PlacedTick[] = []
  let previousRight = -Infinity
  for (const tick of ticks) {
    const half = textWidth(tick.label, TICK_FONT) / 2
    const center = clamp(tick.at, lo + half, hi - half)
    if (center - half < previousRight + gap || hi - lo < 2 * half) continue
    placed.push({ ...tick, center })
    previousRight = center + half
  }
  return placed
}

/** Tooltip on the right of the crosshair, flipped to its left when it would overflow, never past the left edge. */
export function tooltipLeft(anchor: number, tipWidth: number, chartWidth: number, gap = 12): number {
  const right = anchor + gap
  if (right + tipWidth <= chartWidth) return right
  return Math.max(0, anchor - gap - tipWidth)
}

/**
 * Keyboard crosshair: ←/→ move by one match (starting from the latest), Home/End jump, Escape hides it.
 * Returns undefined for any other key (left to the browser).
 */
export function stepIndex(key: string, current: number | null, count: number): number | null | undefined {
  if (key === 'Escape') return null
  if (key === 'Home') return 1
  if (key === 'End') return count
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return undefined
  if (current === null) return count
  if (key === 'ArrowLeft') return Math.max(1, current - 1)
  return Math.min(count, current + 1)
}
