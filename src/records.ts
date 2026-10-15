import { duoId, duoLabel } from './duo'
import type { DuoId, DuoMembers } from './duo'
import { isComeback, isFanny, positionOf } from './stats'
import type { Position } from './stats'
import type { HistoryPoint, Match, MatchId, MatchResult, Player, PlayerId, ReplayResult, Team } from './types'

// Top stats (`#/top`): all-time records over every match of the Mixte history, every player included (guests and
// inactive ones too). Each record is a podium: the top 3 lines in competition ranking (ex æquo share their rank
// number, the next rank skips: 1, 1, 3), plus how many more lines tie with the 3rd. Pure, no React: the page
// memoises topRecords() on the store's players / matches and the Mixte replay result.

export const PODIUM_SIZE = 3
/** Matches at a position (2v2) before a player can be « Meilleur avant » / « Meilleur arrière ». */
export const MIN_POSITION_MATCHES = 5
/** A run of one result is not a series: same threshold as the « Série en cours » line of the player page. */
export const MIN_STREAK = 2
/** An exploit is a win the winners were given less than an even chance of (their expected score before the match). */
export const EXPLOIT_MAX_CHANCE = 0.5

type Outcome = 'win' | 'loss'

export type Placed<T> = { rank: number; line: T }
export type Podium<T> = {
  /** At most PODIUM_SIZE lines, best first. */
  places: Placed<T>[]
  /** Lines left out of the podium that share the rank of its last line. */
  tiedBeyond: number
}

export type PositionLine = { playerId: PlayerId; wins: number; losses: number }
export type StreakLine = {
  playerId: PlayerId
  kind: Outcome
  length: number
  /** playedAt of the first and of the last match of the run. */
  from: string
  to: string
  lastMatchId: MatchId
  /** The run ends with the player's latest match: it is still going. */
  ongoing: boolean
}
export type CountLine = { playerId: PlayerId; count: number }
/** `rating`: the peak, rounded like the app; `matchId` / `playedAt`: the match that reached it first. */
export type PeakLine = { playerId: PlayerId; rating: number; matchId: MatchId; playedAt: string }
/** `chance`: the winners' expected score before the match (0..1). */
export type ExploitLine = { matchId: MatchId; winners: PlayerId[]; chance: number; playedAt: string }
/** `delta`: the engine's delta (0.001-rounded); the page rounds it like everywhere else. */
export type GainLine = { matchId: MatchId; playerId: PlayerId; delta: number; playedAt: string }
export type DuoLine = { duoId: DuoId; members: DuoMembers; matches: number; wins: number; losses: number }
/** Two opponents, the one with more wins against the other first (then by name); `wins` in the same order. */
export type RivalryLine = { players: [PlayerId, PlayerId]; matches: number; wins: [number, number] }

export type TopRecords = {
  avant: Podium<PositionLine>
  arriere: Podium<PositionLine>
  winStreak: Podium<StreakLine>
  lossStreak: Podium<StreakLine>
  fannyGiven: Podium<CountLine>
  fannyTaken: Podium<CountLine>
  comebacks: Podium<CountLine>
  peak: Podium<PeakLine>
  exploit: Podium<ExploitLine>
  gain: Podium<GainLine>
  played: Podium<CountLine>
  duo: Podium<DuoLine>
  rivalry: Podium<RivalryLine>
}

/** How a record sorts its lines (best first) and which neighbours are ex æquo. */
export type Ranking<T> = { compare: (a: T, b: T) => number; tied: (a: T, b: T) => boolean }

type Context = { players: ReadonlyMap<PlayerId, Player>; orderOf: ReadonlyMap<MatchId, number> }

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { sensitivity: 'base' })
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0
  if (a < b) return -1
  return 1
}

function nameOf(context: Context, id: PlayerId): string {
  return context.players.get(id)?.name ?? ''
}

function byName(context: Context, a: PlayerId, b: PlayerId): number {
  return compareNames(nameOf(context, a), nameOf(context, b))
}

/** Replay index of a match (−1 when unknown): higher is more recent. */
function orderOf(context: Context, id: MatchId): number {
  return context.orderOf.get(id) ?? -1
}

function winnerOf(match: Match): Team {
  if (match.scoreA === match.target) return 'A'
  return 'B'
}

function sideOf(match: Match, team: Team): PlayerId[] {
  if (team === 'A') return match.teamA
  return match.teamB
}

function otherTeam(team: Team): Team {
  if (team === 'A') return 'B'
  return 'A'
}

/** The two teams of a match with their result: winners first. */
function sidesOf(match: Match): Array<[PlayerId[], Outcome]> {
  const winner = winnerOf(match)
  return [
    [sideOf(match, winner), 'win'],
    [sideOf(match, otherTeam(winner)), 'loss'],
  ]
}

function outcomesOf(match: Match): Array<[PlayerId, Outcome]> {
  return sidesOf(match).flatMap(([ids, outcome]) => ids.map((id): [PlayerId, Outcome] => [id, outcome]))
}

function addOutcome(record: { wins: number; losses: number }, outcome: Outcome): void {
  if (outcome === 'win') {
    record.wins += 1
    return
  }
  record.losses += 1
}

/** The two ids sorted (a duo, or a pair of opponents). */
function pairOf(a: PlayerId, b: PlayerId): [PlayerId, PlayerId] {
  if (b < a) return [b, a]
  return [a, b]
}

// Same order as the engine replay (src/rating/engine.ts orderMatches): playedAt, then seq, then id.
function compareReplay(a: Match, b: Match): number {
  const time = Date.parse(a.playedAt) - Date.parse(b.playedAt)
  if (time !== 0) return time
  if (a.seq !== b.seq) return a.seq - b.seq
  return compareIds(a.id, b.id)
}

/** The matches in replay order (a sorted copy). */
export function replayOrder(matches: Match[]): Match[] {
  return [...matches].sort(compareReplay)
}

// ---------------------------------------------------------------------------
// Podium
// ---------------------------------------------------------------------------

function rankAt<T>(sorted: T[], ranks: number[], index: number, tied: Ranking<T>['tied']): number {
  if (index > 0 && tied(sorted[index - 1], sorted[index])) return ranks[index - 1]
  return index + 1
}

function tiedBeyond(ranks: number[]): number {
  if (ranks.length <= PODIUM_SIZE) return 0
  const last = ranks[PODIUM_SIZE - 1]
  return ranks.slice(PODIUM_SIZE).filter((rank) => rank === last).length
}

/** Sorts the lines, ranks them (ex æquo share the rank of the first of them) and keeps the top PODIUM_SIZE. */
export function podium<T>(lines: T[], ranking: Ranking<T>): Podium<T> {
  const sorted = [...lines].sort(ranking.compare)
  const ranks: number[] = []
  for (const index of sorted.keys()) ranks.push(rankAt(sorted, ranks, index, ranking.tied))
  const places = sorted.slice(0, PODIUM_SIZE).map((line, index) => ({ rank: ranks[index], line }))
  return { places, tiedBeyond: tiedBeyond(ranks) }
}

// ---------------------------------------------------------------------------
// Postes: best win rate at a position (2v2), at least MIN_POSITION_MATCHES there
// ---------------------------------------------------------------------------

function playedOf(line: PositionLine): number {
  return line.wins + line.losses
}

function positionLines(matches: Match[], position: Position): PositionLine[] {
  const byPlayer = new Map<PlayerId, PositionLine>()
  for (const match of matches) {
    for (const [playerId, outcome] of outcomesOf(match)) {
      if (positionOf(playerId, match) !== position) continue
      const line = byPlayer.get(playerId) ?? { playerId, wins: 0, losses: 0 }
      addOutcome(line, outcome)
      byPlayer.set(playerId, line)
    }
  }
  return [...byPlayer.values()].filter((line) => playedOf(line) >= MIN_POSITION_MATCHES)
}

// Cross-multiplied win rates: exact integer comparison, no float noise. Positive when `a` has the better rate.
function compareRates(a: PositionLine, b: PositionLine): number {
  return a.wins * playedOf(b) - b.wins * playedOf(a)
}

/** Win rate, then more matches at the position, then name; ex æquo on the same rate over the same matches. */
function positionRanking(context: Context): Ranking<PositionLine> {
  return {
    compare: (a, b) => compareRates(b, a) || playedOf(b) - playedOf(a) || byName(context, a.playerId, b.playerId),
    tied: (a, b) => compareRates(a, b) === 0 && playedOf(a) === playedOf(b),
  }
}

// ---------------------------------------------------------------------------
// Séries: each player's longest run of wins / losses in replay order (the most recent of equal runs)
// ---------------------------------------------------------------------------

/** `first` / `last`: replay indexes of the run's first and last matches. */
type Run = { kind: Outcome; length: number; first: number; last: number }
type PlayerRuns = { current: Run | null; win: Run | null; loss: Run | null; lastIndex: number }

function extendRun(run: Run | null, outcome: Outcome, index: number): Run {
  if (run === null || run.kind !== outcome) return { kind: outcome, length: 1, first: index, last: index }
  return { ...run, length: run.length + 1, last: index }
}

// `>=`: of two runs of the same length, the later one is kept.
function longer(best: Run | null, run: Run): Run {
  if (best === null || run.length >= best.length) return run
  return best
}

function playerRuns(ordered: Match[]): Map<PlayerId, PlayerRuns> {
  const runs = new Map<PlayerId, PlayerRuns>()
  for (const [index, match] of ordered.entries()) {
    for (const [playerId, outcome] of outcomesOf(match)) {
      const state = runs.get(playerId) ?? { current: null, win: null, loss: null, lastIndex: -1 }
      const current = extendRun(state.current, outcome, index)
      state.current = current
      state.lastIndex = index
      state[outcome] = longer(state[outcome], current)
      runs.set(playerId, state)
    }
  }
  return runs
}

function streakLine(playerId: PlayerId, run: Run, state: PlayerRuns, ordered: Match[]): StreakLine {
  const last = ordered[run.last]
  return {
    playerId,
    kind: run.kind,
    length: run.length,
    from: ordered[run.first].playedAt,
    to: last.playedAt,
    lastMatchId: last.id,
    ongoing: run.last === state.lastIndex,
  }
}

function streakLines(runs: Map<PlayerId, PlayerRuns>, kind: Outcome, ordered: Match[]): StreakLine[] {
  const lines: StreakLine[] = []
  for (const [playerId, state] of runs) {
    const run = state[kind]
    if (run === null || run.length < MIN_STREAK) continue
    lines.push(streakLine(playerId, run, state, ordered))
  }
  return lines
}

/** Longest first; same length → ex æquo, the most recent run first, then name. */
function streakRanking(context: Context): Ranking<StreakLine> {
  const recency = (a: StreakLine, b: StreakLine): number =>
    orderOf(context, b.lastMatchId) - orderOf(context, a.lastMatchId)
  return {
    compare: (a, b) => b.length - a.length || recency(a, b) || byName(context, a.playerId, b.playerId),
    tied: (a, b) => a.length === b.length,
  }
}

// ---------------------------------------------------------------------------
// Counts: fannys given / conceded, comebacks made, matches played (at least 1)
// ---------------------------------------------------------------------------

type Counts = {
  fannyGiven: Map<PlayerId, number>
  fannyTaken: Map<PlayerId, number>
  comebacks: Map<PlayerId, number>
  played: Map<PlayerId, number>
}

function bump(counts: Map<PlayerId, number>, ids: PlayerId[]): void {
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
}

function countAll(matches: Match[]): Counts {
  const counts: Counts = { fannyGiven: new Map(), fannyTaken: new Map(), comebacks: new Map(), played: new Map() }
  for (const match of matches) {
    const [[winners], [losers]] = sidesOf(match)
    bump(counts.played, [...winners, ...losers])
    if (isFanny(match)) {
      bump(counts.fannyGiven, winners)
      bump(counts.fannyTaken, losers)
    }
    if (isComeback(match)) bump(counts.comebacks, winners)
  }
  return counts
}

function countLines(counts: Map<PlayerId, number>): CountLine[] {
  return [...counts].map(([playerId, count]) => ({ playerId, count })).filter((line) => line.count >= 1)
}

/** Highest count first; same count → ex æquo, by name. */
function countRanking(context: Context): Ranking<CountLine> {
  return {
    compare: (a, b) => b.count - a.count || byName(context, a.playerId, b.playerId),
    tied: (a, b) => a.count === b.count,
  }
}

// ---------------------------------------------------------------------------
// Points (Mixte replay): peak rating, biggest upsets, biggest single-match gains
// ---------------------------------------------------------------------------

/** The point with the highest ratingAfter (the first one on a tie). */
function peakOf(history: HistoryPoint[]): HistoryPoint | null {
  let best: HistoryPoint | null = null
  for (const point of history) {
    if (best === null || point.ratingAfter > best.ratingAfter) best = point
  }
  return best
}

function peakLines(result: ReplayResult): PeakLine[] {
  const lines: PeakLine[] = []
  for (const stats of result.byPlayer.values()) {
    const point = peakOf(stats.history)
    if (point === null) continue
    const { matchId, playedAt } = point
    lines.push({ playerId: stats.playerId, rating: Math.round(point.ratingAfter), matchId, playedAt })
  }
  return lines
}

/** Highest peak first; same rounded peak → ex æquo, the first to reach it first, then name. */
function peakRanking(context: Context): Ranking<PeakLine> {
  return {
    compare: (a, b) =>
      b.rating - a.rating ||
      orderOf(context, a.matchId) - orderOf(context, b.matchId) ||
      byName(context, a.playerId, b.playerId),
    tied: (a, b) => a.rating === b.rating,
  }
}

function winnersChance(result: MatchResult, winner: Team): number {
  if (winner === 'A') return result.expectedA
  return result.expectedB
}

function exploitLine(match: Match, result: MatchResult | undefined): ExploitLine | null {
  if (result === undefined) return null
  const winner = winnerOf(match)
  const chance = winnersChance(result, winner)
  if (chance >= EXPLOIT_MAX_CHANCE) return null
  return { matchId: match.id, winners: sideOf(match, winner), chance, playedAt: match.playedAt }
}

function exploitLines(ordered: Match[], result: ReplayResult): ExploitLine[] {
  const lines: ExploitLine[] = []
  for (const match of ordered) {
    const line = exploitLine(match, result.byMatch.get(match.id))
    if (line !== null) lines.push(line)
  }
  return lines
}

function percentOf(chance: number): number {
  return Math.round(chance * 100)
}

/** Lowest chance first, the most recent match first on a tie; ex æquo on the same displayed percentage. */
function exploitRanking(context: Context): Ranking<ExploitLine> {
  return {
    compare: (a, b) =>
      a.chance - b.chance ||
      orderOf(context, b.matchId) - orderOf(context, a.matchId) ||
      compareIds(a.matchId, b.matchId),
    tied: (a, b) => percentOf(a.chance) === percentOf(b.chance),
  }
}

function gainLines(ordered: Match[], result: ReplayResult): GainLine[] {
  const lines: GainLine[] = []
  for (const match of ordered) {
    const players = result.byMatch.get(match.id)?.perPlayer ?? []
    for (const { playerId, delta } of players) {
      if (delta > 0) lines.push({ matchId: match.id, playerId, delta, playedAt: match.playedAt })
    }
  }
  return lines
}

/** Biggest delta first, then the most recent match, then name; ex æquo on the same rounded delta. */
function gainRanking(context: Context): Ranking<GainLine> {
  return {
    compare: (a, b) =>
      b.delta - a.delta ||
      orderOf(context, b.matchId) - orderOf(context, a.matchId) ||
      byName(context, a.playerId, b.playerId),
    tied: (a, b) => Math.round(a.delta) === Math.round(b.delta),
  }
}

// ---------------------------------------------------------------------------
// Fidélité: the duo with the most 2v2 matches together, the two players who faced each other most often
// ---------------------------------------------------------------------------

function duoLines(matches: Match[]): DuoLine[] {
  const byDuo = new Map<DuoId, DuoLine>()
  for (const match of matches) {
    for (const [team, outcome] of sidesOf(match)) {
      if (team.length !== 2) continue
      const id = duoId(team[0], team[1])
      const line = byDuo.get(id) ?? { duoId: id, members: pairOf(team[0], team[1]), matches: 0, wins: 0, losses: 0 }
      line.matches += 1
      addOutcome(line, outcome)
      byDuo.set(id, line)
    }
  }
  return [...byDuo.values()]
}

/** Most matches together first; same count → ex æquo, by the duo's name (« A & B »). */
function duoRanking(context: Context): Ranking<DuoLine> {
  const label = (line: DuoLine): string => duoLabel(line.members, context.players)
  return {
    compare: (a, b) => b.matches - a.matches || compareNames(label(a), label(b)),
    tied: (a, b) => a.matches === b.matches,
  }
}

/** Head-to-head tally of two opponents; `wins` follows the order of `ids` (sorted). */
type Faceoff = { ids: [PlayerId, PlayerId]; matches: number; wins: [number, number] }

function faceoffs(matches: Match[]): Faceoff[] {
  const byPair = new Map<string, Faceoff>()
  for (const match of matches) {
    const [[winners], [losers]] = sidesOf(match)
    for (const winner of winners) {
      for (const loser of losers) {
        const ids = pairOf(winner, loser)
        const key = ids.join('+')
        const faceoff = byPair.get(key) ?? { ids, matches: 0, wins: [0, 0] }
        faceoff.matches += 1
        faceoff.wins[ids.indexOf(winner)] += 1
        byPair.set(key, faceoff)
      }
    }
  }
  return [...byPair.values()]
}

// The one with more wins against the other comes first; on a level head-to-head, alphabetical order.
function leaderFirst(faceoff: Faceoff, context: Context): RivalryLine {
  const [a, b] = faceoff.ids
  const [winsA, winsB] = faceoff.wins
  const swap = winsB > winsA || (winsB === winsA && byName(context, b, a) < 0)
  if (swap) return { players: [b, a], matches: faceoff.matches, wins: [winsB, winsA] }
  return { players: [a, b], matches: faceoff.matches, wins: [winsA, winsB] }
}

function rivalryLines(matches: Match[], context: Context): RivalryLine[] {
  return faceoffs(matches).map((faceoff) => leaderFirst(faceoff, context))
}

/** Most matches against each other first; same count → ex æquo, by the pair's names. */
function rivalryRanking(context: Context): Ranking<RivalryLine> {
  const label = (line: RivalryLine): string => duoLabel(pairOf(...line.players), context.players)
  return {
    compare: (a, b) => b.matches - a.matches || compareNames(label(a), label(b)),
    tied: (a, b) => a.matches === b.matches,
  }
}

// ---------------------------------------------------------------------------
// All the records
// ---------------------------------------------------------------------------

function contextOf(players: Player[], ordered: Match[]): Context {
  return {
    players: new Map(players.map((player) => [player.id, player])),
    orderOf: new Map(ordered.map((match, index) => [match.id, index])),
  }
}

/** Every record of the Top stats page, over all `matches` (the Mixte history) and its replay `result`. */
export function topRecords(players: Player[], matches: Match[], result: ReplayResult): TopRecords {
  const ordered = replayOrder(matches)
  const context = contextOf(players, ordered)
  const runs = playerRuns(ordered)
  const counts = countAll(ordered)
  return {
    avant: podium(positionLines(ordered, 'avant'), positionRanking(context)),
    arriere: podium(positionLines(ordered, 'arriere'), positionRanking(context)),
    winStreak: podium(streakLines(runs, 'win', ordered), streakRanking(context)),
    lossStreak: podium(streakLines(runs, 'loss', ordered), streakRanking(context)),
    fannyGiven: podium(countLines(counts.fannyGiven), countRanking(context)),
    fannyTaken: podium(countLines(counts.fannyTaken), countRanking(context)),
    comebacks: podium(countLines(counts.comebacks), countRanking(context)),
    peak: podium(peakLines(result), peakRanking(context)),
    exploit: podium(exploitLines(ordered, result), exploitRanking(context)),
    gain: podium(gainLines(ordered, result), gainRanking(context)),
    played: podium(countLines(counts.played), countRanking(context)),
    duo: podium(duoLines(ordered), duoRanking(context)),
    rivalry: podium(rivalryLines(ordered, context), rivalryRanking(context)),
  }
}
