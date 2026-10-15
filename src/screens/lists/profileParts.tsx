import { Delta } from '../../components/Delta'
import { Sparkline } from '../../components/Sparkline'
import { sevenDayDelta } from '../../stats'
import type { PlayerStats } from '../../types'
import { sparklineCaption, sparklinePoints } from './labels'

// Pieces shared by the player page (JoueurView) and the duo page (DuoView): the 7-day trend of the hero, the rating
// sparkline card and the stat tile. `stats` is a player's, or a duo's from the 2V2 ranking (same shape).

export function Trend({ stats, now }: { stats: PlayerStats; now: Date }) {
  const trend = sevenDayDelta(stats, now)
  if (trend === null) return null
  return <Delta value={trend} size={13} suffix="sur 7 j" />
}

export function SparklineCard({ stats }: { stats: PlayerStats }) {
  const points = sparklinePoints(stats)
  return (
    <section className="card card-pad">
      <Sparkline points={points} />
      <p className="spark-caption">{sparklineCaption(points)}</p>
    </section>
  )
}

export function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value t-num">{value}</span>
    </div>
  )
}
