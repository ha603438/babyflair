// PostgREST client for the shared mode, over plain fetch (no supabase-js). Everything is injected (fetch, config,
// office code, profile) so the client is unit-testable in node with a fake fetch. Rows are snake_case on the server and
// mapped to the app types here; dates are normalised back to the `...Z` ISO form the app writes everywhere.
import { readBet } from '../bets'
import { parseCallResponse } from '../calls/calls'
import type { Call, CallPlayer, Match, MatchEvent, MatchEventAction, MatchSnapshot, Player, Target } from '../types'
import type { RemoteConfig } from './config'

export type RemoteErrorKind = 'unauthorized' | 'network' | 'server'

export class RemoteError extends Error {
  readonly kind: RemoteErrorKind

  constructor(kind: RemoteErrorKind, message?: string) {
    super(message ?? `remote ${kind}`)
    this.name = 'RemoteError'
    this.kind = kind
  }
}

export type ResponseLike = { ok: boolean; status: number; text(): Promise<string> }
export type FetchLike = (url: string, init: RequestInit) => Promise<ResponseLike>

/** `playerId`: this phone's profile, sent as x-player-id so the server signs match changes; none for visitors. */
export type ApiDeps = { fetch: FetchLike; config: RemoteConfig; officeCode: string; playerId?: string | null }

export type RemoteData = { players: Player[]; matches: Match[]; calls: Call[]; callPlayers: CallPlayer[] }
export type CallsData = { calls: Call[]; callPlayers: CallPlayer[] }

/** What the browser's PushSubscription boils down to (src/calls/push.ts); `playerId` is « Qui es-tu ? » or null. */
export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string; playerId: string | null }
export type NotifyResult = { sent: number; removed: number }

export type RemoteApi = {
  probeCode(): Promise<boolean>
  fetchAll(): Promise<RemoteData>
  /** Open calls only (not closed, not expired), each with its call_players. */
  fetchCalls(now?: Date): Promise<CallsData>
  insertCall(call: Call): Promise<void>
  /** The organizer's own row, at the call's creation. */
  insertCallPlayer(callPlayer: CallPlayer): Promise<void>
  /** An answer (« Chauuud 🔥 » / « Non je fais semblant de bosser »): inserted, or replacing the previous one. */
  upsertCallPlayer(callPlayer: CallPlayer): Promise<void>
  closeCall(id: string, closedAt: string): Promise<void>
  upsertPushSubscription(subscription: PushSubscriptionInput): Promise<void>
  deletePushSubscription(endpoint: string): Promise<void>
  /** Edge function notify-call: Web Push to every subscribed phone of the office. */
  /** `excludeEndpoint`: the organizer's own push subscription, skipped by the function. */
  notifyCall(callId: string, excludeEndpoint?: string | null): Promise<NotifyResult>
  insertPlayer(player: Player): Promise<void>
  updatePlayer(id: string, patch: { name: string; isGuest: boolean }): Promise<void>
  deletePlayer(id: string): Promise<void>
  insertMatch(match: Omit<Match, 'seq'>): Promise<Match>
  updateMatch(match: Match): Promise<void>
  deleteMatch(id: string): Promise<void>
  restoreMatch(match: Match): Promise<void>
  replaceAll(players: Player[], matches: Match[]): Promise<void>
  /** Journal des modifications: the newest match_events first. */
  fetchMatchEvents(limit?: number): Promise<MatchEvent[]>
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

export type PlayerRow = { id: string; name: string; is_guest: boolean; created_at: string }

export type MatchRow = {
  id: string
  seq: number
  played_at: string
  created_at: string
  updated_at: string
  target: number
  team_a: string[]
  team_b: string[]
  score_a: number
  score_b: number
  /** « Comeback » box (docs/supabase/comeback.sql, not null default false); absent before that migration. */
  comeback?: boolean
  /** « Annonces d'écart » (docs/supabase/bets.sql, smallint null, 1..target); absent before that migration. */
  bet_a?: number | null
  bet_b?: number | null
  /** Filled by the server trigger (docs/supabase/profiles.sql); absent before that migration. */
  created_by?: string | null
  updated_by?: string | null
}

/** What the app writes: the authorship columns are the trigger's, never sent; `comeback` and the bets always are. */
export type MatchWriteRow = Omit<MatchRow, 'seq' | 'comeback' | 'bet_a' | 'bet_b' | 'created_by' | 'updated_by'> & {
  seq?: number
  comeback: boolean
  bet_a: number | null
  bet_b: number | null
}

export type MatchEventRow = {
  id: number
  at: string
  action: string
  match_id: string
  actor_id: string | null
  /** `to_jsonb(old)` / `to_jsonb(new)` of the matches row. */
  before: unknown
  after: unknown
}

/** `response`: 'in' | 'out' (docs/supabase/call-responses.sql, default 'in'); absent before that migration. */
export type CallPlayerRow = { call_id: string; player_id: string; joined_at: string; response?: string }

export type CallRow = {
  id: string
  created_at: string
  expires_at: string
  created_by: string
  closed_at: string | null
  /** Embedded by `select=*,call_players(*)`. */
  call_players?: CallPlayerRow[]
}

/** Postgres returns `2025-10-01T10:00:00+00:00`; the app stores `2025-10-01T10:00:00.000Z`. */
function toIso(value: string): string {
  const time = Date.parse(value)
  if (Number.isNaN(time)) return value
  return new Date(time).toISOString()
}

function targetOf(value: number): Target {
  if (value === 5) return 5
  return 10
}

export function playerFromRow(row: PlayerRow): Player {
  return { id: row.id, name: row.name, isGuest: row.is_guest, createdAt: toIso(row.created_at) }
}

export function playerToRow(player: Player): PlayerRow {
  return { id: player.id, name: player.name, is_guest: player.isGuest, created_at: player.createdAt }
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  return value
}

export function matchFromRow(row: MatchRow): Match {
  const match: Match = {
    id: row.id,
    seq: row.seq,
    playedAt: toIso(row.played_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    target: targetOf(row.target),
    teamA: [...row.team_a],
    teamB: [...row.team_b],
    scoreA: row.score_a,
    scoreB: row.score_b,
    comeback: row.comeback === true,
  }
  const betA = readBet(row.bet_a, match.target)
  const betB = readBet(row.bet_b, match.target)
  if (betA !== undefined) match.betA = betA
  if (betB !== undefined) match.betB = betB
  const createdBy = nonEmptyString(row.created_by)
  const updatedBy = nonEmptyString(row.updated_by)
  if (createdBy !== undefined) match.createdBy = createdBy
  if (updatedBy !== undefined) match.updatedBy = updatedBy
  return match
}

/**
 * Without `seq` the server assigns one (insertMatch); with it the original is kept (restoreMatch, replaceAll).
 * `createdBy` / `updatedBy` are never sent: the trigger owns them.
 */
export function matchToRow(match: Omit<Match, 'seq'> & { seq?: number }): MatchWriteRow {
  const row: MatchWriteRow = {
    id: match.id,
    played_at: match.playedAt,
    created_at: match.createdAt,
    updated_at: match.updatedAt,
    target: match.target,
    team_a: [...match.teamA],
    team_b: [...match.teamB],
    score_a: match.scoreA,
    score_b: match.scoreB,
    comeback: match.comeback === true,
    // null clears an announcement removed by an edit.
    bet_a: match.betA ?? null,
    bet_b: match.betB ?? null,
  }
  if (match.seq !== undefined) row.seq = match.seq
  return row
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** A jsonb image of a matches row → the displayed parts, or null when it is missing or unreadable. */
export function snapshotFromJson(value: unknown): MatchSnapshot | null {
  if (!isRecord(value)) return null
  const { target, team_a: teamA, team_b: teamB, score_a: scoreA, score_b: scoreB } = value
  if (!isIdList(teamA) || !isIdList(teamB)) return null
  if (typeof scoreA !== 'number' || typeof scoreB !== 'number' || typeof target !== 'number') return null
  const snapshot: MatchSnapshot = { target: targetOf(target), teamA: [...teamA], teamB: [...teamB], scoreA, scoreB }
  if (value.comeback === true) snapshot.comeback = true
  const betA = readBet(value.bet_a, snapshot.target)
  const betB = readBet(value.bet_b, snapshot.target)
  if (betA !== undefined) snapshot.betA = betA
  if (betB !== undefined) snapshot.betB = betB
  return snapshot
}

const EVENT_ACTIONS: readonly MatchEventAction[] = ['created', 'updated', 'deleted', 'restored']

function actionOf(value: string): MatchEventAction | null {
  return EVENT_ACTIONS.find((action) => action === value) ?? null
}

/** Null for an action this version of the app does not know. */
export function matchEventFromRow(row: MatchEventRow): MatchEvent | null {
  const action = actionOf(row.action)
  if (action === null) return null
  return {
    id: row.id,
    at: toIso(row.at),
    action,
    matchId: row.match_id,
    actorId: nonEmptyString(row.actor_id) ?? null,
    before: snapshotFromJson(row.before),
    after: snapshotFromJson(row.after),
  }
}

export function callFromRow(row: CallRow): Call {
  const call: Call = {
    id: row.id,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    createdBy: row.created_by,
  }
  if (typeof row.closed_at === 'string') call.closedAt = toIso(row.closed_at)
  return call
}

export function callToRow(call: Call): CallRow {
  return {
    id: call.id,
    created_at: call.createdAt,
    expires_at: call.expiresAt,
    created_by: call.createdBy,
    closed_at: call.closedAt ?? null,
  }
}

export function callPlayerFromRow(row: CallPlayerRow): CallPlayer {
  return {
    callId: row.call_id,
    playerId: row.player_id,
    joinedAt: toIso(row.joined_at),
    response: parseCallResponse(row.response),
  }
}

export function callPlayerToRow(callPlayer: CallPlayer): CallPlayerRow {
  return {
    call_id: callPlayer.callId,
    player_id: callPlayer.playerId,
    joined_at: callPlayer.joinedAt,
    response: callPlayer.response,
  }
}

/** Flattens the embedded call_players of each call row into the two app arrays. */
export function callsFromRows(rows: CallRow[]): CallsData {
  const calls: Call[] = []
  const callPlayers: CallPlayer[] = []
  for (const row of rows) {
    calls.push(callFromRow(row))
    for (const cp of row.call_players ?? []) callPlayers.push(callPlayerFromRow(cp))
  }
  return { calls, callPlayers }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/** Matches every row: PostgREST needs a filter on DELETE, and Supabase refuses an unfiltered one. */
const ALL_ROWS = 'id=not.is.null'

function baseHeaders(deps: ApiDeps): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: deps.config.anonKey,
    Authorization: `Bearer ${deps.config.anonKey}`,
    'x-office-code': deps.officeCode,
    'Content-Type': 'application/json',
  }
  const playerId = nonEmptyString(deps.playerId)
  if (playerId !== undefined) headers['x-player-id'] = playerId
  return headers
}

function headersFor(deps: ApiDeps, write: boolean, prefer?: string): Record<string, string> {
  const headers = baseHeaders(deps)
  if (prefer !== undefined) {
    headers.Prefer = prefer
    return headers
  }
  if (write) headers.Prefer = 'return=representation'
  return headers
}

function parseBody(text: string): unknown {
  if (text.trim().length === 0) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function request(deps: ApiDeps, url: string, init: RequestInit, label: string): Promise<unknown> {
  let response: ResponseLike
  try {
    response = await deps.fetch(url, init)
  } catch (error) {
    throw new RemoteError('network', String(error))
  }
  if (response.status === 401 || response.status === 403) throw new RemoteError('unauthorized', `HTTP ${response.status}`)
  if (!response.ok) throw new RemoteError('server', `HTTP ${response.status} on ${label}`)
  return parseBody(await response.text())
}

async function send(deps: ApiDeps, method: Method, path: string, body?: unknown, prefer?: string): Promise<unknown> {
  const write = method !== 'GET'
  const init: RequestInit = { method, headers: headersFor(deps, write, prefer) }
  if (body !== undefined) init.body = JSON.stringify(body)
  return request(deps, `${deps.config.url}/rest/v1/${path}`, init, `${method} ${path}`)
}

/** Edge function call (`/functions/v1/<name>`): same anon key and office code, JSON in and out. */
async function invoke(deps: ApiDeps, name: string, body: unknown): Promise<unknown> {
  const init: RequestInit = { method: 'POST', headers: baseHeaders(deps), body: JSON.stringify(body) }
  return request(deps, `${deps.config.url}/functions/v1/${name}`, init, `POST functions/${name}`)
}

/** A write on a row the office code cannot see is silently a no-op (RLS): PostgREST answers 200 with `[]`. */
async function sendWrite(deps: ApiDeps, method: Method, path: string, body?: unknown): Promise<unknown[]> {
  const data = await send(deps, method, path, body)
  if (!Array.isArray(data) || data.length === 0) throw new RemoteError('unauthorized', `empty write on ${path}`)
  return data
}

async function sendDelete(deps: ApiDeps, path: string): Promise<void> {
  // Deleting nothing is legitimate (already gone, or an empty table on import): no row count check here.
  await send(deps, 'DELETE', path)
}

function rowsOf<T>(data: unknown): T[] {
  if (!Array.isArray(data)) return []
  return data as T[]
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function createApi(deps: ApiDeps): RemoteApi {
  async function probeCode(): Promise<boolean> {
    return (await send(deps, 'POST', 'rpc/office_ok', {})) === true
  }

  // Calls of the last 45 minutes: a full call outlives its 5-minute recruiting window (see calls.ts isCallOpen).
  function openCallsPath(now: Date): string {
    const after = encodeURIComponent(new Date(now.getTime() - 45 * 60 * 1000).toISOString())
    return `calls?select=*,call_players(*)&closed_at=is.null&created_at=gt.${after}&order=created_at.asc`
  }

  async function fetchCalls(now: Date = new Date()): Promise<CallsData> {
    return callsFromRows(rowsOf<CallRow>(await send(deps, 'GET', openCallsPath(now))))
  }

  async function fetchAll(): Promise<RemoteData> {
    const [players, matches, calls] = await Promise.all([
      send(deps, 'GET', 'players?select=*&order=created_at.asc'),
      send(deps, 'GET', 'matches?select=*&order=seq.asc'),
      send(deps, 'GET', openCallsPath(new Date())),
    ])
    return {
      players: rowsOf<PlayerRow>(players).map(playerFromRow),
      matches: rowsOf<MatchRow>(matches).map(matchFromRow),
      ...callsFromRows(rowsOf<CallRow>(calls)),
    }
  }

  async function insertCall(call: Call): Promise<void> {
    await sendWrite(deps, 'POST', 'calls', callToRow(call))
  }

  async function insertCallPlayer(callPlayer: CallPlayer): Promise<void> {
    await sendWrite(deps, 'POST', 'call_players', callPlayerToRow(callPlayer))
  }

  // Upsert on the primary key (call_id, player_id): a change of mind replaces the answer and its time. No row comes
  // back (`return=minimal`); a refused office code fails the insert / update itself (RLS with check).
  async function upsertCallPlayer(callPlayer: CallPlayer): Promise<void> {
    await send(deps, 'POST', 'call_players', callPlayerToRow(callPlayer), 'resolution=merge-duplicates,return=minimal')
  }

  async function closeCall(id: string, closedAt: string): Promise<void> {
    await sendWrite(deps, 'PATCH', `calls?id=eq.${id}`, { closed_at: closedAt })
  }

  // push_subscriptions has no SELECT policy: writes must not ask for the row back (`return=minimal`).
  // The table is write-only from the browser (no SELECT policy), so an upsert or a filtered delete cannot run there:
  // both go through security-definer functions that check the office code first (docs/supabase/notifications.sql).
  async function upsertPushSubscription(subscription: PushSubscriptionInput): Promise<void> {
    const body = {
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.p256dh,
      p_auth: subscription.auth,
      p_player_id: subscription.playerId,
    }
    const ok = await send(deps, 'POST', 'rpc/register_push', body)
    if (ok !== true) throw new RemoteError('unauthorized', 'register_push refused')
  }

  async function deletePushSubscription(endpoint: string): Promise<void> {
    const ok = await send(deps, 'POST', 'rpc/unregister_push', { p_endpoint: endpoint })
    if (ok !== true) throw new RemoteError('unauthorized', 'unregister_push refused')
  }

  async function notifyCall(callId: string, excludeEndpoint?: string | null): Promise<NotifyResult> {
    const body = excludeEndpoint ? { call_id: callId, exclude_endpoint: excludeEndpoint } : { call_id: callId }
    const data = await invoke(deps, 'notify-call', body)
    const record = (data ?? {}) as { sent?: unknown; removed?: unknown }
    const sent = typeof record.sent === 'number' ? record.sent : 0
    const removed = typeof record.removed === 'number' ? record.removed : 0
    return { sent, removed }
  }

  async function insertPlayer(player: Player): Promise<void> {
    await sendWrite(deps, 'POST', 'players', playerToRow(player))
  }

  async function updatePlayer(id: string, patch: { name: string; isGuest: boolean }): Promise<void> {
    await sendWrite(deps, 'PATCH', `players?id=eq.${id}`, { name: patch.name, is_guest: patch.isGuest })
  }

  async function deletePlayer(id: string): Promise<void> {
    await sendDelete(deps, `players?id=eq.${id}`)
  }

  async function insertMatch(match: Omit<Match, 'seq'>): Promise<Match> {
    const rows = await sendWrite(deps, 'POST', 'matches', matchToRow(match))
    return matchFromRow(rows[0] as MatchRow)
  }

  async function updateMatch(match: Match): Promise<void> {
    const row = matchToRow(match)
    const patch = {
      target: row.target,
      team_a: row.team_a,
      team_b: row.team_b,
      score_a: row.score_a,
      score_b: row.score_b,
      comeback: row.comeback,
      bet_a: row.bet_a,
      bet_b: row.bet_b,
      updated_at: row.updated_at,
    }
    await sendWrite(deps, 'PATCH', `matches?id=eq.${match.id}`, patch)
  }

  async function deleteMatch(id: string): Promise<void> {
    await sendDelete(deps, `matches?id=eq.${id}`)
  }

  // A restored match keeps its original author (the trigger only fills created_by when it is missing).
  async function restoreMatch(match: Match): Promise<void> {
    const row = match.createdBy === undefined ? matchToRow(match) : { ...matchToRow(match), created_by: match.createdBy }
    await sendWrite(deps, 'POST', 'matches', row)
  }

  /** Import: wipe then reinsert in order. Fine for an office-sized dataset; not transactional. */
  async function replaceAll(players: Player[], matches: Match[]): Promise<void> {
    await sendDelete(deps, `matches?${ALL_ROWS}`)
    await sendDelete(deps, `players?${ALL_ROWS}`)
    if (players.length > 0) await sendWrite(deps, 'POST', 'players', players.map(playerToRow))
    if (matches.length > 0) await sendWrite(deps, 'POST', 'matches', matches.map(matchToRow))
  }

  async function fetchMatchEvents(limit = 100): Promise<MatchEvent[]> {
    const path = `match_events?select=id,at,action,match_id,actor_id,before,after&order=at.desc&limit=${limit}`
    const rows = rowsOf<MatchEventRow>(await send(deps, 'GET', path))
    const events: MatchEvent[] = []
    for (const row of rows) {
      const event = matchEventFromRow(row)
      if (event !== null) events.push(event)
    }
    return events
  }

  return {
    probeCode,
    fetchAll,
    fetchCalls,
    insertCall,
    insertCallPlayer,
    upsertCallPlayer,
    closeCall,
    upsertPushSubscription,
    deletePushSubscription,
    notifyCall,
    insertPlayer,
    updatePlayer,
    deletePlayer,
    insertMatch,
    updateMatch,
    deleteMatch,
    restoreMatch,
    replaceAll,
    fetchMatchEvents,
  }
}
