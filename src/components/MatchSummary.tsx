import { betCalculation, betTitle } from '../bets'
import type { BetOutcome, Match, MatchPlayerResult, MatchResult, Player, PlayerId, PlayerStats } from '../types'
import { fmtInt, fmtOrdinal, fmtScore } from '../format'
import { authorshipLine } from '../profile/journal'
import { teamLabel } from '../stats'
import { Badge } from './Badge'
import { POSITION_LABEL, positionOf } from '../stats'
import { Delta } from './Delta'
import { ListRow } from './ListRow'
import { MatchPills } from './MatchPills'

const ROOKIE_MATCHES = 10

export type MatchSummaryProps = {
  match: Match
  result: MatchResult
  players: Map<PlayerId, Player>
  /** Current stats; enables the « ? » badge and the rookie / newly ranked / returning movement variants. */
  byPlayer?: Map<PlayerId, PlayerStats>
  /** Ranks (1-based, ranked players only) captured right before addMatch; movement needs both maps. */
  rankBefore?: Map<PlayerId, number>
  rankAfter?: Map<PlayerId, number>
  /** « lun. 6 oct. · 12:42 · en 10 » or « aujourd'hui · 12:42 · en 10 », formatted by the caller. */
  dateLine: string
}

type Sides = { winners: PlayerId[]; losers: PlayerId[]; winScore: number; loseScore: number }

function sidesOf(match: Match): Sides {
  if (match.scoreA === match.target) {
    return { winners: match.teamA, losers: match.teamB, winScore: match.scoreA, loseScore: match.scoreB }
  }
  return { winners: match.teamB, losers: match.teamA, winScore: match.scoreB, loseScore: match.scoreA }
}

function isRookie(stats: PlayerStats | undefined): boolean {
  if (!stats) return false
  return stats.rookieProgress < ROOKIE_MATCHES
}

// Before this match the player had played - 1 matches; fewer than 10 means they were still a rookie, otherwise
// they were unranked because inactive (the result view is only reached right after the match was saved).
function wasRookieBefore(stats: PlayerStats | undefined): boolean {
  if (!stats) return true
  return stats.played - 1 < ROOKIE_MATCHES
}

function rankPart(
  entry: MatchPlayerResult,
  stats: PlayerStats | undefined,
  rankBefore: Map<PlayerId, number>,
  rankAfter: Map<PlayerId, number>,
): string | null {
  const after = rankAfter.get(entry.playerId)
  const before = rankBefore.get(entry.playerId)
  if (after === undefined) {
    if (stats?.status === 'rookie') return `${fmtInt(stats.rookieProgress)}/10 matchs`
    return null
  }
  if (before !== undefined) return `${fmtOrdinal(before)} → ${fmtOrdinal(after)}`
  if (wasRookieBefore(stats)) return `classé : ${fmtOrdinal(after)}`
  return 'de retour dans le classement'
}

function movementLine(
  entry: MatchPlayerResult,
  stats: PlayerStats | undefined,
  rankBefore: Map<PlayerId, number> | undefined,
  rankAfter: Map<PlayerId, number> | undefined,
): string {
  const ratings = `${fmtInt(entry.before)} → ${fmtInt(entry.after)}`
  if (!rankBefore || !rankAfter) return ratings
  const rank = rankPart(entry, stats, rankBefore, rankAfter)
  if (rank === null) return ratings
  return `${ratings} · ${rank}`
}

function orderedResults(result: MatchResult, order: PlayerId[]): MatchPlayerResult[] {
  const byId = new Map(result.perPlayer.map((entry) => [entry.playerId, entry]))
  const entries: MatchPlayerResult[] = []
  for (const id of order) {
    const entry = byId.get(id)
    if (entry) entries.push(entry)
  }
  return entries
}

type PlayerLineProps = {
  entry: MatchPlayerResult
  player: Player | undefined
  rookie: boolean
  why: string
  movement: string
  position: string | null
}

function PlayerLine({ entry, player, rookie, why, movement, position }: PlayerLineProps) {
  return (
    <ListRow
      className="row--ms"
      minHeight={56}
      title={
        <>
          <span className="row-name">{player?.name ?? '?'}</span>
          {player?.isGuest && <Badge kind="guest" />}
          {rookie && <Badge kind="rookie" />}
          {position && <span className="ms-pos">{position}</span>}
        </>
      }
      subtitle={
        <>
          <div className="ms-why">{why}</div>
          <div className="ms-move">{movement}</div>
        </>
      }
      trailing={<Delta value={entry.delta} size={17} />}
    />
  )
}

function betClass(bet: BetOutcome): string {
  if (bet.success) return 'ms-bet ms-bet--won'
  return 'ms-bet ms-bet--lost'
}

/** « 🎯 Annonce des Blancs : +4 · réussie (23 % de chances) » and, under it, how the points came out. */
function BetBlock({ bet, match }: { bet: BetOutcome; match: Match }) {
  return (
    <div className={betClass(bet)}>
      <p className="ms-bet__title">{betTitle(bet)}</p>
      <p className="ms-bet__calc">{betCalculation(bet, match)}</p>
    </div>
  )
}

/** Score hero, team names, the announcements and per-player rows with the engine's why line (spec §3.4, §4 step C). */
export function MatchSummary({ match, result, players, byPlayer, rankBefore, rankAfter, dateLine }: MatchSummaryProps) {
  const sides = sidesOf(match)
  const winnersLabel = teamLabel(sides.winners, players)
  const losersLabel = teamLabel(sides.losers, players)
  const entries = orderedResults(result, [...sides.winners, ...sides.losers])
  const heroLabel = `${winnersLabel} ${fmtScore(sides.winScore, sides.loseScore)} ${losersLabel}`
  const authors = authorshipLine(match, players)
  return (
    <section className="ms">
      <div className="ms-date">
        {dateLine}
        <MatchPills match={match} className="ms-pills" />
        {authors !== null && <div className="ms-author">{authors}</div>}
      </div>
      <div className="ms-hero" role="img" aria-label={heroLabel}>
        <div className="ms-side">
          <div className="ms-score">{fmtInt(sides.winScore)}</div>
          <div className="ms-team">{winnersLabel}</div>
        </div>
        <div className="ms-dash">–</div>
        <div className="ms-side">
          <div className="ms-score">{fmtInt(sides.loseScore)}</div>
          <div className="ms-team ms-team--loser">{losersLabel}</div>
        </div>
      </div>
      {result.bets.length > 0 && (
        <div className="ms-bets">
          {result.bets.map((bet) => (
            <BetBlock key={bet.team} bet={bet} match={match} />
          ))}
        </div>
      )}
      <div className="ms-rows">
        {entries.map((entry) => {
          const stats = byPlayer?.get(entry.playerId)
          return (
            <PlayerLine
              key={entry.playerId}
              entry={entry}
              player={players.get(entry.playerId)}
              rookie={isRookie(stats)}
              why={entry.why}
              movement={movementLine(entry, stats, rankBefore, rankAfter)}
              position={(() => { const p = positionOf(entry.playerId, match); return p === null ? null : POSITION_LABEL[p] })()}
            />
          )
        })}
      </div>
    </section>
  )
}
