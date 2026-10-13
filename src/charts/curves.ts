import type { HistoryPoint, Match, MatchId, PlayerId, PlayerStats, Ranking } from '../types'

// Courbes du classement: pure data for the rating chart (series, domains, day ticks, tooltip values) and the colour
// slots. X is the global match number in replay order (1..N), Y the rating. No React, no DOM: unit-tested in node.

export const START_RATING = 1000
/** Categorical slots --series-1..--series-8: never more curves than colours. */
export const MAX_CURVES = 8
const DEFAULT_COUNT = 3
/** Y domain: rounded to tens, at least this tall so a flat start does not fill the plot with noise. */
const Y_STEP = 10
const MIN_Y_SPAN = 40
const Y_PAD_MIN = 5
const Y_PAD_RATIO = 0.05
const MAX_Y_TICKS = 5
// Every step divides 1000, so the 1000 baseline is always one of the gridlines.
const Y_TICK_STEPS = [10, 20, 25, 50, 100, 200, 250, 500, 1000]

export type ChartMatch = { id: MatchId; index: number; playedAt: string }
/** `delta` is null on the start point (before the player's first match). */
export type CurvePoint = { x: number; rating: number; delta: number | null }
export type Series = { playerId: PlayerId; points: CurvePoint[] }
export type ChartData = { matches: ChartMatch[]; series: Map<PlayerId, Series> }
export type Domain = { min: number; max: number }
export type DayTick = { index: number; label: string }
/** Visible players and their colour slot (1..MAX_CURVES). The colour follows the player, never its rank. */
export type Slots = ReadonlyMap<PlayerId, number>
export type SeriesSummary = { current: number; high: number; low: number; played: number }

// ---------------------------------------------------------------------------
// Match order and series
// ---------------------------------------------------------------------------

type OrderKey = { id: MatchId; time: number; seq: number; playedAt: string }

function keyOf(point: HistoryPoint, matches: ReadonlyMap<MatchId, Match>): OrderKey {
  const match = matches.get(point.matchId)
  if (match === undefined) {
    const { matchId: id, playedAt } = point
    return { id, time: Date.parse(playedAt), seq: Number.MAX_SAFE_INTEGER, playedAt }
  }
  return { id: match.id, time: Date.parse(match.playedAt), seq: match.seq, playedAt: match.playedAt }
}

// Same order as the engine replay: playedAt, then seq, then id.
function compareKeys(a: OrderKey, b: OrderKey): number {
  if (a.time !== b.time) return a.time - b.time
  if (a.seq !== b.seq) return a.seq - b.seq
  if (a.id === b.id) return 0
  if (a.id < b.id) return -1
  return 1
}

/** Every match someone played (the union of the histories), numbered 1..N in replay order. */
export function chartMatches(
  byPlayer: ReadonlyMap<PlayerId, PlayerStats>,
  matches: ReadonlyMap<MatchId, Match>,
): ChartMatch[] {
  const keys = new Map<MatchId, OrderKey>()
  for (const stats of byPlayer.values()) {
    for (const point of stats.history) {
      if (!keys.has(point.matchId)) keys.set(point.matchId, keyOf(point, matches))
    }
  }
  return [...keys.values()].sort(compareKeys).map((key, i) => ({ id: key.id, index: i + 1, playedAt: key.playedAt }))
}

function playedPoints(history: HistoryPoint[], indexOf: ReadonlyMap<MatchId, number>): CurvePoint[] {
  const points: CurvePoint[] = []
  for (const point of history) {
    const x = indexOf.get(point.matchId)
    if (x === undefined) continue
    points.push({ x, rating: point.ratingAfter, delta: point.delta })
  }
  return points.sort((a, b) => a.x - b.x)
}

/**
 * Start point half a match before the first one (at its ratingBefore, 1000), then one point per played match at
 * its ratingAfter. Null for a player without matches.
 */
export function buildSeries(stats: PlayerStats, indexOf: ReadonlyMap<MatchId, number>): Series | null {
  const played = playedPoints(stats.history, indexOf)
  if (played.length === 0) return null
  const first = stats.history.find((point) => indexOf.get(point.matchId) === played[0].x)
  const start: CurvePoint = { x: played[0].x - 0.5, rating: first?.ratingBefore ?? START_RATING, delta: null }
  return { playerId: stats.playerId, points: [start, ...played] }
}

export function buildChartData(
  byPlayer: ReadonlyMap<PlayerId, PlayerStats>,
  matches: ReadonlyMap<MatchId, Match>,
): ChartData {
  const ordered = chartMatches(byPlayer, matches)
  const indexOf = new Map<MatchId, number>(ordered.map((match) => [match.id, match.index]))
  const series = new Map<PlayerId, Series>()
  for (const stats of byPlayer.values()) {
    const built = buildSeries(stats, indexOf)
    if (built !== null) series.set(stats.playerId, built)
  }
  return { matches: ordered, series }
}

// ---------------------------------------------------------------------------
// Domains and ticks
// ---------------------------------------------------------------------------

export function xDomain(matchCount: number): Domain {
  return { min: 0.5, max: Math.max(1, matchCount) }
}

function widen(domain: Domain): Domain {
  const missing = MIN_Y_SPAN - (domain.max - domain.min)
  if (missing <= 0) return domain
  const each = Math.ceil(missing / (2 * Y_STEP)) * Y_STEP
  return { min: domain.min - each, max: domain.max + each }
}

/** Y domain over the visible series, always including 1000, padded and rounded to tens. */
export function yDomain(series: Series[]): Domain {
  let lo = START_RATING
  let hi = START_RATING
  for (const one of series) {
    for (const point of one.points) {
      lo = Math.min(lo, point.rating)
      hi = Math.max(hi, point.rating)
    }
  }
  const pad = Math.max(Y_PAD_MIN, (hi - lo) * Y_PAD_RATIO)
  const min = Math.floor((lo - pad) / Y_STEP) * Y_STEP
  const max = Math.ceil((hi + pad) / Y_STEP) * Y_STEP
  return widen({ min, max })
}

function tickCount(domain: Domain, step: number): number {
  return Math.floor(domain.max / step) - Math.ceil(domain.min / step) + 1
}

/** At most 5 gridline values on a nice step (10, 20, 25, 50…) inside the domain; 1000 is always one of them. */
export function yTicks(domain: Domain): number[] {
  const step = Y_TICK_STEPS.find((candidate) => tickCount(domain, candidate) <= MAX_Y_TICKS) ?? 1000
  const ticks: number[] = []
  for (let value = Math.ceil(domain.min / step) * step; value <= domain.max; value += step) ticks.push(value)
  return ticks
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

/** « 12 oct. » in the phone's time zone. */
export function dayLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return dayFormat.format(date)
}

function dayKey(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** One tick per local calendar day, on the index of that day's first match. */
export function dayTicks(matches: ChartMatch[]): DayTick[] {
  const ticks: DayTick[] = []
  let previous = ''
  for (const match of matches) {
    const key = dayKey(match.playedAt)
    if (key === previous) continue
    previous = key
    ticks.push({ index: match.index, label: dayLabel(match.playedAt) })
  }
  return ticks
}

// ---------------------------------------------------------------------------
// Reading values (tooltip, end labels, table)
// ---------------------------------------------------------------------------

/** Last known rating at or before `x`; null before the player's first match. */
export function valueAt(series: Series, x: number): number | null {
  let value: number | null = null
  for (const point of series.points) {
    if (point.x > x) break
    value = point.rating
  }
  return value
}

/** The point of the match at index `x` if this player played it, else null. */
export function pointAt(series: Series, x: number): CurvePoint | null {
  return series.points.find((point) => point.x === x && point.delta !== null) ?? null
}

export function lastPoint(series: Series): CurvePoint {
  return series.points[series.points.length - 1]
}

/** Table view: current, highest and lowest rating (start included, as drawn) and matches played. */
export function summarize(series: Series): SeriesSummary {
  const ratings = series.points.map((point) => Math.round(point.rating))
  return {
    current: Math.round(lastPoint(series).rating),
    high: Math.max(...ratings),
    low: Math.min(...ratings),
    played: series.points.length - 1,
  }
}

// ---------------------------------------------------------------------------
// Visible players and colour slots
// ---------------------------------------------------------------------------

/** Ranking display order (classés, débutants, inactifs), only players with at least one match. */
export function chipOrder(ranking: Ranking, series: ReadonlyMap<PlayerId, Series>): PlayerId[] {
  return [...ranking.ranked, ...ranking.rookies, ...ranking.inactive].filter((id) => series.has(id))
}

/** On open: the first 3 of the ranking (classés, then débutants) in slots 1..3. */
export function defaultVisible(ranking: Ranking, series: ReadonlyMap<PlayerId, Series>): Slots {
  const top = [...ranking.ranked, ...ranking.rookies].filter((id) => series.has(id)).slice(0, DEFAULT_COUNT)
  return new Map(top.map((id, i) => [id, i + 1]))
}

function firstFreeSlot(visible: Slots): number | null {
  const used = new Set(visible.values())
  for (let slot = 1; slot <= MAX_CURVES; slot += 1) {
    if (!used.has(slot)) return slot
  }
  return null
}

/** Turns a player on in the first free slot; the others keep theirs. Null when all 8 slots are taken. */
export function assignSlot(visible: Slots, playerId: PlayerId): Slots | null {
  if (visible.has(playerId)) return visible
  const slot = firstFreeSlot(visible)
  if (slot === null) return null
  return new Map(visible).set(playerId, slot)
}

/** Turns a player off: frees his slot without repainting anyone else. */
export function releaseSlot(visible: Slots, playerId: PlayerId): Slots {
  if (!visible.has(playerId)) return visible
  const next = new Map(visible)
  next.delete(playerId)
  return next
}

/** A visible curve as the chart draws it. */
export type Curve = { playerId: PlayerId; name: string; slot: number; series: Series }

/** The visible players that have a series, by slot (so the drawing order never depends on the ranking). */
export function visibleCurves(visible: Slots, data: ChartData, nameOf: (playerId: PlayerId) => string): Curve[] {
  const curves: Curve[] = []
  for (const [playerId, slot] of visible) {
    const series = data.series.get(playerId)
    if (series !== undefined) curves.push({ playerId, name: nameOf(playerId), slot, series })
  }
  return curves.sort((a, b) => a.slot - b.slot)
}

/** One tooltip row: the player's rating at the crosshair and his delta if he played that match. */
export type Reading = { playerId: PlayerId; name: string; slot: number; rating: number; delta: number | null }

/** Tooltip rows at match `x`: players who had played by then, best rating first. */
export function readingsAt(curves: Curve[], x: number): Reading[] {
  const rows: Reading[] = []
  for (const curve of curves) {
    const rating = valueAt(curve.series, x)
    if (rating === null) continue
    const delta = pointAt(curve.series, x)?.delta ?? null
    rows.push({ playerId: curve.playerId, name: curve.name, slot: curve.slot, rating, delta })
  }
  return rows.sort((a, b) => b.rating - a.rating)
}
