import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import { Delta } from '../components/Delta'
import { fmtInt, plural } from '../format'
import { useOutsideTap } from '../screens/lists/useOutsideTap'
import type { PlayerId } from '../types'
import { dayLabel, dayTicks, lastPoint, readingsAt, START_RATING, valueAt, xDomain, yDomain, yTicks } from './curves'
import type { ChartMatch, Curve, Reading, Series } from './curves'
import {
  CHART_HEIGHT,
  endLabelWidth,
  FALLBACK_WIDTH,
  fitName,
  indexAtPx,
  LABEL_GAP,
  LABEL_OFFSET,
  LABEL_SPACE,
  makeFrame,
  placeTicks,
  rightMargin,
  spreadLabels,
  stepIndex,
  tooltipLeft,
  xPx,
  yPx,
} from './layout'
import type { Frame } from './layout'

// Rating curves of the visible players (Courbes du classement): plain SVG in real pixels, recessive grid, dashed
// 1000 baseline, 2 px lines over a surface halo, direct end labels, crosshair + tooltip on pointer and keyboard.

export type RatingChartProps = {
  curves: Curve[]
  matches: ChartMatch[]
  /** Tap on an end label: hide that player's curve. */
  onHide: (playerId: PlayerId) => void
  /** What one curve stands for in the chart's accessible name: « joueur » (default) or « duo » (2V2 tab). */
  noun?: string
}

/** What the crosshair shows: the hovered match and one reading per visible player. */
type Readout = { match: ChartMatch; readings: Reading[] }

const EMPTY_TEXT = 'Touche un nom pour afficher sa courbe'
/** Per-match dots only with few curves, and only when matches are far enough apart to read as dots. */
const MAX_DOTTED_CURVES = 3
const MIN_DOT_SPACING = 6
const X_LABEL_GAP = 6
const LEADER_TICK = 6

function r1(n: number): number {
  return Math.round(n * 10) / 10
}

function seriesClass(base: string, slot: number): string {
  return `${base} series-${slot}`
}

/** Container width from a ResizeObserver; FALLBACK_WIDTH until measured (and during the server render). */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(FALLBACK_WIDTH)
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    if (element.clientWidth > 0) setWidth(Math.round(element.clientWidth))
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0
      if (measured > 0) setWidth(Math.round(measured))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return width
}

function pointsOf(frame: Frame, series: Series): string {
  return series.points.map((point) => `${r1(xPx(frame, point.x))},${r1(yPx(frame, point.rating))}`).join(' ')
}

// ---------------------------------------------------------------------------
// Static layers
// ---------------------------------------------------------------------------

function gridClass(value: number): string {
  if (value === START_RATING) return 'chart-base'
  return 'chart-gridline'
}

function yLabelClass(value: number): string {
  if (value === START_RATING) return 'chart-ylabel chart-ylabel--base'
  return 'chart-ylabel'
}

function Grid({ frame }: { frame: Frame }) {
  const right = frame.left + frame.width
  return (
    <g>
      {yTicks(frame.y).map((value) => {
        const y = r1(yPx(frame, value))
        return (
          <g key={value}>
            <line className={gridClass(value)} x1={frame.left} x2={right} y1={y} y2={y} />
            <text className={yLabelClass(value)} x={frame.left - 6} y={y} dy="0.35em" textAnchor="end">
              {fmtInt(value)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function XAxis({ frame, matches, width }: { frame: Frame; matches: ChartMatch[]; width: number }) {
  const bottom = frame.top + frame.height
  const inputs = dayTicks(matches).map((tick) => ({ ...tick, at: r1(xPx(frame, tick.index)) }))
  const ticks = placeTicks(inputs, 0, width, X_LABEL_GAP)
  return (
    <g>
      <line className="chart-axis" x1={frame.left} x2={frame.left + frame.width} y1={bottom} y2={bottom} />
      {ticks.map((tick) => (
        <g key={tick.index}>
          <line className="chart-axis" x1={tick.at} x2={tick.at} y1={bottom} y2={bottom + 4} />
          <text className="chart-xlabel" x={r1(tick.center)} y={bottom + 17} textAnchor="middle">
            {tick.label}
          </text>
        </g>
      ))}
    </g>
  )
}

type LineProps = { frame: Frame; curve: Curve; count: number; dots: boolean }

/** After a player's last match his rating holds: a dotted rest line runs to the latest match. */
function RestLine({ frame, curve, count }: Omit<LineProps, 'dots'>) {
  const last = lastPoint(curve.series)
  if (last.x >= count) return null
  const y = r1(yPx(frame, last.rating))
  return <line className="chart-rest" x1={r1(xPx(frame, last.x))} x2={r1(xPx(frame, count))} y1={y} y2={y} />
}

function MatchDots({ frame, curve, dots }: Omit<LineProps, 'count'>) {
  if (!dots) return null
  return (
    <>
      {curve.series.points.slice(1).map((point) => (
        <circle
          key={point.x}
          className="chart-dot"
          cx={r1(xPx(frame, point.x))}
          cy={r1(yPx(frame, point.rating))}
          r={2}
        />
      ))}
    </>
  )
}

function CurveLine({ frame, curve, count, dots }: LineProps) {
  const points = pointsOf(frame, curve.series)
  const last = lastPoint(curve.series)
  return (
    <g className={`series-${curve.slot}`}>
      <polyline className="chart-halo" points={points} />
      <polyline className="chart-line" points={points} />
      <RestLine frame={frame} curve={curve} count={count} />
      <MatchDots frame={frame} curve={curve} dots={dots} />
      <circle className="chart-end" cx={r1(xPx(frame, last.x))} cy={r1(yPx(frame, last.rating))} r={4} />
    </g>
  )
}

type LeaderProps = { xEnd: number; textX: number; lineY: number; labelY: number }

/**
 * Series-coloured key tick before the label; when the label was nudged away from its line, a hairline connector
 * runs from the line end to the tick (thinner than the 2 px data lines so it never reads as data).
 */
function Leader({ xEnd, textX, lineY, labelY }: LeaderProps) {
  const tickStart = r1(textX - LEADER_TICK - 4)
  const y = r1(labelY)
  const tick = <line className="chart-leader" x1={tickStart} y1={y} x2={r1(textX - 4)} y2={y} />
  if (Math.abs(labelY - lineY) <= 1) {
    return <line className="chart-leader" x1={r1(xEnd + 7)} y1={y} x2={r1(textX - 4)} y2={y} />
  }
  return (
    <>
      <line className="chart-connector" x1={r1(xEnd + 7)} y1={r1(lineY)} x2={tickStart} y2={y} />
      {tick}
    </>
  )
}

type EndLabelProps = {
  curve: Curve
  xEnd: number
  lineY: number
  labelY: number
  maxWidth: number
  onHide: (playerId: PlayerId) => void
}

function EndLabel({ curve, xEnd, lineY, labelY, maxWidth, onHide }: EndLabelProps) {
  const rating = fmtInt(lastPoint(curve.series).rating)
  const name = fitName(curve.name, rating, maxWidth)
  const textX = xEnd + LABEL_OFFSET
  return (
    <g className={seriesClass('chart-endlabel', curve.slot)} onClick={() => onHide(curve.playerId)}>
      <Leader xEnd={xEnd} textX={textX} lineY={lineY} labelY={labelY} />
      <text className="chart-endname" x={r1(textX)} y={r1(labelY)} dy="0.35em">
        {name}
        <tspan className="chart-endrating" dx={LABEL_SPACE}>
          {rating}
        </tspan>
      </text>
      <rect
        className="chart-hit"
        x={r1(xEnd + 4)}
        y={r1(labelY - 10)}
        width={r1(endLabelWidth(name, rating) + LABEL_OFFSET)}
        height={20}
      />
    </g>
  )
}

type EndLabelsProps = { frame: Frame; curves: Curve[]; count: number; right: number; onHide: (id: PlayerId) => void }

function EndLabels({ frame, curves, count, right, onHide }: EndLabelsProps) {
  const xEnd = xPx(frame, count)
  const lineYs = curves.map((curve) => yPx(frame, lastPoint(curve.series).rating))
  const labelYs = spreadLabels(lineYs, LABEL_GAP, frame.top + 6, frame.top + frame.height - 6)
  const maxWidth = right - LABEL_OFFSET - 4
  return (
    <g>
      {curves.map((curve, i) => (
        <EndLabel
          key={curve.playerId}
          curve={curve}
          xEnd={xEnd}
          lineY={lineYs[i]}
          labelY={labelYs[i]}
          maxWidth={maxWidth}
          onHide={onHide}
        />
      ))}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Crosshair and tooltip
// ---------------------------------------------------------------------------

function Crosshair({ frame, curves, index }: { frame: Frame; curves: Curve[]; index: number }) {
  const x = r1(xPx(frame, index))
  return (
    <g>
      <line className="chart-crossline" x1={x} x2={x} y1={frame.top} y2={frame.top + frame.height} />
      {curves.map((curve) => {
        const value = valueAt(curve.series, index)
        if (value === null) return null
        return (
          <circle
            key={curve.playerId}
            className={seriesClass('chart-crossdot', curve.slot)}
            cx={x}
            cy={r1(yPx(frame, value))}
            r={4}
          />
        )
      })}
    </g>
  )
}

function matchTitle(match: ChartMatch): string {
  return `Match n°\u00a0${match.index} · ${dayLabel(match.playedAt)}`
}

function TooltipRow({ reading }: { reading: Reading }) {
  return (
    <>
      <span className={seriesClass('series-dot', reading.slot)} />
      <span className="chart-tip__name">{reading.name}</span>
      <span className="chart-tip__rating">{fmtInt(reading.rating)}</span>
      <span className="chart-tip__delta">{reading.delta !== null && <Delta value={reading.delta} size={13} />}</span>
    </>
  )
}

type TooltipProps = { readout: Readout; anchor: number; chartWidth: number }

function Tooltip({ readout, anchor, chartWidth }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Placed after layout so the flip uses the real tooltip width.
  useLayoutEffect(() => {
    const element = ref.current
    if (element === null) return
    element.style.left = `${tooltipLeft(anchor, element.offsetWidth, chartWidth)}px`
  })
  return (
    <div ref={ref} className="chart-tip" aria-hidden="true">
      <p className="chart-tip__title">{matchTitle(readout.match)}</p>
      <div className="chart-tip__rows">
        {readout.readings.map((reading) => (
          <TooltipRow key={reading.playerId} reading={reading} />
        ))}
      </div>
    </div>
  )
}

function spokenReading(readout: Readout): string {
  const values = readout.readings.map((reading) => `${reading.name} ${fmtInt(reading.rating)}`).join(', ')
  return `${matchTitle(readout.match)} : ${values}`
}

function EmptyPlot({ frame }: { frame: Frame }) {
  return (
    <p className="chart-empty" style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}>
      <span>{EMPTY_TEXT}</span>
    </p>
  )
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

/** Hovered match clamped to the current matches (one may have been deleted meanwhile). */
function readoutOf(hover: number | null, matches: ChartMatch[], curves: Curve[]): Readout | null {
  if (hover === null || curves.length === 0) return null
  const match = matches[Math.min(hover, matches.length) - 1]
  if (match === undefined) return null
  return { match, readings: readingsAt(curves, match.index) }
}

function showDots(frame: Frame, curves: Curve[], count: number): boolean {
  if (curves.length > MAX_DOTTED_CURVES) return false
  return frame.width / Math.max(0.5, count - 0.5) >= MIN_DOT_SPACING
}

/** Hovered match index; a tap outside the chart hides the crosshair (the tooltip stays after a finger lifts). */
function useCrosshair(boxRef: RefObject<HTMLDivElement | null>) {
  const [hover, setHover] = useState<number | null>(null)
  const hide = useCallback(() => setHover(null), [])
  useOutsideTap(boxRef, hover !== null, hide)
  return [hover, setHover] as const
}

export function RatingChart({ curves, matches, onHide, noun = 'joueur' }: RatingChartProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = useWidth(boxRef)
  const [hover, setHover] = useCrosshair(boxRef)
  const count = matches.length
  const labels = curves.map((curve) => ({ name: curve.name, rating: fmtInt(lastPoint(curve.series).rating) }))
  const right = rightMargin(labels, width)
  const frame = makeFrame(width, right, xDomain(count), yDomain(curves.map((curve) => curve.series)))
  const readout = readoutOf(hover, matches, curves)
  const dots = showDots(frame, curves, count)

  function track(event: PointerEvent<SVGRectElement>): void {
    if (curves.length === 0) return
    const box = svgRef.current?.getBoundingClientRect()
    if (box === undefined) return
    setHover(indexAtPx(frame, event.clientX - box.left, count))
  }

  function leave(event: PointerEvent<SVGRectElement>): void {
    // A finger lifting also fires pointerleave: on touch the tooltip stays until a tap elsewhere.
    if (event.pointerType === 'mouse') setHover(null)
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>): void {
    if (curves.length === 0) return
    const next = stepIndex(event.key, hover, count)
    if (next === undefined) return
    event.preventDefault()
    setHover(next)
  }

  return (
    <div ref={boxRef} className="chart-box">
      <svg
        ref={svgRef}
        className="chart-svg"
        width={width}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        role="img"
        aria-label={`Évolution du classement de ${plural(curves.length, noun)}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
      >
        <Grid frame={frame} />
        <XAxis frame={frame} matches={matches} width={width} />
        {curves.map((curve) => (
          <CurveLine key={curve.playerId} frame={frame} curve={curve} count={count} dots={dots} />
        ))}
        {readout !== null && <Crosshair frame={frame} curves={curves} index={readout.match.index} />}
        <rect
          className="chart-hitarea"
          x={frame.left}
          y={frame.top}
          width={frame.width}
          height={frame.height}
          onPointerDown={track}
          onPointerMove={track}
          onPointerLeave={leave}
        />
        <EndLabels frame={frame} curves={curves} count={count} right={right} onHide={onHide} />
      </svg>
      {curves.length === 0 && <EmptyPlot frame={frame} />}
      {readout !== null && (
        <Tooltip readout={readout} anchor={xPx(frame, readout.match.index)} chartWidth={width} />
      )}
      <p className="sr-only" aria-live="polite">
        {readout !== null && spokenReading(readout)}
      </p>
    </div>
  )
}
