// Adapter between the app's shapes (src/types.ts: ISO-string dates, hard-deleted matches, display integers) and the
// engine's (./engine.ts: ms timestamps, soft deletes, 0.001-rounded ratings). Screens import from here and never do
// rating math themselves.
import type {
  BetOutcome,
  HistoryPoint,
  Match,
  MatchId,
  MatchResult,
  Player,
  PlayerId,
  PlayerStats,
  PlayerStatus,
  PreviewExact,
  PreviewWhatIf,
  Ranking,
  ReplayResult,
  Score,
  Target,
} from '../types'
import type {
  Config,
  Leaderboard,
  LeaderboardRow,
  Match as EngineMatch,
  MatchResult as EngineMatchResult,
  Player as EnginePlayer,
  PlayerDelta,
  RatingsState,
} from './engine'
import {
  applyMatch,
  compareRows,
  DEFAULT_CONFIG,
  expectedScore,
  freshState,
  leaderboard,
  replay as engineReplay,
  whyFr,
} from './engine'

export {
  betChance,
  betOutlook,
  DEFAULT_CONFIG,
  expectedScore,
  goalProbability,
  marginMultiplier,
  rookieMultiplier,
  whyFr as whyLine,
} from './engine'
export type { Config, PlayerDelta } from './engine'
// Both modules only reach each other's hoisted functions at call time, so this import cycle is harmless.
export { useReplay } from './useReplay'
export type { ReplayView } from './useReplay'

export type PreviewDraft = {
  teamA: PlayerId[]
  teamB: PlayerId[]
  target: Target
  score?: Score
  comeback?: boolean
  /** Announcements: only the exact preview (score chosen) applies them, the what-if columns stay base-only. */
  betA?: number | null
  betB?: number | null
}

const PREVIEW_ID = 'preview'
// Above any stored seq, so a preview can never collide with a real row; the engine only requires a finite number.
const PREVIEW_SEQ = 1e9

const SECTION_STATUS: Array<[keyof Leaderboard, PlayerStatus]> = [
  ['ranked', 'ranked'],
  ['rookies', 'rookie'],
  ['inactive', 'inactive'],
]
const SECTION_OF: Record<PlayerStatus, keyof Ranking> = { ranked: 'ranked', rookie: 'rookies', inactive: 'inactive' }

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`rating: missing ${what}`)
  return value
}

function toEnginePlayer(player: Player): EnginePlayer {
  return { id: player.id, name: player.name, isGuest: player.isGuest, createdAt: Date.parse(player.createdAt) }
}

// updatedAt is display-only (« modifié ») and ignored by the engine; app matches are hard-deleted, so no deletedAt.
function toEngineMatch(match: Match): EngineMatch {
  return {
    id: match.id,
    seq: match.seq,
    playedAt: Date.parse(match.playedAt),
    createdAt: Date.parse(match.createdAt),
    target: match.target,
    teamA: match.teamA,
    teamB: match.teamB,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    comeback: match.comeback === true,
    betA: match.betA ?? null,
    betB: match.betB ?? null,
  }
}

function statusByPlayer(board: Leaderboard): Map<PlayerId, PlayerStatus> {
  const statusOf = new Map<PlayerId, PlayerStatus>()
  for (const [section, status] of SECTION_STATUS) {
    for (const row of board[section]) statusOf.set(row.player.id, status)
  }
  return statusOf
}

function collectHistories(results: EngineMatchResult[], playedAtOf: Map<MatchId, string>): Map<PlayerId, HistoryPoint[]> {
  const histories = new Map<PlayerId, HistoryPoint[]>()
  for (const result of results) {
    const playedAt = must(playedAtOf.get(result.matchId), `match ${result.matchId}`)
    for (const d of result.deltas) {
      const point: HistoryPoint = {
        matchId: result.matchId,
        playedAt,
        ratingBefore: d.ratingBefore,
        ratingAfter: d.ratingAfter,
        delta: d.delta,
      }
      const history = histories.get(d.playerId)
      if (history === undefined) {
        histories.set(d.playerId, [point])
        continue
      }
      history.push(point)
    }
  }
  return histories
}

function expectations(deltas: PlayerDelta[]): { expectedA: number; expectedB: number } {
  const expectedA = must(deltas.find((d) => d.team === 'A'), 'team A delta').expected
  return { expectedA, expectedB: 1 - expectedA }
}

// Every member of a team carries the same announcement: the first one of each team stands for it.
function betsOf(deltas: PlayerDelta[]): BetOutcome[] {
  const bets: BetOutcome[] = []
  for (const team of ['A', 'B'] as const) {
    const bet = deltas.find((d) => d.team === team)?.bet ?? null
    if (bet === null) continue
    bets.push({ team, n: bet.n, chance: bet.chance, success: bet.success, delta: bet.delta })
  }
  return bets
}

function toMatchResult(result: EngineMatchResult): MatchResult {
  return {
    matchId: result.matchId,
    ...expectations(result.deltas),
    perPlayer: result.deltas.map((d) => ({
      playerId: d.playerId,
      team: d.team,
      before: d.ratingBefore,
      after: d.ratingAfter,
      delta: d.delta,
      why: whyFr(d),
    })),
    bets: betsOf(result.deltas),
  }
}

// `config` defaults to the engine's; the 2V2 / 1V1 rankings (./modes.ts) only change its section threshold.
export function replay(players: Player[], matches: Match[], opts: { now: Date; config?: Config }): ReplayResult {
  const config = opts.config ?? DEFAULT_CONFIG
  const roster = players.map(toEnginePlayer)
  const engineResult = engineReplay(roster, matches.map(toEngineMatch), config)
  const playedAtOf = new Map<MatchId, string>(matches.map((m) => [m.id, m.playedAt]))
  const histories = collectHistories(engineResult.matches, playedAtOf)
  const statusOf = statusByPlayer(leaderboard(roster, engineResult.players, opts.now.getTime(), config))

  const byPlayer = new Map<PlayerId, PlayerStats>()
  for (const player of players) {
    const state = engineResult.players[player.id]
    const history = histories.get(player.id) ?? []
    byPlayer.set(player.id, {
      playerId: player.id,
      rating: Math.round(state.rating),
      played: state.matches,
      wins: state.wins,
      losses: state.losses,
      // The history is in replay order (playedAt ascending), so its last point is the engine's lastPlayedAt instant,
      // kept as the stored string rather than re-serialised.
      lastPlayedAt: history.at(-1)?.playedAt,
      status: must(statusOf.get(player.id), `status of ${player.id}`),
      rookieProgress: Math.min(state.matches, config.rankedAfter),
      history,
    })
  }
  const byMatch = new Map<MatchId, MatchResult>(engineResult.matches.map((r) => [r.matchId, toMatchResult(r)]))
  return { byPlayer, byMatch }
}

// PlayerStats.rating is rounded for display, but each history point carries the 0.001-rounded ratingAfter the engine
// itself stored, so the engine's final state is rebuilt exactly from the result: no second replay, no hidden cache.
function stateOf(result: ReplayResult): RatingsState {
  const state: RatingsState = {}
  for (const stats of result.byPlayer.values()) {
    state[stats.playerId] = {
      rating: stats.history.at(-1)?.ratingAfter ?? stats.rating,
      matches: stats.played,
      wins: stats.wins,
      losses: stats.losses,
      lastPlayedAt: stats.lastPlayedAt === undefined ? null : Date.parse(stats.lastPlayedAt),
    }
  }
  return state
}

// Same outcome as engine.leaderboard() on the replayed state: compareRows orders the rows (exact ratings via stateOf)
// and `status`, which replay() took from leaderboard(), picks the section. A player unknown to `result` is listed as
// a rookie with a fresh state.
export function rank(result: ReplayResult, players: Player[]): Ranking {
  const state = stateOf(result)
  const rows: LeaderboardRow[] = players.map((player) => ({
    ...(state[player.id] ?? freshState()),
    player: toEnginePlayer(player),
    rank: null,
  }))
  rows.sort(compareRows)
  const ranking: Ranking = { ranked: [], rookies: [], inactive: [] }
  for (const row of rows) {
    const status = result.byPlayer.get(row.player.id)?.status ?? 'rookie'
    ranking[SECTION_OF[status]].push(row.player.id)
  }
  return ranking
}

// Each player's engine state with only the matches played before `until` (ms): the history is in replay order and
// carries the 0.001-rounded ratingAfter the engine stored, so the state is exact. No match yet → no entry (the
// leaderboard then uses a fresh state).
function stateBefore(result: ReplayResult, until: number): RatingsState {
  const state: RatingsState = {}
  for (const stats of result.byPlayer.values()) {
    const points = stats.history.filter((point) => Date.parse(point.playedAt) < until)
    const last = points.at(-1)
    if (last === undefined) continue
    const wins = points.filter((point) => point.delta > 0).length
    state[stats.playerId] = {
      rating: last.ratingAfter,
      matches: points.length,
      wins,
      losses: points.length - wins,
      lastPlayedAt: Date.parse(last.playedAt),
    }
  }
  return state
}

/**
 * The 1st of the main ranking counting only the matches played before `until` (ms), its sections (ranked after 10
 * matches, inactive after 30 days) judged at `at` (ms) exactly like the Classement; null when nobody is ranked.
 */
export function leaderBefore(result: ReplayResult, players: Player[], until: number, at: number): PlayerId | null {
  const board = leaderboard(players.map(toEnginePlayer), stateBefore(result, until), at)
  return board.ranked[0]?.player.id ?? null
}

type PreviewBase = Omit<EngineMatch, 'scoreA' | 'scoreB'>

function latestPlayedAt(result: ReplayResult): number {
  let latest = -1
  for (const stats of result.byPlayer.values()) {
    if (stats.lastPlayedAt === undefined) continue
    latest = Math.max(latest, Date.parse(stats.lastPlayedAt))
  }
  return latest
}

function scoresOf(target: Target, score: Score): { scoreA: number; scoreB: number } {
  if (score.winner === 'A') return { scoreA: target, scoreB: score.loserGoals }
  return { scoreA: score.loserGoals, scoreB: target }
}

// Both runs list team A then team B in draft order, so the i-th delta of each run belongs to the same player.
function whatIf(state: RatingsState, roster: EnginePlayer[], base: PreviewBase): PreviewWhatIf {
  const { target } = base
  const aWins = applyMatch(state, { ...base, scoreA: target, scoreB: target - 1 }, DEFAULT_CONFIG, roster).deltas
  const bWins = applyMatch(state, { ...base, scoreA: target - 1, scoreB: target }, DEFAULT_CONFIG, roster).deltas
  const rows = aWins.map((d, i) => {
    const other = bWins[i].delta
    if (d.team === 'A') return { playerId: d.playerId, team: d.team, winDelta: d.delta, lossDelta: other }
    return { playerId: d.playerId, team: d.team, winDelta: other, lossDelta: d.delta }
  })
  return { ...expectations(aWins), rows }
}

function exact(state: RatingsState, roster: EnginePlayer[], match: EngineMatch): PreviewExact {
  const deltas = applyMatch(state, match, DEFAULT_CONFIG, roster).deltas
  return { ...expectations(deltas), rows: deltas.map((d) => ({ playerId: d.playerId, team: d.team, delta: d.delta })) }
}

// Pure: the preview's timestamp is derived from the result (one ms after the latest match, 0 on an empty history),
// never from Date.now(). Any finite value would do, since the preview is applied on the final state and is therefore
// appended after every real match by construction. Engine validation errors (unknown or duplicate player, team sizes,
// bad score) propagate as thrown Errors.
export function previewMatch(result: ReplayResult, players: Player[], draft: PreviewDraft): PreviewWhatIf | PreviewExact {
  const state = stateOf(result)
  const roster = players.map(toEnginePlayer)
  const playedAt = latestPlayedAt(result) + 1
  const base: PreviewBase = {
    id: PREVIEW_ID,
    seq: PREVIEW_SEQ,
    playedAt,
    createdAt: playedAt,
    target: draft.target,
    teamA: draft.teamA,
    teamB: draft.teamB,
  }
  if (draft.score === undefined) return whatIf(state, roster, base)
  const scored = { ...base, ...scoresOf(draft.target, draft.score), comeback: draft.comeback === true }
  return exact(state, roster, { ...scored, betA: draft.betA ?? null, betB: draft.betB ?? null })
}

// The replay position of every rated match (byMatch is built in replay order).
function replayOrder(result: ReplayResult): Map<MatchId, number> {
  return new Map([...result.byMatch.keys()].map((id, index): [MatchId, number] => [id, index]))
}

// The exact engine rating of a player after every match placed before `limit` in the replay order (the history is in
// that order and carries the 0.001-rounded ratingAfter); startRating before any match.
function ratingAt(stats: PlayerStats | undefined, order: Map<MatchId, number>, limit: number): number {
  const history = stats?.history ?? []
  if (limit === Number.POSITIVE_INFINITY) return history.at(-1)?.ratingAfter ?? DEFAULT_CONFIG.startRating
  let rating = DEFAULT_CONFIG.startRating
  for (const point of history) {
    const index = order.get(point.matchId)
    if (index === undefined || index >= limit) break
    rating = point.ratingAfter
  }
  return rating
}

function limitOf(order: Map<MatchId, number>, beforeMatchId: MatchId | undefined): number {
  if (beforeMatchId === undefined) return Number.POSITIVE_INFINITY
  return order.get(beforeMatchId) ?? Number.POSITIVE_INFINITY
}

/**
 * Team A's win expectation (the engine's E, format factor included) for a roster: after every match by default (the
 * new-match sheet, same value as previewMatch), or right before `beforeMatchId` (the edit screen, where the match
 * keeps its place in the replay). Feeds the announcement stepper (betOutlook). A player unknown to `result` counts
 * at startRating.
 */
export function teamExpectation(
  result: ReplayResult,
  draft: Pick<PreviewDraft, 'teamA' | 'teamB' | 'target'>,
  beforeMatchId?: MatchId,
): number {
  const order = replayOrder(result)
  const limit = limitOf(order, beforeMatchId)
  const teamRating = (ids: PlayerId[]): number =>
    ids.reduce((sum, id) => sum + ratingAt(result.byPlayer.get(id), order, limit), 0) / ids.length
  return expectedScore(teamRating(draft.teamA) - teamRating(draft.teamB), draft.target)
}
