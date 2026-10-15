import type { ReactNode } from 'react'
import { daysSince, fmtInt, fmtPercent } from '../format'
import { sevenDayDelta } from '../stats'
import type { PlayerStats } from '../types'
import { Badge } from './Badge'
import { Delta } from './Delta'
import { ListRow } from './ListRow'
import type { RankRowVariant } from './rows'

// Row of the 2V2 and 1V1 Classement tabs: the RankRow layout (rank, name, rating, record, 7-day trend), with the
// threshold of those rankings (`rankedAfter`, 3) instead of the main ranking's 10, and any title (a player, or a duo
// « A & B »).

export type ModeRankRowProps = {
  /** The name cell: a player name with its badges, or « A & B ». */
  title: ReactNode
  stats: PlayerStats
  variant: RankRowVariant
  /** 1-based rank among the ranked entries; only meaningful for the 'ranked' variant. */
  rank?: number
  rankedAfter: number
  now: Date
  href: string
  /** Flash the row after a match (navigation payload highlightIds). */
  highlight?: boolean
}

function winRate(stats: PlayerStats): number {
  if (stats.played === 0) return 0
  return stats.wins / stats.played
}

function rankCell(variant: RankRowVariant, rank: number | undefined, rookie: boolean): ReactNode {
  if (variant === 'inactive') {
    if (rookie) return <Badge kind="rookie" />
    return <span className="rank-dash">–</span>
  }
  if (variant === 'rookie') return <Badge kind="rookie" />
  if (rank !== undefined && rank <= 3) return <Badge kind="medal" rank={rank} />
  if (rank === undefined) return <span className="rank-num" />
  return <span className="rank-num">{fmtInt(rank)}</span>
}

function subtitle(variant: RankRowVariant, stats: PlayerStats, rankedAfter: number, now: Date): string {
  if (variant === 'rookie') return `${fmtInt(stats.rookieProgress)}/${fmtInt(rankedAfter)} matchs avant d'être classé`
  if (variant === 'inactive') {
    if (!stats.lastPlayedAt) return 'Aucun match'
    return `Dernier match il y a ${fmtInt(daysSince(stats.lastPlayedAt, now))} j`
  }
  return `${fmtInt(stats.wins)} V · ${fmtInt(stats.losses)} D · ${fmtPercent(winRate(stats))}`
}

function ratingClass(variant: RankRowVariant): string {
  if (variant === 'rookie') return 'rating rating--2'
  if (variant === 'inactive') return 'rating rating--3'
  return 'rating'
}

function rowClass(variant: RankRowVariant, highlight: boolean): string {
  const classes = ['row--rank']
  if (variant === 'inactive') classes.push('row--inactive')
  if (highlight) classes.push('row--flash')
  return classes.join(' ')
}

function trendNode(variant: RankRowVariant, stats: PlayerStats, now: Date): ReactNode {
  if (variant === 'inactive') return undefined
  const trend = sevenDayDelta(stats, now)
  if (trend === null) return undefined
  return <Delta value={trend} size={13} suffix="· 7 j" />
}

export function ModeRankRow(props: ModeRankRowProps) {
  const { title, stats, variant, rank, rankedAfter, now, href, highlight = false } = props
  return (
    <ListRow
      className={rowClass(variant, highlight)}
      href={href}
      leading={rankCell(variant, rank, stats.rookieProgress < rankedAfter)}
      title={title}
      subtitle={subtitle(variant, stats, rankedAfter, now)}
      trailing={<span className={ratingClass(variant)}>{fmtInt(stats.rating)}</span>}
      trailingSub={trendNode(variant, stats, now)}
    />
  )
}
