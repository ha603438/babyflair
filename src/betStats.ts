import { duoSide } from './duoStats'
import type { DuoId } from './duo'
import type { BetOutcome, Match, MatchId, PlayerId, ReplayResult, Team } from './types'

// Statistics on the « annonces d'écart » (src/bets.ts): the « 🎯 Annonces » card of the player and duo pages, the
// tallies of the Hall of Flair section « Couilles sur la table » (src/records.ts) and the « Annonce du jour » of the
// Récap (src/recap.ts). Pure, no React and no copy. Chances, successes and points are the replay's (MatchResult.bets):
// nothing here rates anything. Players are counted individually: each member of an announcing team announced.

/** One announcement of a match, as rated by the replay. */
export type RatedBet = { match: Match; bet: BetOutcome }

/** The side a player or a duo played in a match; null when it did not play it. */
export type SideOf = (match: Match) => Team | null

/** A player's (or a duo's) announcements, and the ones the other team made against them. */
export type BetRecord = {
  /** Announcements of the subject's team. */
  made: number
  /** Of which successful. */
  won: number
  /** Net points of those announcements, per member: the sum of their bet deltas (0.001-rounded, like the engine). */
  points: number
  /** The successful announcement with the lowest chance (the later one on a tie); null without a success. */
  best: RatedBet | null
  /** Announcements of the opposing team… */
  faced: number
  /** …of which failed (« a fait tomber »). */
  broken: number
}

/** One player over every match: announcements made, successful, and opponents' announcements that failed. */
export type PlayerBetTally = { playerId: PlayerId; made: number; won: number; broken: number }

function sideOf(match: Match, team: Team): PlayerId[] {
  if (team === 'A') return match.teamA
  return match.teamB
}

function otherTeam(team: Team): Team {
  if (team === 'A') return 'B'
  return 'A'
}

/** The announcements of `matches`, in their order (Blancs first within a match), as rated by `result`. */
export function betsOf(matches: Iterable<Match>, result: ReplayResult): RatedBet[] {
  const bets: RatedBet[] = []
  for (const match of matches) {
    for (const bet of result.byMatch.get(match.id)?.bets ?? []) bets.push({ match, bet })
  }
  return bets
}

/** The matches `result` replayed, in replay order (the order of byMatch); an id missing from `matches` is skipped. */
export function replayedMatches(result: ReplayResult, matches: ReadonlyMap<MatchId, Match>): Match[] {
  const ordered: Match[] = []
  for (const id of result.byMatch.keys()) {
    const match = matches.get(id)
    if (match !== undefined) ordered.push(match)
  }
  return ordered
}

/** The players of the announcing team, in recorded order. */
export function announcersOf({ match, bet }: RatedBet): PlayerId[] {
  return sideOf(match, bet.team)
}

/** The players of the team the announcement was made against. */
export function opponentsOf({ match, bet }: RatedBet): PlayerId[] {
  return sideOf(match, otherTeam(bet.team))
}

/** The successful announcement with the lowest chance, the later one on a tie (`bets` in replay order). */
export function longestShot(bets: RatedBet[]): RatedBet | null {
  let best: RatedBet | null = null
  for (const rated of bets) {
    if (!rated.bet.success) continue
    if (best === null || rated.bet.chance <= best.bet.chance) best = rated
  }
  return best
}

// ---------------------------------------------------------------------------
// Player and duo pages
// ---------------------------------------------------------------------------

function ownRecord(own: RatedBet[]): Pick<BetRecord, 'made' | 'won' | 'points' | 'best'> {
  return {
    made: own.length,
    won: own.filter((rated) => rated.bet.success).length,
    points: own.reduce((sum, rated) => sum + rated.bet.delta, 0),
    best: longestShot(own),
  }
}

/** The record of whoever plays `side` (a player, a duo) over `bets`, in replay order. */
export function betRecord(bets: RatedBet[], side: SideOf): BetRecord {
  const own: RatedBet[] = []
  const against: RatedBet[] = []
  for (const rated of bets) {
    const played = side(rated.match)
    if (played === null) continue
    if (played === rated.bet.team) own.push(rated)
    else against.push(rated)
  }
  const broken = against.filter((rated) => !rated.bet.success).length
  return { ...ownRecord(own), faced: against.length, broken }
}

function playerSide(playerId: PlayerId): SideOf {
  return (match) => {
    if (match.teamA.includes(playerId)) return 'A'
    if (match.teamB.includes(playerId)) return 'B'
    return null
  }
}

/** A player's announcements over the Mixte replay `result` (every match he played, 1v1 and 2v2). */
export function playerBetRecord(
  playerId: PlayerId,
  result: ReplayResult,
  matches: ReadonlyMap<MatchId, Match>,
): BetRecord {
  return betRecord(betsOf(replayedMatches(result, matches), result), playerSide(playerId))
}

/** A duo's announcements made together, over the 2V2 replay `result` (its chances and points are the duo's). */
export function duoBetRecord(id: DuoId, result: ReplayResult, matches: ReadonlyMap<MatchId, Match>): BetRecord {
  return betRecord(betsOf(replayedMatches(result, matches), result), (match) => duoSide(id, match))
}

// ---------------------------------------------------------------------------
// Hall of Flair
// ---------------------------------------------------------------------------

function tallyOf(byPlayer: Map<PlayerId, PlayerBetTally>, playerId: PlayerId): PlayerBetTally {
  const known = byPlayer.get(playerId)
  if (known !== undefined) return known
  const tally = { playerId, made: 0, won: 0, broken: 0 }
  byPlayer.set(playerId, tally)
  return tally
}

function addMade(tally: PlayerBetTally, success: boolean): void {
  tally.made += 1
  if (success) tally.won += 1
}

/** Every player who announced or saw an opponent's announcement fail, with his tally. */
export function betTallies(bets: RatedBet[]): PlayerBetTally[] {
  const byPlayer = new Map<PlayerId, PlayerBetTally>()
  for (const rated of bets) {
    for (const id of announcersOf(rated)) addMade(tallyOf(byPlayer, id), rated.bet.success)
    if (rated.bet.success) continue
    for (const id of opponentsOf(rated)) tallyOf(byPlayer, id).broken += 1
  }
  return [...byPlayer.values()]
}
