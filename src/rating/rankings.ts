// The three Classement rankings, each replayed from the whole history but over its own matches only:
//   - « 2V2 mixte », the main ranking: every player rated individually on the 2v2 matches, whoever the partner
//     (the engine's defaults: ranked after 10 matches, inactive after 30 days);
//   - « 2V2 équipes »: every duo rated as one entity on the 2v2 matches (./modes.ts, ranked after 3);
//   - « 1V1 »: the players rated on the 1v1 matches (./modes.ts, ranked after 3).
// A match is rated by the ranking of its format only: a 1v1 never moves a 2V2 mixte rating and a 2v2 never moves a 1V1
// one. This module is the one place that says which ranking rates a match, a draft or a profile: the screens read a
// match's deltas, chances and announcements through `byMatch` / matchResult(), never from one replay directly.
import type {
  Format,
  HistoryPoint,
  Match,
  MatchId,
  MatchResult,
  Player,
  PlayerId,
  PlayerStats,
  PlayerStatus,
  Ranking,
  ReplayResult,
  Target,
} from '../types'
import { DEFAULT_CONFIG } from './engine'
import { rank, replay, teamExpectation } from './index'
import { matchesOfFormat, MODE_RANKED_AFTER, replayMode } from './modes'
import type { ModeReplay } from './modes'

/** One ranking replayed over its own matches: what the Classement, the result view and the profile read. */
export type RatedFormat = {
  result: ReplayResult
  ranking: Ranking
  /** The matches this ranking rates, in store order. */
  matches: Match[]
}

/** A player's latest match of any format, and his status: 'inactive' only without any match for 30 days. */
export type Presence = Pick<PlayerStats, 'lastPlayedAt' | 'status'>

export type Rankings = {
  /** « 2V2 mixte », the main ranking: every player, rated on the 2v2 matches only. */
  main: RatedFormat
  /** « 1V1 »: the players with a 1v1 match, rated on the 1v1 matches only. */
  oneVsOne: ModeReplay
  /**
   * Every match, in replay order, with its result in the ranking of its format (2v2 → main, 1v1 → oneVsOne): the
   * individual deltas, the chances and the announcements of « the rating of a match ».
   */
  byMatch: ReadonlyMap<MatchId, MatchResult>
  /** Every player, whatever the format: the match-entry chips and the call lists (who still plays). */
  presence: ReadonlyMap<PlayerId, Presence>
}

/** A profile over every match, whatever the format (each match counted once, in its own ranking). */
export type Career = {
  playerId: PlayerId
  played: number
  wins: number
  losses: number
  /**
   * The points of both rankings merged in replay order: read for the match order only (streak, last matches), since
   * each point's ratings belong to the ranking of its match.
   */
  history: HistoryPoint[]
}

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

/** A team of one plays 1v1, a team of two 2v2. */
export function formatOfTeam(team: readonly PlayerId[]): Format {
  if (team.length === 1) return '1v1'
  return '2v2'
}

export function formatOfMatch(match: Pick<Match, 'teamA'>): Format {
  return formatOfTeam(match.teamA)
}

/** Matches needed to be ranked in the individual ranking of a format: 10 in 2V2 mixte, 3 in 1V1. */
export function rankedAfterOf(format: Format): number {
  if (format === '1v1') return MODE_RANKED_AFTER
  return DEFAULT_CONFIG.rankedAfter
}

/** The individual ranking that rates a format: 2V2 mixte for a 2v2, 1V1 for a 1v1. */
export function ofFormat(rankings: Rankings, format: Format): RatedFormat {
  if (format === '1v1') return rankings.oneVsOne
  return rankings.main
}

/** A match's result in the ranking of its format; undefined for an unknown id. */
export function matchResult(rankings: Pick<Rankings, 'byMatch'>, matchId: MatchId): MatchResult | undefined {
  return rankings.byMatch.get(matchId)
}

// ---------------------------------------------------------------------------
// Replays
// ---------------------------------------------------------------------------

/** « 2V2 mixte »: every player, rated on the 2v2 matches only, with the engine's defaults (pure). */
export function replayMain(players: Player[], matches: Match[], now: Date): RatedFormat {
  const own = matchesOfFormat(matches, '2v2')
  const result = replay(players, own, { now })
  return { result, ranking: rank(result, players), matches: own }
}

/** The engine's replay order: playedAt, then seq, then id. */
function compareReplayOrder(a: Match, b: Match): number {
  const time = Date.parse(a.playedAt) - Date.parse(b.playedAt)
  if (time !== 0) return time
  if (a.seq !== b.seq) return a.seq - b.seq
  if (a.id === b.id) return 0
  if (a.id < b.id) return -1
  return 1
}

type Individual = { main: ReplayResult; oneVsOne: ReplayResult }

function resultOf(match: Match, { main, oneVsOne }: Individual): MatchResult | undefined {
  if (formatOfMatch(match) === '1v1') return oneVsOne.byMatch.get(match.id)
  return main.byMatch.get(match.id)
}

function routedResults(matches: Match[], individual: Individual): Map<MatchId, MatchResult> {
  const byMatch = new Map<MatchId, MatchResult>()
  for (const match of [...matches].sort(compareReplayOrder)) {
    const result = resultOf(match, individual)
    if (result !== undefined) byMatch.set(match.id, result)
  }
  return byMatch
}

function latest(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  if (Date.parse(b) > Date.parse(a)) return b
  return a
}

// Inactive in 2V2 mixte (no 2v2 for 30 days) but still active in 1V1: the player plays, he is not inactive.
function presenceStatus(main: PlayerStats, solo: PlayerStats | undefined): PlayerStatus {
  if (main.status !== 'inactive') return main.status
  if (solo === undefined) return 'inactive'
  return solo.status
}

function presenceOf(main: ReplayResult, oneVsOne: ReplayResult): Map<PlayerId, Presence> {
  const presence = new Map<PlayerId, Presence>()
  for (const stats of main.byPlayer.values()) {
    const solo = oneVsOne.byPlayer.get(stats.playerId)
    const lastPlayedAt = latest(stats.lastPlayedAt, solo?.lastPlayedAt)
    presence.set(stats.playerId, { lastPlayedAt, status: presenceStatus(stats, solo) })
  }
  return presence
}

/** 2V2 mixte and 1V1 from the store's players and matches, and every match routed to its own ranking (pure). */
export function replayRankings(players: Player[], matches: Match[], now: Date): Rankings {
  const main = replayMain(players, matches, now)
  const oneVsOne = replayMode('1v1', players, matches, now)
  return {
    main,
    oneVsOne,
    byMatch: routedResults(matches, { main: main.result, oneVsOne: oneVsOne.result }),
    presence: presenceOf(main.result, oneVsOne.result),
  }
}

// ---------------------------------------------------------------------------
// Drafts: chances of a roster about to be played or edited
// ---------------------------------------------------------------------------

/** The first match of `result` placed after `matchId` in the replay order of every match (undefined: none). */
function nextRatedAfter(rankings: Rankings, result: ReplayResult, matchId: MatchId): MatchId | undefined {
  const ids = [...rankings.byMatch.keys()]
  const index = ids.indexOf(matchId)
  if (index < 0) return undefined
  return ids.slice(index + 1).find((id) => result.byMatch.has(id))
}

/**
 * Team A's win expectation for a roster, in the ranking of its format (1V1 for a 1v1, 2V2 mixte for a 2v2): after
 * every match for a new match, or right before `editedId` when a stored match is edited (it keeps its place in the
 * replay, even when the edit changes its format). Feeds the announcement stepper and equals the preview's.
 */
export function draftExpectation(
  rankings: Rankings,
  draft: { teamA: PlayerId[]; teamB: PlayerId[]; target: Target },
  editedId?: MatchId,
): number {
  const { result } = ofFormat(rankings, formatOfTeam(draft.teamA))
  if (editedId === undefined) return teamExpectation(result, draft)
  if (result.byMatch.has(editedId)) return teamExpectation(result, draft, editedId)
  return teamExpectation(result, draft, nextRatedAfter(rankings, result, editedId))
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function points(stats: PlayerStats | undefined): HistoryPoint[] {
  return stats?.history ?? []
}

/** Played, wins and losses over both individual rankings, and their points merged in replay order. */
export function careerOf(rankings: Rankings, playerId: PlayerId): Career {
  const main = rankings.main.result.byPlayer.get(playerId)
  const solo = rankings.oneVsOne.result.byPlayer.get(playerId)
  const position = new Map([...rankings.byMatch.keys()].map((id, index): [MatchId, number] => [id, index]))
  const history = [...points(main), ...points(solo)].sort(
    (a, b) => (position.get(a.matchId) ?? -1) - (position.get(b.matchId) ?? -1),
  )
  return {
    playerId,
    played: (main?.played ?? 0) + (solo?.played ?? 0),
    wins: (main?.wins ?? 0) + (solo?.wins ?? 0),
    losses: (main?.losses ?? 0) + (solo?.losses ?? 0),
    history,
  }
}
