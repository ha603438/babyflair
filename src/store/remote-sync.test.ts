import { describe, expect, it, vi } from 'vitest'
import type { RemoteApi } from '../remote/api'
import { RemoteError } from '../remote/api'
import type { Match, Player } from '../types'
import {
  fetchVerified,
  isGateNeeded,
  probeOffice,
  remoteCallFor,
  shouldReconcileAfter,
  statusAfterError,
  subscribeRefetch,
  toastTextFor,
} from './remote-sync'
import type { ListenerTarget, VisibilityDocument } from './remote-sync'

const player: Player = { id: 'p1', name: 'Alice', isGuest: false, createdAt: '2025-10-01T10:00:00.000Z' }
const match: Match = {
  id: 'm1',
  seq: 3,
  playedAt: 'p',
  createdAt: 'p',
  updatedAt: 'p',
  target: 10,
  teamA: ['p1'],
  teamB: ['p2'],
  scoreA: 10,
  scoreB: 4,
}

function recordingApi(overrides: Partial<RemoteApi> = {}): { api: RemoteApi; calls: string[] } {
  const calls: string[] = []
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      calls.push(`${name}(${args.map((arg) => JSON.stringify(arg)).join(',')})`)
      return undefined as never
    }
  const api: RemoteApi = {
    probeCode: record('probeCode'),
    fetchAll: record('fetchAll'),
    fetchCalls: record('fetchCalls'),
    insertCall: record('insertCall'),
    insertCallPlayer: record('insertCallPlayer'),
    upsertCallPlayer: record('upsertCallPlayer'),
    closeCall: record('closeCall'),
    upsertPushSubscription: record('upsertPushSubscription'),
    deletePushSubscription: record('deletePushSubscription'),
    notifyCall: record('notifyCall'),
    insertPlayer: record('insertPlayer'),
    updatePlayer: record('updatePlayer'),
    deletePlayer: record('deletePlayer'),
    insertMatch: record('insertMatch'),
    updateMatch: record('updateMatch'),
    deleteMatch: record('deleteMatch'),
    restoreMatch: record('restoreMatch'),
    replaceAll: record('replaceAll'),
    fetchMatchEvents: record('fetchMatchEvents'),
    ...overrides,
  }
  return { api, calls }
}

describe('isGateNeeded', () => {
  it('never in local mode; in shared mode without a code or when the code was refused', () => {
    expect(isGateNeeded('local', undefined, 'unauthorized')).toBe(false)
    expect(isGateNeeded('shared', undefined, 'idle')).toBe(true)
    expect(isGateNeeded('shared', 'code', 'idle')).toBe(false)
    expect(isGateNeeded('shared', 'code', 'syncing')).toBe(false)
    expect(isGateNeeded('shared', 'code', 'offline')).toBe(false)
    expect(isGateNeeded('shared', 'code', 'unauthorized')).toBe(true)
  })
})

describe('remoteCallFor', () => {
  it('mirrors each data action onto the matching endpoint', async () => {
    const { api, calls } = recordingApi()
    const { seq: _seq, ...input } = match
    await remoteCallFor({ type: 'addPlayer', player }, api)
    await remoteCallFor({ type: 'renamePlayer', id: 'p1', name: 'Al', isGuest: true }, api)
    await remoteCallFor({ type: 'deletePlayer', id: 'p1' }, api)
    await remoteCallFor({ type: 'addMatch', match: input }, api)
    await remoteCallFor({ type: 'updateMatch', match }, api)
    await remoteCallFor({ type: 'deleteMatch', id: 'm1' }, api)
    await remoteCallFor({ type: 'restoreMatch', match, index: 0 }, api)
    expect(calls).toEqual([
      `insertPlayer(${JSON.stringify(player)})`,
      'updatePlayer("p1",{"name":"Al","isGuest":true})',
      'deletePlayer("p1")',
      `insertMatch(${JSON.stringify(input)})`,
      `updateMatch(${JSON.stringify(match)})`,
      'deleteMatch("m1")',
      `restoreMatch(${JSON.stringify(match)})`,
    ])
  })

  it('importAll becomes replaceAll with seq backfilled on the matches', async () => {
    const { api, calls } = recordingApi()
    const { seq: _seq, ...noSeq } = match
    await remoteCallFor(
      { type: 'importAll', players: [player], matches: [noSeq as Match], settings: { lastFormat: '1v1', lastTarget: 5 } },
      api,
    )
    expect(calls).toEqual([`replaceAll([${JSON.stringify(player)}],[${JSON.stringify({ ...noSeq, seq: 1 })}])`])
  })

  it('settings, clearAll, replaceData and addCall stay local', () => {
    const { api, calls } = recordingApi()
    const call = { id: 'c1', createdAt: 'p', expiresAt: 'p', createdBy: 'p1' }
    const organizer = { callId: 'c1', playerId: 'p1', joinedAt: 'p', response: 'in' as const }
    expect(remoteCallFor({ type: 'setSetting', patch: { lastTarget: 5 } }, api)).toBeNull()
    expect(remoteCallFor({ type: 'clearAll' }, api)).toBeNull()
    expect(remoteCallFor({ type: 'replaceData', players: [], matches: [] }, api)).toBeNull()
    expect(remoteCallFor({ type: 'addCall', call, organizer }, api)).toBeNull()
    expect(calls).toEqual([])
  })

  it('respondCall upserts the answer (in or out) and closeCall hits the calls endpoint', async () => {
    const { api, calls } = recordingApi()
    const callPlayer = { callId: 'c1', playerId: 'p2', joinedAt: 'p', response: 'in' as const }
    const declined = { ...callPlayer, joinedAt: 'r', response: 'out' as const }
    await remoteCallFor({ type: 'respondCall', callPlayer }, api)
    await remoteCallFor({ type: 'respondCall', callPlayer: declined }, api)
    await remoteCallFor({ type: 'closeCall', id: 'c1', closedAt: 'q' }, api)
    expect(calls).toEqual([
      `upsertCallPlayer(${JSON.stringify(callPlayer)})`,
      `upsertCallPlayer(${JSON.stringify(declined)})`,
      'closeCall("c1","q")',
    ])
  })
})

describe('fetchVerified', () => {
  it('returns non-empty data without probing', async () => {
    const probeCode = vi.fn(async () => true)
    const { api } = recordingApi({ fetchAll: async () => ({ players: [player], matches: [], calls: [], callPlayers: [] }), probeCode })
    expect(await fetchVerified(api)).toEqual({ players: [player], matches: [], calls: [], callPlayers: [] })
    expect(probeCode).not.toHaveBeenCalled()
  })

  it('probes an empty result: accepted → empty data, refused → unauthorized', async () => {
    const empty = async () => ({ players: [], matches: [], calls: [], callPlayers: [] })
    const { api: ok } = recordingApi({ fetchAll: empty, probeCode: async () => true })
    expect(await fetchVerified(ok)).toEqual({ players: [], matches: [], calls: [], callPlayers: [] })
    const { api: ko } = recordingApi({ fetchAll: empty, probeCode: async () => false })
    await expect(fetchVerified(ko)).rejects.toMatchObject({ kind: 'unauthorized' })
  })
})

describe('probeOffice', () => {
  it('maps the probe to ok / wrong / network / server', async () => {
    const probe = (probeCode: RemoteApi['probeCode']) => probeOffice(recordingApi({ probeCode }).api)
    expect(await probe(async () => true)).toBe('ok')
    expect(await probe(async () => false)).toBe('wrong')
    expect(
      await probe(async () => {
        throw new RemoteError('network')
      }),
    ).toBe('network')
    expect(
      await probe(async () => {
        throw new RemoteError('server')
      }),
    ).toBe('server')
  })
})

describe('error handling helpers', () => {
  it('status, toast and reconciliation per error kind', () => {
    const network = new RemoteError('network')
    const unauthorized = new RemoteError('unauthorized')
    const server = new RemoteError('server')
    expect(statusAfterError(network)).toBe('offline')
    expect(statusAfterError(unauthorized)).toBe('unauthorized')
    expect(statusAfterError(server)).toBe('idle')
    expect(statusAfterError(new Error('x'))).toBe('idle')
    expect(toastTextFor(network)).toBe('Pas de connexion au serveur, réessaie')
    expect(toastTextFor(unauthorized)).toBe('Code du bureau refusé')
    expect(toastTextFor(server)).toBe('Erreur du serveur')
    expect(shouldReconcileAfter(network)).toBe(false)
    expect(shouldReconcileAfter(unauthorized)).toBe(true)
    expect(shouldReconcileAfter(server)).toBe(true)
  })
})

function fakeTarget(): ListenerTarget & { fire: (type: string) => void; count: () => number } {
  const listeners = new Map<string, Set<() => void>>()
  return {
    addEventListener: (type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)?.add(listener)
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener)
    },
    fire: (type) => {
      for (const listener of listeners.get(type) ?? []) listener()
    },
    count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  }
}

describe('subscribeRefetch', () => {
  it('refetches on focus, online and visible; runs the interval only while visible; unsubscribes cleanly', () => {
    const win = fakeTarget()
    const doc = Object.assign(fakeTarget(), { visibilityState: 'visible' }) as VisibilityDocument &
      ReturnType<typeof fakeTarget>
    const refetch = vi.fn()
    const intervals: Array<{ handler: () => void; ms: number }> = []
    const timers = {
      setInterval: (handler: () => void, ms: number) => {
        intervals.push({ handler, ms })
        return intervals.length
      },
      clearInterval: vi.fn(),
    }

    const unsubscribe = subscribeRefetch(win, doc, refetch, 20_000, timers)
    expect(intervals).toHaveLength(1)
    expect(intervals[0].ms).toBe(20_000)

    win.fire('focus')
    win.fire('online')
    expect(refetch).toHaveBeenCalledTimes(2)

    doc.visibilityState = 'hidden'
    doc.fire('visibilitychange')
    expect(timers.clearInterval).toHaveBeenCalledTimes(1)
    expect(refetch).toHaveBeenCalledTimes(2)

    doc.visibilityState = 'visible'
    doc.fire('visibilitychange')
    expect(refetch).toHaveBeenCalledTimes(3)
    expect(intervals).toHaveLength(2)
    intervals[1].handler()
    expect(refetch).toHaveBeenCalledTimes(4)

    unsubscribe()
    expect(timers.clearInterval).toHaveBeenCalledTimes(2)
    expect(win.count()).toBe(0)
    expect(doc.count()).toBe(0)
  })
})
