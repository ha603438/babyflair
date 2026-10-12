import { Fragment } from 'react'
import type { MouseEventHandler, ReactNode } from 'react'
import type { Match, MatchPlayerResult, MatchResult, Player, PlayerId, PlayerStats } from '../types'
import { daysSince, fmtInt, fmtPercent, fmtScore, fmtTime, plural } from '../format'
import { sevenDayDelta, teamLabel } from '../stats'
import { Badge } from './Badge'
import { Delta } from './Delta'
import { ListRow } from './ListRow'

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

type Sides = { winners: PlayerId[]; losers: PlayerId[]; winScore: number; loseScore: number }

function sidesOf(match: Match): Sides {
  if (match.scoreA === match.target) {
    return { winners: match.teamA, losers: match.teamB, winScore: match.scoreA, loseScore: match.scoreB }
  }
  return { winners: match.teamB, losers: match.teamA, winScore: match.scoreB, loseScore: match.scoreA }
}

function isEdited(match: Match): boolean {
  return Date.parse(match.updatedAt) > Date.parse(match.createdAt)
}

function orderedResults(result: MatchResult | undefined, order: PlayerId[]): MatchPlayerResult[] {
  if (!result) return []
  const byId = new Map(result.perPlayer.map((entry) => [entry.playerId, entry]))
  const entries: MatchPlayerResult[] = []
  for (const id of order) {
    const entry = byId.get(id)
    if (entry) entries.push(entry)
  }
  return entries
}

function nameOf(players: Map<PlayerId, Player>, id: PlayerId): string {
  return players.get(id)?.name ?? '?'
}

function deltaTone(delta: number, muted: boolean): string {
  if (muted) return 'hr-d hr-d--muted'
  if (delta > 0) return 'hr-d pos'
  if (delta < 0) return 'hr-d neg'
  return 'hr-d muted'
}

type DeltaLineProps = { entries: MatchPlayerResult[]; players: Map<PlayerId, Player>; muted: boolean }

function DeltaLine({ entries, players, muted }: DeltaLineProps) {
  return (
    <div className="hr-deltas">
      {entries.map((entry, i) => (
        <Fragment key={entry.playerId}>
          {i > 0 && (
            <span className="hr-sep" aria-hidden="true">
              {' · '}
            </span>
          )}
          <span className={deltaTone(entry.delta, muted)}>
            {nameOf(players, entry.playerId)} <Delta value={entry.delta} size={13} />
          </span>
        </Fragment>
      ))}
    </div>
  )
}

function deltaLineNode(entries: MatchPlayerResult[], players: Map<PlayerId, Player>, muted: boolean): ReactNode {
  if (entries.length === 0) return undefined
  return <DeltaLine entries={entries} players={players} muted={muted} />
}

export function HistoryRow({ match, result, players, href, emphasisId }: HistoryRowProps) {
  const sides = sidesOf(match)
  const entries = orderedResults(result, [...sides.winners, ...sides.losers])
  const emphasised = entries.find((entry) => entry.playerId === emphasisId)
  const lineEntries = emphasised ? entries.filter((entry) => entry !== emphasised) : entries
  const subtitle = deltaLineNode(lineEntries, players, Boolean(emphasised))
  const title = (
    <div className="hr-line">
      <span className="hr-win">{teamLabel(sides.winners, players)}</span>
      <span className="hr-score score">{fmtScore(sides.winScore, sides.loseScore)}</span>
      {match.target === 5 && <span className="pill">en 5</span>}
      <span className="hr-lose">{teamLabel(sides.losers, players)}</span>
      {isEdited(match) && <span className="hr-edited">modifié</span>}
    </div>
  )
  return (
    <ListRow
      className="row--history"
      href={href}
      chevron
      leading={<time className="hr-time" dateTime={match.playedAt}>{fmtTime(match.playedAt)}</time>}
      title={title}
      subtitle={subtitle}
      trailing={emphasised ? <Delta value={emphasised.delta} size={17} /> : undefined}
    />
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
