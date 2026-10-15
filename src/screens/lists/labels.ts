import { daysSince, fmtInt, fmtOrdinal, fmtPercent, fmtRelative, fmtRelativeDay, plural } from '../../format'
import { rankIndexOf } from '../../stats'
import type { Match, MatchId, Player, PlayerId, PlayerStats, Ranking } from '../../types'

// French copy and small derivations for the Classement / Joueurs / Joueur screens (spec §3.1, §3.6, §3.7, §9).
// No rating math here: everything comes from the engine's PlayerStats / Ranking.

/** Points drawn by the Joueur sparkline. */
export const SPARKLINE_POINTS = 30
/** Rows under « Derniers matchs ». */
export const RECENT_MATCHES = 10

export type Streak = { kind: 'win' | 'loss'; length: number }
export type Partner = { partnerId: PlayerId; shared: number; winRate: number }

/** The match with the latest `playedAt` (the array is insertion order, which is the same thing in v1). */
export function latestMatch(matches: Match[]): Match | undefined {
  let latest: Match | undefined
  for (const match of matches) {
    if (latest === undefined || Date.parse(match.playedAt) > Date.parse(latest.playedAt)) latest = match
  }
  return latest
}

function lastPlayedText(lastPlayedAt: string, now: Date, withTime: boolean): string {
  if (withTime) return fmtRelative(lastPlayedAt, now)
  return fmtRelativeDay(lastPlayedAt, now)
}

/** « 48 matchs · 12 classés · dernier match il y a 5 min » (« … aujourd’hui » without times, profile/times.ts) */
export function contextStripText(
  matchCount: number,
  rankedCount: number,
  lastPlayedAt: string,
  now: Date,
  withTime: boolean,
): string {
  const last = lastPlayedText(lastPlayedAt, now, withTime)
  return `${plural(matchCount, 'match')} · ${plural(rankedCount, 'classé')} · dernier match ${last}`
}

/** « 12 joueurs · 2 invités » / « 1 joueur » */
export function playerCountText(players: Player[]): string {
  const guests = players.filter((player) => player.isGuest).length
  const base = plural(players.length, 'joueur')
  if (guests === 0) return base
  return `${base} · ${plural(guests, 'invité')}`
}

/** Matches before entering the main ranking (the 2V2 and 1V1 rankings use 3, see src/rating/modes.ts). */
export const RANKED_AFTER = 10

/**
 * « 3e sur 12 » / « Pas encore classé · 4/10 matchs » / « Inactif · dernier match il y a 42 j ». `rankedAfter` is the
 * threshold of the ranking the stats come from (3 on the duo page).
 */
export function heroCaption(
  stats: PlayerStats,
  ranking: Ranking,
  now: Date,
  rankedAfter: number = RANKED_AFTER,
): string {
  const rank = rankIndexOf(ranking, stats.playerId)
  if (rank !== null) return `${fmtOrdinal(rank)} sur ${fmtInt(ranking.ranked.length)}`
  if (stats.status === 'inactive' && stats.lastPlayedAt !== undefined) {
    return `Inactif · dernier match il y a ${fmtInt(daysSince(stats.lastPlayedAt, now))} j`
  }
  return `Pas encore classé · ${fmtInt(stats.rookieProgress)}/${fmtInt(rankedAfter)} matchs`
}

function modeStanding(stats: PlayerStats, ranking: Ranking): string {
  const rank = rankIndexOf(ranking, stats.playerId)
  if (rank !== null) return fmtOrdinal(rank)
  if (stats.status === 'inactive') return 'inactif'
  return 'pas encore classé'
}

/** Player page, under the hero caption: « 1V1 : 1 032 · 2e » (or « · pas encore classé » / « · inactif »). */
export function modeLineText(label: string, stats: PlayerStats, ranking: Ranking): string {
  return `${label} : ${fmtInt(stats.rating)} · ${modeStanding(stats, ranking)}`
}

/** The last 30 `ratingAfter` values, oldest first. */
export function sparklinePoints(stats: PlayerStats): number[] {
  return stats.history.slice(-SPARKLINE_POINTS).map((point) => point.ratingAfter)
}

/** « 30 derniers matchs · min 962 · max 1 041 », or the waiting line with fewer than 2 points. */
export function sparklineCaption(points: number[]): string {
  if (points.length < 2) return 'La courbe apparaîtra après quelques matchs.'
  const min = Math.min(...points)
  const max = Math.max(...points)
  return `${plural(points.length, 'dernier match', 'derniers matchs')} · min ${fmtInt(min)} · max ${fmtInt(max)}`
}

/** « 3 V · 1 D » */
export function recordText(record: { wins: number; losses: number }): string {
  return `${record.wins} V · ${record.losses} D`
}

/** « 60 % » (0 % before the first match). */
export function winRateText(stats: PlayerStats): string {
  if (stats.played === 0) return fmtPercent(0)
  return fmtPercent(stats.wins / stats.played)
}

function streakNoun(kind: Streak['kind']): string {
  if (kind === 'win') return 'victoire'
  return 'défaite'
}

/** « Série en cours : 3 victoires » / « Série en cours : 2 défaites »; null without a streak (< 2). */
export function streakText(streak: Streak | null): string | null {
  if (streak === null) return null
  return `Série en cours : ${plural(streak.length, streakNoun(streak.kind))}`
}

/** « Bob · 7 matchs ensemble · 71 % de victoires » / « Pas encore de partenaire » */
export function partnerText(partner: Partner | null, players: Map<PlayerId, Player>): string {
  if (partner === null) return 'Pas encore de partenaire'
  const name = players.get(partner.partnerId)?.name ?? '?'
  return `${name} · ${plural(partner.shared, 'match')} ensemble · ${fmtPercent(partner.winRate)} de victoires`
}

/** Whether the player has played at least one 2v2 match (the partner row is hidden otherwise). */
export function hasTwoVsTwo(playerId: PlayerId, matches: Match[]): boolean {
  return matches.some(
    (match) => match.teamA.length === 2 && (match.teamA.includes(playerId) || match.teamB.includes(playerId)),
  )
}

/** The player's last `limit` match ids, newest first. */
export function recentMatchIds(stats: PlayerStats, limit = RECENT_MATCHES): MatchId[] {
  return stats.history
    .slice(-limit)
    .reverse()
    .map((point) => point.matchId)
}
