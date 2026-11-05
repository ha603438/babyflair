import { announcersOf, betsOf } from './betStats'
import type { RatedBet } from './betStats'
import { rankBefore } from './rating'
import type { Rankings } from './rating/rankings'
import { localDayKey, localMidnight, recap } from './recap'
import type { HoldUp } from './recap'
import { EXPLOIT_MAX_CHANCE, replayOrder } from './records'
import { isComeback, isFanny } from './stats'
import type { HistoryPoint, Match, MatchResult, Player, PlayerId, PlayerStats, Team } from './types'

// « Récap du jour » of the player page: his latest day with a match (today when he played today), summed up from his
// side. Pure, no React and no copy: lists/playerDayLines.ts words it. Points and chances are each match's in the
// ranking of its format (a 1v1 by 1V1, a 2v2 by 2V2 mixte), the rank is the 2V2 mixte one. Days only, never a time.

/** Head-to-head losses needed for a « Bête noire du jour ». */
export const NEMESIS_MIN_LOSSES = 2

export type WinLoss = { wins: number; losses: number }
/** A teammate of the day (2v2): the player's own points in their matches together, and their record. */
export type PartnerDay = WinLoss & { partnerId: PlayerId; net: number }
/** An opponent of the day, from the player's side: his wins and losses against him. */
export type RivalDay = WinLoss & { opponentId: PlayerId }
/** A rating over the day: before its first match, after its last one (0.001-rounded, like the engine). */
export type RatingMove = { before: number; after: number }
/** The 2V2 mixte rank at the start and at the end of the day; null while not ranked. */
export type RankMove = { before: number | null; after: number | null }
/** `match`: the day's last match with one of them (the line's link). */
export type BetsDay = { made: number; won: number; points: number; match: Match }

export type PlayerDayRecap = {
  /** Local calendar day, « 2026-11-05 ». */
  key: string
  /** playedAt of the player's first match of the day: fmtDayHeader reads its day only. */
  date: string
  /** His matches of the day, in replay order. */
  matches: Match[]
  /** Net points: the sum of his deltas, each in its match's ranking. */
  net: number
  wins: number
  losses: number
  /** 2V2 mixte rating and rank, when he played 2v2 that day. */
  main: RatingMove | null
  rank: RankMove | null
  /** 1V1 rating, when he played 1v1 that day. */
  oneVsOne: RatingMove | null
  /** « Meilleur partenaire »: most points together (> 0 once rounded), then more wins, then name. */
  partner: PartnerDay | null
  /** « Bête noire »: most losses against him, NEMESIS_MIN_LOSSES at least, then fewer wins, then name. */
  nemesis: RivalDay | null
  /** « Plus beau coup »: his win he had the lowest chance of (under 50 %). */
  holdUp: HoldUp | null
  /** His team's announcements of the day; null without one. */
  bets: BetsDay | null
  fannyGiven: Match[]
  fannyTaken: Match[]
  comebackDone: Match[]
  comebackSuffered: Match[]
  /** The day's « Joueur du jour » / « Dans le dur » / « Nouveau n°1 » of the Récap is him. */
  hot: boolean
  cold: boolean
  newLeader: boolean
}

type Compare<T> = (a: T, b: T) => number

function winnerOf(match: Match): Team {
  if (match.scoreA === match.target) return 'A'
  return 'B'
}

function sideOf(match: Match, team: Team): PlayerId[] {
  if (team === 'A') return match.teamA
  return match.teamB
}

function teamOf(match: Match, playerId: PlayerId): Team | null {
  if (match.teamA.includes(playerId)) return 'A'
  if (match.teamB.includes(playerId)) return 'B'
  return null
}

function otherTeam(team: Team): Team {
  if (team === 'A') return 'B'
  return 'A'
}

function bestOf<T>(lines: T[], compare: Compare<T>): T | null {
  let best: T | null = null
  for (const line of lines) {
    if (best === null || compare(line, best) < 0) best = line
  }
  return best
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { sensitivity: 'base' })
}

/** Displayed points: the screens round every delta. */
function shown(net: number): number {
  return Math.round(net)
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000
}

function deltaOf(result: MatchResult | undefined, playerId: PlayerId): number {
  return result?.perPlayer.find((row) => row.playerId === playerId)?.delta ?? 0
}

function addRecord(record: WinLoss, won: boolean): void {
  if (won) {
    record.wins += 1
    return
  }
  record.losses += 1
}

// ---------------------------------------------------------------------------
// Ratings over the day
// ---------------------------------------------------------------------------

function pointsOfDay(stats: PlayerStats | undefined, key: string): HistoryPoint[] {
  return (stats?.history ?? []).filter((point) => localDayKey(point.playedAt) === key)
}

function moveOf(points: HistoryPoint[]): RatingMove | null {
  const first = points[0]
  const last = points.at(-1)
  if (first === undefined || last === undefined) return null
  return { before: first.ratingBefore, after: last.ratingAfter }
}

/** Ranks at the start and at the end of the day, both judged at the day's last match (like « Nouveau n°1 »). */
function rankOf(rankings: Rankings, players: Player[], playerId: PlayerId, day: Match[]): RankMove {
  const first = day[0]
  const at = Date.parse(day[day.length - 1].playedAt)
  return {
    before: rankBefore(rankings.main.result, players, playerId, localMidnight(first.playedAt, 0), at),
    after: rankBefore(rankings.main.result, players, playerId, localMidnight(first.playedAt, 1), at),
  }
}

// ---------------------------------------------------------------------------
// Partner, nemesis, best win
// ---------------------------------------------------------------------------

function partnersOf(playerId: PlayerId, mine: Match[], rankings: Rankings): PartnerDay[] {
  const byPartner = new Map<PlayerId, PartnerDay>()
  for (const match of mine) {
    const team = teamOf(match, playerId)
    if (team === null || match.teamA.length !== 2) continue
    const partnerId = sideOf(match, team).find((id) => id !== playerId)
    if (partnerId === undefined) continue
    const line = byPartner.get(partnerId) ?? { partnerId, net: 0, wins: 0, losses: 0 }
    line.net += deltaOf(rankings.byMatch.get(match.id), playerId)
    addRecord(line, winnerOf(match) === team)
    byPartner.set(partnerId, line)
  }
  return [...byPartner.values()]
}

function rivalsOf(playerId: PlayerId, mine: Match[]): RivalDay[] {
  const byOpponent = new Map<PlayerId, RivalDay>()
  for (const match of mine) {
    const team = teamOf(match, playerId)
    if (team === null) continue
    for (const opponentId of sideOf(match, otherTeam(team))) {
      const line = byOpponent.get(opponentId) ?? { opponentId, wins: 0, losses: 0 }
      addRecord(line, winnerOf(match) === team)
      byOpponent.set(opponentId, line)
    }
  }
  return [...byOpponent.values()]
}

function nameCompare<T>(byId: ReadonlyMap<PlayerId, Player>, idOf: (line: T) => PlayerId): Compare<T> {
  return (a, b) => compareNames(byId.get(idOf(a))?.name ?? '', byId.get(idOf(b))?.name ?? '')
}

function partnerOf(lines: PartnerDay[], byId: ReadonlyMap<PlayerId, Player>): PartnerDay | null {
  const byName = nameCompare<PartnerDay>(byId, (line) => line.partnerId)
  const winners = lines.filter((line) => shown(line.net) > 0)
  const best = bestOf(winners, (a, b) => shown(b.net) - shown(a.net) || b.wins - a.wins || byName(a, b))
  if (best === null) return null
  return { ...best, net: round3(best.net) }
}

function nemesisOf(lines: RivalDay[], byId: ReadonlyMap<PlayerId, Player>): RivalDay | null {
  const byName = nameCompare<RivalDay>(byId, (line) => line.opponentId)
  const beaten = lines.filter((line) => line.losses >= NEMESIS_MIN_LOSSES)
  return bestOf(beaten, (a, b) => b.losses - a.losses || a.wins - b.wins || byName(a, b))
}

function winnersChance(match: Match, result: MatchResult | undefined): number | null {
  if (result === undefined) return null
  if (winnerOf(match) === 'A') return result.expectedA
  return result.expectedB
}

/** Lowest chance first; ex æquo → the later match of the day. */
function holdUpOf(playerId: PlayerId, mine: Match[], rankings: Rankings): HoldUp | null {
  const lines: Array<HoldUp & { order: number }> = []
  for (const [order, match] of mine.entries()) {
    if (teamOf(match, playerId) !== winnerOf(match)) continue
    const chance = winnersChance(match, rankings.byMatch.get(match.id))
    if (chance === null || chance >= EXPLOIT_MAX_CHANCE) continue
    lines.push({ match, chance, order })
  }
  const best = bestOf(lines, (a, b) => a.chance - b.chance || b.order - a.order)
  if (best === null) return null
  return { match: best.match, chance: best.chance }
}

// ---------------------------------------------------------------------------
// Announcements, fanny, comebacks
// ---------------------------------------------------------------------------

function betsDayOf(playerId: PlayerId, mine: Match[], rankings: Rankings): BetsDay | null {
  const own: RatedBet[] = betsOf(mine, rankings).filter((rated) => announcersOf(rated).includes(playerId))
  const last = own.at(-1)
  if (last === undefined) return null
  return {
    match: last.match,
    made: own.length,
    won: own.filter((rated) => rated.bet.success).length,
    points: round3(own.reduce((sum, rated) => sum + rated.bet.delta, 0)),
  }
}

function splitByWinner(playerId: PlayerId, matches: Match[]): { won: Match[]; lost: Match[] } {
  const won: Match[] = []
  const lost: Match[] = []
  for (const match of matches) {
    if (teamOf(match, playerId) === winnerOf(match)) won.push(match)
    else lost.push(match)
  }
  return { won, lost }
}

// ---------------------------------------------------------------------------
// The day
// ---------------------------------------------------------------------------

/**
 * The player's latest day with a match, or null when he never played. `matches`: every stored match (the day's
 * « Joueur du jour » and « Nouveau n°1 » are judged on all of them); `rankings`: useReplay().rankings.
 */
export function playerDayRecap(
  playerId: PlayerId,
  players: Player[],
  matches: Match[],
  rankings: Rankings,
): PlayerDayRecap | null {
  const ordered = replayOrder(matches)
  const last = ordered.filter((match) => teamOf(match, playerId) !== null).at(-1)
  if (last === undefined) return null
  const key = localDayKey(last.playedAt)
  const day = ordered.filter((match) => localDayKey(match.playedAt) === key)
  const mine = day.filter((match) => teamOf(match, playerId) !== null)
  const byId = new Map(players.map((player) => [player.id, player]))

  const record = { net: 0, wins: 0, losses: 0 }
  for (const match of mine) {
    record.net += deltaOf(rankings.byMatch.get(match.id), playerId)
    addRecord(record, teamOf(match, playerId) === winnerOf(match))
  }
  const main = moveOf(pointsOfDay(rankings.main.result.byPlayer.get(playerId), key))
  const fannys = splitByWinner(playerId, mine.filter(isFanny))
  const comebacks = splitByWinner(playerId, mine.filter(isComeback))
  const global = recap(players, day, rankings, 1).days[0]

  return {
    key,
    date: mine[0].playedAt,
    matches: mine,
    net: round3(record.net),
    wins: record.wins,
    losses: record.losses,
    main,
    rank: main === null ? null : rankOf(rankings, players, playerId, day),
    oneVsOne: moveOf(pointsOfDay(rankings.oneVsOne.result.byPlayer.get(playerId), key)),
    partner: partnerOf(partnersOf(playerId, mine, rankings), byId),
    nemesis: nemesisOf(rivalsOf(playerId, mine), byId),
    holdUp: holdUpOf(playerId, mine, rankings),
    bets: betsDayOf(playerId, mine, rankings),
    fannyGiven: fannys.won,
    fannyTaken: fannys.lost,
    comebackDone: comebacks.won,
    comebackSuffered: comebacks.lost,
    hot: global?.hot?.playerId === playerId,
    cold: global?.cold?.playerId === playerId,
    newLeader: global?.newLeader === playerId,
  }
}
