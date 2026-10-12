import { describe, expect, it } from 'vitest'
import type { Match, Player } from '../types'
import type { FetchLike, MatchRow, PlayerRow } from './api'
import {
  callFromRow,
  callsFromRows,
  callToRow,
  createApi,
  matchFromRow,
  matchToRow,
  playerFromRow,
  playerToRow,
  RemoteError,
} from './api'
import type { CallRow } from './api'
import { remoteConfigFrom } from './config'

const config = { url: 'https://x.supabase.co', anonKey: 'anon-key' }

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown }

function fakeFetch(respond: (call: Call) => { status: number; body?: unknown } | Error): {
  fetch: FetchLike
  calls: Call[]
} {
  const calls: Call[] = []
  const fetch: FetchLike = async (url, init) => {
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)
    const result = respond(call)
    if (result instanceof Error) throw result
    const text = result.body === undefined ? '' : JSON.stringify(result.body)
    return { ok: result.status < 400, status: result.status, text: async () => text }
  }
  return { fetch, calls }
}

const player: Player = { id: 'p1', name: 'Alice', isGuest: true, createdAt: '2025-10-01T10:00:00.000Z' }
const playerRow: PlayerRow = { id: 'p1', name: 'Alice', is_guest: true, created_at: '2025-10-01T10:00:00+00:00' }

const match: Match = {
  id: 'm1',
  seq: 7,
  playedAt: '2025-10-06T12:42:00.000Z',
  createdAt: '2025-10-06T12:43:00.000Z',
  updatedAt: '2025-10-06T12:44:00.000Z',
  target: 5,
  teamA: ['p1', 'p2'],
  teamB: ['p3', 'p4'],
  scoreA: 5,
  scoreB: 3,
}
const matchRow: MatchRow = {
  id: 'm1',
  seq: 7,
  played_at: '2025-10-06T12:42:00+00:00',
  created_at: '2025-10-06T12:43:00+00:00',
  updated_at: '2025-10-06T12:44:00+00:00',
  target: 5,
  team_a: ['p1', 'p2'],
  team_b: ['p3', 'p4'],
  score_a: 5,
  score_b: 3,
}

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return 'none'
  } catch (error) {
    if (error instanceof RemoteError) return error.kind
    return 'other'
  }
}

describe('remoteConfigFrom', () => {
  it('is null unless both variables are set, and trims a trailing slash', () => {
    expect(remoteConfigFrom({})).toBeNull()
    expect(remoteConfigFrom({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull()
    expect(remoteConfigFrom({ VITE_SUPABASE_URL: ' ', VITE_SUPABASE_ANON_KEY: 'k' })).toBeNull()
    expect(remoteConfigFrom({ VITE_SUPABASE_URL: 'https://x.supabase.co/', VITE_SUPABASE_ANON_KEY: 'k' })).toEqual({
      url: 'https://x.supabase.co',
      anonKey: 'k',
    })
  })
})

describe('row mapping', () => {
  it('maps players both ways and normalises dates to the Z form', () => {
    expect(playerFromRow(playerRow)).toEqual(player)
    expect(playerToRow(player)).toEqual({ ...playerRow, created_at: player.createdAt })
  })

  it('maps matches both ways; seq is only sent when present', () => {
    expect(matchFromRow(matchRow)).toEqual(match)
    const row = matchToRow(match)
    expect(row.seq).toBe(7)
    expect(row.team_a).toEqual(['p1', 'p2'])
    expect(row.score_b).toBe(3)
    const { seq: _seq, ...noSeq } = match
    expect('seq' in matchToRow(noSeq)).toBe(false)
  })
})

describe('createApi', () => {
  it('sends the auth and office headers on every call, Prefer only on writes', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: [] }))
    const api = createApi({ fetch, config, officeCode: 'secret' })
    await api.fetchAll()
    await api.deletePlayer('p1')
    expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/players?select=*&order=created_at.asc')
    expect(calls[1].url).toBe('https://x.supabase.co/rest/v1/matches?select=*&order=seq.asc')
    expect(calls[2].url).toMatch(/^https:\/\/x\.supabase\.co\/rest\/v1\/calls\?select=\*,call_players\(\*\)&closed_at=is\.null&expires_at=gt\./)
    for (const call of calls) {
      expect(call.headers.apikey).toBe('anon-key')
      expect(call.headers.Authorization).toBe('Bearer anon-key')
      expect(call.headers['x-office-code']).toBe('secret')
      expect(call.headers['Content-Type']).toBe('application/json')
    }
    expect(calls[0].headers.Prefer).toBeUndefined()
    expect(calls[3].method).toBe('DELETE')
    expect(calls[3].headers.Prefer).toBe('return=representation')
  })

  it('fetchAll maps rows to app types', async () => {
    const { fetch } = fakeFetch((call) => {
      if (call.url.includes('/players')) return { status: 200, body: [playerRow] }
      if (call.url.includes('/matches')) return { status: 200, body: [matchRow] }
      return { status: 200, body: [] }
    })
    const api = createApi({ fetch, config, officeCode: 'secret' })
    expect(await api.fetchAll()).toEqual({ players: [player], matches: [match], calls: [], callPlayers: [] })
  })

  it('fetchAll / fetchCalls flatten the embedded call_players of the open calls', async () => {
    const row: CallRow = {
      id: 'c1',
      created_at: '2025-10-06T12:00:00+00:00',
      expires_at: '2025-10-06T12:45:00+00:00',
      created_by: 'p1',
      closed_at: null,
      call_players: [{ call_id: 'c1', player_id: 'p1', joined_at: '2025-10-06T12:00:00+00:00' }],
    }
    const { fetch, calls } = fakeFetch((call) => {
      if (call.url.includes('/calls')) return { status: 200, body: [row] }
      return { status: 200, body: [] }
    })
    const api = createApi({ fetch, config, officeCode: 'secret' })
    const expected = {
      calls: [{ id: 'c1', createdAt: '2025-10-06T12:00:00.000Z', expiresAt: '2025-10-06T12:45:00.000Z', createdBy: 'p1' }],
      callPlayers: [{ callId: 'c1', playerId: 'p1', joinedAt: '2025-10-06T12:00:00.000Z' }],
    }
    expect(await api.fetchCalls(new Date('2025-10-06T12:10:00.000Z'))).toEqual(expected)
    expect(calls[0].url).toContain('expires_at=gt.2025-10-06T12%3A10%3A00.000Z')
    expect(await api.fetchAll()).toMatchObject(expected)
  })

  it('call writes: insert, join, close', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 201, body: [{}] }))
    const api = createApi({ fetch, config, officeCode: 'secret' })
    const call = { id: 'c1', createdAt: 'a', expiresAt: 'b', createdBy: 'p1', closedAt: 'z' }
    await api.insertCall(call)
    await api.insertCallPlayer({ callId: 'c1', playerId: 'p2', joinedAt: 'j' })
    await api.closeCall('c1', 'z')
    expect(calls.map((c) => [c.method, c.url.replace(config.url, ''), c.body])).toEqual([
      ['POST', '/rest/v1/calls', { id: 'c1', created_at: 'a', expires_at: 'b', created_by: 'p1', closed_at: 'z' }],
      ['POST', '/rest/v1/call_players', { call_id: 'c1', player_id: 'p2', joined_at: 'j' }],
      ['PATCH', '/rest/v1/calls?id=eq.c1', { closed_at: 'z' }],
    ])
    expect(callFromRow(callToRow(call))).toEqual(call)
    expect(callsFromRows([{ ...callToRow(call), call_players: undefined }]).callPlayers).toEqual([])
  })

  it('push subscriptions go through the register_push / unregister_push functions', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: true }))
    const api = createApi({ fetch, config, officeCode: 'secret' })
    await api.upsertPushSubscription({ endpoint: 'https://push/a?b=1', p256dh: 'P', auth: 'A', playerId: null })
    await api.deletePushSubscription('https://push/a?b=1')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/rpc/register_push')
    expect(calls[0].headers['x-office-code']).toBe('secret')
    expect(calls[0].body).toEqual({ p_endpoint: 'https://push/a?b=1', p_p256dh: 'P', p_auth: 'A', p_player_id: null })
    expect(calls[1].url).toBe('https://x.supabase.co/rest/v1/rpc/unregister_push')
    expect(calls[1].body).toEqual({ p_endpoint: 'https://push/a?b=1' })
  })

  it('push subscriptions refused by the office code raise unauthorized', async () => {
    const { fetch } = fakeFetch(() => ({ status: 200, body: false }))
    const api = createApi({ fetch, config, officeCode: 'wrong' })
    await expect(api.upsertPushSubscription({ endpoint: 'e', p256dh: 'P', auth: 'A', playerId: null })).rejects.toMatchObject({ kind: 'unauthorized' })
  })

  it('notifyCall posts to the edge function with the same headers and reads the counts', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: { sent: 3, removed: 1 } }))
    const api = createApi({ fetch, config, officeCode: 'secret' })
    expect(await api.notifyCall('c1')).toEqual({ sent: 3, removed: 1 })
    expect(calls[0].url).toBe('https://x.supabase.co/functions/v1/notify-call')
    expect(calls[0].method).toBe('POST')
    expect(calls[0].body).toEqual({ call_id: 'c1' })
    expect(calls[0].headers.apikey).toBe('anon-key')
    expect(calls[0].headers.Authorization).toBe('Bearer anon-key')
    expect(calls[0].headers['x-office-code']).toBe('secret')
    expect(calls[0].headers.Prefer).toBeUndefined()
    const refused = createApi({ fetch: fakeFetch(() => ({ status: 403, body: {} })).fetch, config, officeCode: 'x' })
    expect(await kindOf(refused.notifyCall('c1'))).toBe('unauthorized')
    const odd = createApi({ fetch: fakeFetch(() => ({ status: 200, body: {} })).fetch, config, officeCode: 'x' })
    expect(await odd.notifyCall('c1')).toEqual({ sent: 0, removed: 0 })
  })

  it('insertMatch posts without seq and returns the server match with its seq', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 201, body: [{ ...matchRow, seq: 42 }] }))
    const api = createApi({ fetch, config, officeCode: 'secret' })
    const { seq: _seq, ...input } = match
    const created = await api.insertMatch(input)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/matches')
    expect('seq' in (calls[0].body as object)).toBe(false)
    expect(created.seq).toBe(42)
  })

  it('restoreMatch sends the original id and seq', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 201, body: [matchRow] }))
    await createApi({ fetch, config, officeCode: 'secret' }).restoreMatch(match)
    expect(calls[0].body).toMatchObject({ id: 'm1', seq: 7 })
  })

  it('updateMatch patches by id with the editable columns only', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: [matchRow] }))
    await createApi({ fetch, config, officeCode: 'secret' }).updateMatch(match)
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/matches?id=eq.m1')
    expect(calls[0].body).toEqual({
      target: 5,
      team_a: ['p1', 'p2'],
      team_b: ['p3', 'p4'],
      score_a: 5,
      score_b: 3,
      updated_at: match.updatedAt,
    })
  })

  it('updatePlayer patches name and is_guest', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: [playerRow] }))
    await createApi({ fetch, config, officeCode: 'secret' }).updatePlayer('p1', { name: 'Al', isGuest: false })
    expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/players?id=eq.p1')
    expect(calls[0].body).toEqual({ name: 'Al', is_guest: false })
  })

  it('replaceAll deletes matches then players, then inserts players then matches', async () => {
    const { fetch, calls } = fakeFetch((call) => ({ status: 200, body: call.method === 'DELETE' ? [] : [{}] }))
    await createApi({ fetch, config, officeCode: 'secret' }).replaceAll([player], [match])
    expect(calls.map((call) => [call.method, call.url.replace(config.url, '')])).toEqual([
      ['DELETE', '/rest/v1/matches?id=not.is.null'],
      ['DELETE', '/rest/v1/players?id=not.is.null'],
      ['POST', '/rest/v1/players'],
      ['POST', '/rest/v1/matches'],
    ])
    expect(calls[3].body).toEqual([matchToRow(match)])
  })

  it('probeCode calls the office_ok RPC and returns its boolean', async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 200, body: false }))
    expect(await createApi({ fetch, config, officeCode: 'nope' }).probeCode()).toBe(false)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/rpc/office_ok')
  })

  it('maps errors: thrown fetch → network, 401/403 → unauthorized, 5xx → server, empty write → unauthorized', async () => {
    const api = (respond: Parameters<typeof fakeFetch>[0]) =>
      createApi({ fetch: fakeFetch(respond).fetch, config, officeCode: 'secret' })
    expect(await kindOf(api(() => new Error('offline')).fetchAll())).toBe('network')
    expect(await kindOf(api(() => ({ status: 401 })).fetchAll())).toBe('unauthorized')
    expect(await kindOf(api(() => ({ status: 403 })).insertPlayer(player))).toBe('unauthorized')
    expect(await kindOf(api(() => ({ status: 500 })).fetchAll())).toBe('server')
    expect(await kindOf(api(() => ({ status: 200, body: [] })).updatePlayer('p1', { name: 'A', isGuest: false }))).toBe(
      'unauthorized',
    )
    expect(await kindOf(api(() => ({ status: 200, body: [] })).fetchAll())).toBe('none')
  })
})
