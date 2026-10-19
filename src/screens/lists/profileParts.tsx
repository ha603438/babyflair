import type { BetRecord } from '../../betStats'
import { Delta } from '../../components/Delta'
import { Sparkline } from '../../components/Sparkline'
import { sevenDayDelta } from '../../stats'
import type { PlayerStats } from '../../types'
import { BET_CARD_COPY, betCardView } from './betLabels'
import type { BetSubject, BetTileView } from './betLabels'
import { sparklineCaption, sparklinePoints } from './labels'

// Pieces shared by the player page (JoueurView) and the duo page (DuoView): the 7-day trend of the hero, the rating
// sparkline card, the stat tile and the « 🎯 Annonces » card. `stats` is a player's, or a duo's from the 2V2 ranking
// (same shape).

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

/** A tile that leads to a page (« Plus belle annonce » → its match), its value in the accent. */
function LinkTile({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <a className="tile tile--link" href={href}>
      <span className="tile-label">{label}</span>
      <span className="tile-value t-num">{value}</span>
    </a>
  )
}

function BetTile({ tile }: { tile: BetTileView }) {
  if (tile.href === null) return <Tile label={tile.label} value={tile.value} />
  return <LinkTile label={tile.label} value={tile.value} href={tile.href} />
}

function FacedLine({ text }: { text: string | null }) {
  if (text === null) return null
  return <p className="tiles-note">{text}</p>
}

/** « 🎯 Annonces »: 2 × 2 tiles and the « A fait tomber… » line; nothing until the subject made an announcement. */
export function BetsCard({ record, subject }: { record: BetRecord; subject: BetSubject }) {
  const view = betCardView(record, subject)
  if (view === null) return null
  return (
    <section className="card card-pad">
      <h2 className="tiles-title">
        <span aria-hidden="true">{`${BET_CARD_COPY.emoji} `}</span>
        {BET_CARD_COPY.title}
      </h2>
      <div className="tiles tiles--2">
        {view.tiles.map((tile) => (
          <BetTile key={tile.label} tile={tile} />
        ))}
      </div>
      <FacedLine text={view.faced} />
    </section>
  )
}
