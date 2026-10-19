import { announcedBets } from './bets'
import { betsOf, longestShot } from './betStats'
import type { RatedBet } from './betStats'
import { duoId, duoLabel } from './duo'
import type { DuoMembers } from './duo'
import { leaderBefore } from './rating'
import { EXPLOIT_MAX_CHANCE, replayOrder } from './records'
import { isComeback, isFanny } from './stats'
import type { Match, MatchResult, Player, PlayerId, ReplayResult, Team } from './types'

// Récap (`#/stats`, default segment of the Stats tab): one entry per local calendar day with at least one match, most
// recent first, with the day's highlights (Joueur du jour, Dans le dur, Duo du jour, Hold-up, Annonce du jour, fanny,
// comebacks, Nouveau n°1, Accro du jour). Pure, no React and no copy: lists/recapLines.ts words it,
// lists/RecapView.tsx lays it out. Points and chances are the Mixte replay `result`'s. Days only, never a time of day.

/** Days shown at first, and added by each « Jours précédents ». */
export const RECAP_DAYS_STEP = 3
/** « Duo du jour »: matches played together that day, at least. */
export const DUO_MIN_MATCHES = 2
/** « Accro du jour »: matches played that day, at least. */
export const ADDICT_MIN_MATCHES = 3

/** One player's day: net points (sum of his Mixte deltas, 0.001-rounded like the engine) and record. */
export type PlayerDay = { playerId: PlayerId; net: number; wins: number; losses: number }
/** One duo's day (2v2 matches together): the net points of both members together and the record. */
export type DuoDay = { members: DuoMembers; net: number; wins: number; losses: number }
/** `chance`: the winners' expected score before the match (0..1). */
export type HoldUp = { match: Match; chance: number }

export type RecapDay = {
  /** Local calendar day, « 2026-10-15 ». */
  key: string
  /** playedAt of the day's first match: fmtDayHeader reads its day only. */
  date: string
  /** The day's matches in replay order. */
  matches: Match[]
  playerCount: number
  /** « 🔥 Joueur du jour »: best net points (> 0 once rounded). */
  hot: PlayerDay | null
  /** « 🧊 Dans le dur »: worst net points (< 0 once rounded). */
  cold: PlayerDay | null
  /** « 🤝 Duo du jour »: most wins together, DUO_MIN_MATCHES matches together and one win at least. */
  duo: DuoDay | null
  /** « 💰 Hold-up du jour »: the win the winners had the lowest chance of (under 50 %). */
  holdUp: HoldUp | null
  /** Announcements of the day, one per announcing team. */
  betCount: number
  /** « 🎯 Annonce du jour »: the successful announcement with the lowest chance (the later one on a tie). */
  bet: RatedBet | null
  /** « 🍑 Fanny » and « 🔁 Comeback »: every one of the day, in replay order. */
  fannys: Match[]
  comebacks: Match[]
  /** « 👑 Nouveau n°1 »: the Mixte leader at the end of the day, when another one led at its start. */
  newLeader: PlayerId | null
  /** « 🏃 Accro du jour »: most matches played (ADDICT_MIN_MATCHES at least). */
  addict: PlayerDay | null
}

export type Recap = { days: RecapDay[]; hasMore: boolean }

type DayGroup = { key: string; matches: Match[] }
type Context = { players: Player[]; byId: ReadonlyMap<PlayerId, Player>; result: ReplayResult }
type Compare<T> = (a: T, b: T) => number

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** « 2026-10-15 »: the local calendar day of an ISO instant. */
export function localDayKey(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local midnight of the day of `iso`, `offset` days later (ms); DST-safe since the Date constructor normalises. */
function localMidnight(iso: string, offset: number): number {
  const date = new Date(iso)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset).getTime()
}

/** The matches grouped by local calendar day: most recent day first, each day in replay order. */
export function groupByDay(matches: Match[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const match of replayOrder(matches)) {
    const key = localDayKey(match.playedAt)
    const last = groups.at(-1)
    if (last !== undefined && last.key === key) {
      last.matches.push(match)
      continue
    }
    groups.push({ key, matches: [match] })
  }
  return groups.reverse()
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function winnerOf(match: Match): Team {
  if (match.scoreA === match.target) return 'A'
  return 'B'
}

function sideOf(match: Match, team: Team): PlayerId[] {
  if (team === 'A') return match.teamA
  return match.teamB
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { sensitivity: 'base' })
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0
  if (a < b) return -1
  return 1
}

function nameOf(context: Context, id: PlayerId): string {
  return context.byId.get(id)?.name ?? ''
}

/** The first line in `compare` order, null when there is none. */
function bestOf<T>(lines: T[], compare: Compare<T>): T | null {
  let best: T | null = null
  for (const line of lines) {
    if (best === null || compare(line, best) < 0) best = line
  }
  return best
}

/** Displayed points: the screens round every delta, so two players showing the same figure are ex æquo. */
function shown(net: number): number {
  return Math.round(net)
}

function deltasOf(result: MatchResult | undefined): Map<PlayerId, number> {
  return new Map((result?.perPlayer ?? []).map((row) => [row.playerId, row.delta]))
}

function addResult(record: { net: number; wins: number; losses: number }, delta: number, won: boolean): void {
  record.net += delta
  if (won) {
    record.wins += 1
    return
  }
  record.losses += 1
}

function playedOf(line: { wins: number; losses: number }): number {
  return line.wins + line.losses
}

// ---------------------------------------------------------------------------
// Players: Joueur du jour, Dans le dur, Accro du jour
// ---------------------------------------------------------------------------

function playerDays(day: Match[], result: ReplayResult): PlayerDay[] {
  const byPlayer = new Map<PlayerId, PlayerDay>()
  for (const match of day) {
    const deltas = deltasOf(result.byMatch.get(match.id))
    const winner = winnerOf(match)
    for (const team of ['A', 'B'] as const) {
      for (const playerId of sideOf(match, team)) {
        const line = byPlayer.get(playerId) ?? { playerId, net: 0, wins: 0, losses: 0 }
        addResult(line, deltas.get(playerId) ?? 0, team === winner)
        byPlayer.set(playerId, line)
      }
    }
  }
  return [...byPlayer.values()]
}

function byName(context: Context): Compare<PlayerDay> {
  return (a, b) =>
    compareNames(nameOf(context, a.playerId), nameOf(context, b.playerId)) || compareIds(a.playerId, b.playerId)
}

/** Best net points first; ex æquo → more wins, then name. */
function hotOf(lines: PlayerDay[], context: Context): PlayerDay | null {
  const winners = lines.filter((line) => shown(line.net) > 0)
  return bestOf(winners, (a, b) => shown(b.net) - shown(a.net) || b.wins - a.wins || byName(context)(a, b))
}

/** Worst net points first; ex æquo → more losses, then name. */
function coldOf(lines: PlayerDay[], context: Context): PlayerDay | null {
  const losers = lines.filter((line) => shown(line.net) < 0)
  return bestOf(losers, (a, b) => shown(a.net) - shown(b.net) || b.losses - a.losses || byName(context)(a, b))
}

/** Most matches first; ex æquo → more wins, then name. */
function addictOf(lines: PlayerDay[], context: Context): PlayerDay | null {
  const regulars = lines.filter((line) => playedOf(line) >= ADDICT_MIN_MATCHES)
  return bestOf(regulars, (a, b) => playedOf(b) - playedOf(a) || b.wins - a.wins || byName(context)(a, b))
}

// ---------------------------------------------------------------------------
// Duo du jour
// ---------------------------------------------------------------------------

function duoDays(day: Match[], result: ReplayResult): DuoDay[] {
  const byDuo = new Map<string, DuoDay>()
  for (const match of day) {
    if (match.teamA.length !== 2) continue
    const deltas = deltasOf(result.byMatch.get(match.id))
    const winner = winnerOf(match)
    for (const team of ['A', 'B'] as const) {
      const [a, b] = sideOf(match, team)
      const id = duoId(a, b)
      const line = byDuo.get(id) ?? { members: [a, b] as const, net: 0, wins: 0, losses: 0 }
      addResult(line, (deltas.get(a) ?? 0) + (deltas.get(b) ?? 0), team === winner)
      byDuo.set(id, line)
    }
  }
  return [...byDuo.values()]
}

function duoName(context: Context, line: DuoDay): string {
  return duoLabel(line.members, context.byId)
}

/** Most wins first; ex æquo → better net points, then the duo's name (« A & B »). */
function duoOf(day: Match[], context: Context): DuoDay | null {
  const lines = duoDays(day, context.result).filter((line) => playedOf(line) >= DUO_MIN_MATCHES && line.wins > 0)
  return bestOf(
    lines,
    (a, b) =>
      b.wins - a.wins ||
      shown(b.net) - shown(a.net) ||
      compareNames(duoName(context, a), duoName(context, b)) ||
      compareIds(duoId(...a.members), duoId(...b.members)),
  )
}

// ---------------------------------------------------------------------------
// Hold-up du jour
// ---------------------------------------------------------------------------

function winnersChance(match: Match, result: MatchResult | undefined): number | null {
  if (result === undefined) return null
  if (winnerOf(match) === 'A') return result.expectedA
  return result.expectedB
}

/** Lowest chance first; ex æquo → the later match of the day. */
function holdUpOf(day: Match[], result: ReplayResult): HoldUp | null {
  const lines: Array<HoldUp & { order: number }> = []
  for (const [order, match] of day.entries()) {
    const chance = winnersChance(match, result.byMatch.get(match.id))
    if (chance === null || chance >= EXPLOIT_MAX_CHANCE) continue
    lines.push({ match, chance, order })
  }
  const best = bestOf(lines, (a, b) => a.chance - b.chance || b.order - a.order)
  if (best === null) return null
  return { match: best.match, chance: best.chance }
}

// ---------------------------------------------------------------------------
// Annonces
// ---------------------------------------------------------------------------

function betCountOf(day: Match[]): number {
  return day.reduce((count, match) => count + announcedBets(match).length, 0)
}

// ---------------------------------------------------------------------------
// Nouveau n°1
// ---------------------------------------------------------------------------

/**
 * The Mixte leader after the day's matches when it differs from the leader before them. Both rankings are judged at
 * the day's last match (ranked after 10 matches, inactive after 30 days, like the Classement), so only the day's
 * matches can change the leader. Nobody ranked before the day → no new leader.
 */
function newLeaderOf(day: Match[], context: Context): PlayerId | null {
  const first = day[0]
  const last = day.at(-1)
  if (first === undefined || last === undefined) return null
  const at = Date.parse(last.playedAt)
  const before = leaderBefore(context.result, context.players, localMidnight(first.playedAt, 0), at)
  if (before === null) return null
  const after = leaderBefore(context.result, context.players, localMidnight(first.playedAt, 1), at)
  if (after === null || after === before) return null
  return after
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

function playerCountOf(day: Match[]): number {
  return new Set(day.flatMap((match) => [...match.teamA, ...match.teamB])).size
}

function recapDay(group: DayGroup, context: Context): RecapDay {
  const { matches } = group
  const players = playerDays(matches, context.result)
  return {
    key: group.key,
    date: matches[0].playedAt,
    matches,
    playerCount: playerCountOf(matches),
    hot: hotOf(players, context),
    cold: coldOf(players, context),
    duo: duoOf(matches, context),
    holdUp: holdUpOf(matches, context.result),
    betCount: betCountOf(matches),
    bet: longestShot(betsOf(matches, context.result)),
    fannys: matches.filter(isFanny),
    comebacks: matches.filter(isComeback),
    newLeader: newLeaderOf(matches, context),
    addict: addictOf(players, context),
  }
}

/** The `dayCount` most recent days with at least one match, most recent first; `hasMore` when older days exist. */
export function recap(players: Player[], matches: Match[], result: ReplayResult, dayCount: number): Recap {
  const groups = groupByDay(matches)
  const context: Context = { players, byId: new Map(players.map((player) => [player.id, player])), result }
  const days = groups.slice(0, dayCount).map((group) => recapDay(group, context))
  return { days, hasMore: groups.length > dayCount }
}

/** A match read from the winners' side: their ids and goals first, then the losers'. */
export type WinnersFirst = { winners: PlayerId[]; losers: PlayerId[]; won: number; lost: number }

export function winnersFirst(match: Match): WinnersFirst {
  const { teamA, teamB, scoreA, scoreB } = match
  if (winnerOf(match) === 'A') return { winners: teamA, losers: teamB, won: scoreA, lost: scoreB }
  return { winners: teamB, losers: teamA, won: scoreB, lost: scoreA }
}
