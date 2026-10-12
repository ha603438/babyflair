// PostgREST client for the shared mode, over plain fetch (no supabase-js). Everything is injected (fetch, config,
// office code) so the client is unit-testable in node with a fake fetch. Rows are snake_case on the server and
// mapped to the app types here; dates are normalised back to the `...Z` ISO form the app writes everywhere.
import type { Match, Player, Target } from '../types'
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

export type ApiDeps = { fetch: FetchLike; config: RemoteConfig; officeCode: string }

export type RemoteData = { players: Player[]; matches: Match[] }

export type RemoteApi = {
  probeCode(): Promise<boolean>
  fetchAll(): Promise<RemoteData>
  insertPlayer(player: Player): Promise<void>
  updatePlayer(id: string, patch: { name: string; isGuest: boolean }): Promise<void>
  deletePlayer(id: string): Promise<void>
  insertMatch(match: Omit<Match, 'seq'>): Promise<Match>
  updateMatch(match: Match): Promise<void>
  deleteMatch(id: string): Promise<void>
  restoreMatch(match: Match): Promise<void>
  replaceAll(players: Player[], matches: Match[]): Promise<void>
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

export function matchFromRow(row: MatchRow): Match {
  return {
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
  }
}

/** Without `seq` the server assigns one (insertMatch); with it the original is kept (restoreMatch, replaceAll). */
export function matchToRow(match: Omit<Match, 'seq'> & { seq?: number }): Omit<MatchRow, 'seq'> & { seq?: number } {
  const row: Omit<MatchRow, 'seq'> & { seq?: number } = {
    id: match.id,
    played_at: match.playedAt,
    created_at: match.createdAt,
    updated_at: match.updatedAt,
    target: match.target,
    team_a: [...match.teamA],
    team_b: [...match.teamB],
    score_a: match.scoreA,
    score_b: match.scoreB,
  }
  if (match.seq !== undefined) row.seq = match.seq
  return row
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/** Matches every row: PostgREST needs a filter on DELETE, and Supabase refuses an unfiltered one. */
const ALL_ROWS = 'id=not.is.null'

function headersFor(deps: ApiDeps, write: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: deps.config.anonKey,
    Authorization: `Bearer ${deps.config.anonKey}`,
    'x-office-code': deps.officeCode,
    'Content-Type': 'application/json',
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

async function send(deps: ApiDeps, method: Method, path: string, body?: unknown): Promise<unknown> {
  const write = method !== 'GET'
  const init: RequestInit = { method, headers: headersFor(deps, write) }
  if (body !== undefined) init.body = JSON.stringify(body)
  let response: ResponseLike
  try {
    response = await deps.fetch(`${deps.config.url}/rest/v1/${path}`, init)
  } catch (error) {
    throw new RemoteError('network', String(error))
  }
  if (response.status === 401 || response.status === 403) throw new RemoteError('unauthorized', `HTTP ${response.status}`)
  if (!response.ok) throw new RemoteError('server', `HTTP ${response.status} on ${method} ${path}`)
  return parseBody(await response.text())
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

  async function fetchAll(): Promise<RemoteData> {
    const [players, matches] = await Promise.all([
      send(deps, 'GET', 'players?select=*&order=created_at.asc'),
      send(deps, 'GET', 'matches?select=*&order=seq.asc'),
    ])
    return { players: rowsOf<PlayerRow>(players).map(playerFromRow), matches: rowsOf<MatchRow>(matches).map(matchFromRow) }
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
      updated_at: row.updated_at,
    }
    await sendWrite(deps, 'PATCH', `matches?id=eq.${match.id}`, patch)
  }

  async function deleteMatch(id: string): Promise<void> {
    await sendDelete(deps, `matches?id=eq.${id}`)
  }

  async function restoreMatch(match: Match): Promise<void> {
    await sendWrite(deps, 'POST', 'matches', matchToRow(match))
  }

  /** Import: wipe then reinsert in order. Fine for an office-sized dataset; not transactional. */
  async function replaceAll(players: Player[], matches: Match[]): Promise<void> {
    await sendDelete(deps, `matches?${ALL_ROWS}`)
    await sendDelete(deps, `players?${ALL_ROWS}`)
    if (players.length > 0) await sendWrite(deps, 'POST', 'players', players.map(playerToRow))
    if (matches.length > 0) await sendWrite(deps, 'POST', 'matches', matches.map(matchToRow))
  }

  return {
    probeCode,
    fetchAll,
    insertPlayer,
    updatePlayer,
    deletePlayer,
    insertMatch,
    updateMatch,
    deleteMatch,
    restoreMatch,
    replaceAll,
  }
}
