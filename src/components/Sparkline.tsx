export type SparklineProps = {
  /** Rating values in chronological order (the caller passes the last 30 `ratingAfter`). */
  points: number[]
  baseline?: number
  height?: number
}

// Vertical padding so the 2 px stroke and the 6 px end dot are never clipped at the extremes.
const PAD = 6
// The inner viewBox is 0..100 wide and stretched to the real width (preserveAspectRatio="none").
const VIEW_W = 100

type Geometry = { polyline: string; baselineY: number; endY: number }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// The baseline is always inside the domain so the dashed 1000 line is visible even for an all-above series.
function geometry(points: number[], baseline: number, height: number): Geometry {
  const lo = Math.min(baseline, ...points)
  const hi = Math.max(baseline, ...points)
  const span = hi === lo ? 1 : hi - lo
  const inner = height - 2 * PAD
  const yOf = (value: number): number => round2(PAD + (1 - (value - lo) / span) * inner)
  const last = points.length - 1
  const polyline = points.map((value, i) => `${round2((i / last) * VIEW_W)},${yOf(value)}`).join(' ')
  return { polyline, baselineY: yOf(baseline), endY: yOf(points[last]) }
}

// The label sits just above the baseline, or just below it when the baseline hugs the top edge.
function labelY(baselineY: number): number {
  if (baselineY < 14) return baselineY + 12
  return baselineY - 4
}

/** Inline SVG rating curve with a dashed baseline and an end dot (spec §3.7). Renders nothing with < 2 points. */
export function Sparkline({ points, baseline = 1000, height = 72 }: SparklineProps) {
  if (points.length < 2) return null
  const geo = geometry(points, baseline, height)
  return (
    <svg className="spark" width="100%" height={height} aria-hidden="true" focusable="false">
      <line className="spark-base" x1="0" x2="100%" y1={geo.baselineY} y2={geo.baselineY} />
      <text className="spark-label" x="100%" dx="-10" y={labelY(geo.baselineY)} textAnchor="end">
        {baseline}
      </text>
      <svg x="0" y="0" width="100%" height={height} viewBox={`0 0 ${VIEW_W} ${height}`} preserveAspectRatio="none">
        <polyline className="spark-line" points={geo.polyline} />
      </svg>
      <circle className="spark-dot" cx="100%" cy={geo.endY} r="3" />
    </svg>
  )
}
