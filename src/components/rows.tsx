import type { MouseEventHandler, ReactNode } from 'react'
import type { Match, MatchResult, Player, PlayerId, PlayerStats } from '../types'
import { daysSince, fmtInt, fmtPercent, fmtScore, fmtTime, plural } from '../format'
import { sevenDayDelta, teamLabel } from '../stats'
import { Badge } from './Badge'
import { Delta } from './Delta'
import { ListRow } from './ListRow'
import { MatchPills } from './MatchPills'

const ROOKIE_MATCHES = 10

// A player keeps the « ? » badge until 10 matches, even while listed under Inactifs (spec §3.1).
function isRookie(stats: PlayerStats | undefined): boolean {
  if (!stats) return true
  return stats.rookieProgress < ROOKIE_MATCHES
}

function winRate(stats: PlayerStats): number {
  if (stats.played === 0) return 0
  return stats.wins / stats.played
}

function NameWithBadges({ player, rookie }: { player: Player; rookie: boolean }) {
  return (
    <>
      <span className="row-name">{player.name}</span>
      {player.isGuest && <Badge kind="guest" />}
      {rookie && <Badge kind="rookie" />}
    </>
  )
}

// ---------------------------------------------------------------------------
// RankRow (spec §3.1)
// ---------------------------------------------------------------------------

export type RankRowVariant = 'ranked' | 'rookie' | 'inactive'

export type RankRowProps = {
  player: Player
  stats: PlayerStats
  variant: RankRowVariant
  /** 1-based rank among the ranked players; only meaningful for the 'ranked' variant. */
  rank?: number
  now: Date
  href: string
  /** Flash the row after a match (navigation payload highlightIds). */
  highlight?: boolean
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

function rankSubtitle(variant: RankRowVariant, stats: PlayerStats, now: Date): string {
  if (variant === 'rookie') return `${fmtInt(stats.rookieProgress)}/10 matchs avant d'être classé`
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

function rankRowClass(variant: RankRowVariant, highlight: boolean): string {
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

export function RankRow({ player, stats, variant, rank, now, href, highlight = false }: RankRowProps) {
  const rookie = isRookie(stats)
  return (
    <ListRow
      className={rankRowClass(variant, highlight)}
      href={href}
      leading={rankCell(variant, rank, rookie)}
      title={<NameWithBadges player={player} rookie={false} />}
      subtitle={rankSubtitle(variant, stats, now)}
      trailing={<span className={ratingClass(variant)}>{fmtInt(stats.rating)}</span>}
      trailingSub={trendNode(variant, stats, now)}
    />
  )
}

// ---------------------------------------------------------------------------
// PlayerRow (spec §3.6)
// ---------------------------------------------------------------------------

export type PlayerRowProps = {
  player: Player
  stats?: PlayerStats
  now: Date
  href: string
}

function playerSubtitle(stats: PlayerStats | undefined, now: Date): string {
  if (!stats || stats.played === 0) return 'Aucun match'
  if (stats.status === 'inactive' && stats.lastPlayedAt) {
    return `inactif depuis ${fmtInt(daysSince(stats.lastPlayedAt, now))} j`
  }
  if (stats.status === 'rookie') return `${fmtInt(stats.rookieProgress)}/10 matchs`
  return `${fmtInt(stats.rating)} · ${plural(stats.played, 'match')}`
}

export function PlayerRow({ player, stats, now, href }: PlayerRowProps) {
  return (
    <ListRow
      className="row--player"
      href={href}
      title={<NameWithBadges player={player} rookie={isRookie(stats)} />}
      subtitle={playerSubtitle(stats, now)}
    />
  )
}

// ---------------------------------------------------------------------------
// HistoryRow (spec §3.3, §3.7)
// ---------------------------------------------------------------------------

export type HistoryRowProps = {
  match: Match
  /** Replay result for this match; the per-player delta line is omitted without it. */
  result?: MatchResult
  players: Map<PlayerId, Player>
  href: string
  /** Joueur page: this player's delta moves to the right column, the others turn --text-2. */
  emphasisId?: PlayerId
}

function isEdited(match: Match): boolean {
  return Date.parse(match.updatedAt) > Date.parse(match.createdAt)
}

function nameOf(players: Map<PlayerId, Player>, id: PlayerId): string {
  return players.get(id)?.name ?? '?'
}

type TeamSideProps = {
  ids: PlayerId[]
  side: 'a' | 'b'
  winner: boolean
  players: Map<PlayerId, Player>
  deltas: Map<PlayerId, number>
  emphasisId?: PlayerId
}

/** One team, one line per player (arrière first in 2v2): name and its delta, never truncated to « … » as a pair. */
function TeamSide({ ids, side, winner, players, deltas, emphasisId }: TeamSideProps) {
  const classes = ['hr-team', `hr-team--${side}`]
  if (winner) classes.push('is-winner')
  return (
    <div className={classes.join(' ')}>
      {ids.map((id) => {
        const delta = deltas.get(id)
        return (
          <div key={id} className={id === emphasisId ? 'hr-p is-me' : 'hr-p'}>
            <span className="hr-name">{nameOf(players, id)}</span>
            {delta !== undefined && <Delta value={delta} size={13} />}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Historique / Joueur row: Blancs on the left, Noirs on the right, the score in the middle, every player on their own
 * line with their delta. The whole row is the link to the match detail (no chevron).
 */
export function HistoryRow({ match, result, players, href, emphasisId }: HistoryRowProps) {
  const aWon = match.scoreA === match.target
  const deltas = new Map((result?.perPlayer ?? []).map((entry) => [entry.playerId, entry.delta]))
  const label = `${teamLabel(match.teamA, players)} ${fmtScore(match.scoreA, match.scoreB)} ${teamLabel(match.teamB, players)}`
  return (
    <a className="row row-divider row--tap row--history" href={href} aria-label={label}>
      <div className="hr-meta">
        <time className="hr-time" dateTime={match.playedAt}>
          {fmtTime(match.playedAt)}
        </time>
        {match.target === 5 && <span className="pill">en 5</span>}
        <MatchPills match={match} />
        {isEdited(match) && <span className="hr-edited">modifié</span>}
      </div>
      <div className="hr-grid">
        <TeamSide ids={match.teamA} side="a" winner={aWon} players={players} deltas={deltas} emphasisId={emphasisId} />
        <div className="hr-score score">
          <span className={aWon ? 'hr-s hr-s--win' : 'hr-s'}>{match.scoreA}</span>
          <span className="hr-dash">–</span>
          <span className={aWon ? 'hr-s' : 'hr-s hr-s--win'}>{match.scoreB}</span>
        </div>
        <TeamSide ids={match.teamB} side="b" winner={!aWon} players={players} deltas={deltas} emphasisId={emphasisId} />
      </div>
    </a>
  )
}

// ---------------------------------------------------------------------------
// SettingRow (spec §3.8)
// ---------------------------------------------------------------------------

export type SettingRowProps = {
  title: string
  caption?: string
  /** Caption in --warn (export nudge once ≥ 30 matches / 30 days since the last export). */
  captionWarn?: boolean
  /** Title in --neg (« Tout effacer »). */
  danger?: boolean
  chevron?: boolean
  href?: string
  onClick?: MouseEventHandler<HTMLElement>
  trailing?: ReactNode
}

function settingClass(danger: boolean): string {
  if (danger) return 'row--setting row--danger'
  return 'row--setting'
}

function captionNode(caption: string | undefined, warn: boolean): ReactNode {
  if (caption === undefined) return undefined
  if (warn) return <span className="row-sub--warn">{caption}</span>
  return caption
}

export function SettingRow({
  title,
  caption,
  captionWarn = false,
  danger = false,
  chevron,
  href,
  onClick,
  trailing,
}: SettingRowProps) {
  return (
    <ListRow
      className={settingClass(danger)}
      href={href}
      onClick={onClick}
      chevron={chevron}
      title={title}
      subtitle={captionNode(caption, captionWarn)}
      trailing={trailing}
    />
  )
}
