import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../types'
import { loadStore, normaliseSettings, normaliseStore, saveStore, STORAGE_KEY } from './persistence'
import { initialStore, reducer } from './reducer'

type FakeStorage = {
  data: Map<string, string>
  getItem: (k: string) => string | null
  setItem: (k: string, v: string) => void
}

function fakeStorage(): FakeStorage {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

function sample(): Store {
  let state = initialStore
  const alice = { id: 'a', name: 'Alice', isGuest: false, createdAt: '2025-10-01T10:00:00.000Z' }
  const bob = { id: 'b', name: 'Bob', isGuest: true, createdAt: '2025-10-02T10:00:00.000Z' }
  state = reducer(state, { type: 'addPlayer', player: alice })
  state = reducer(state, { type: 'addPlayer', player: bob })
  state = reducer(state, {
    type: 'addMatch',
    match: {
      id: 'm1',
      playedAt: '2025-10-06T12:42:00.000Z',
      createdAt: '2025-10-06T12:42:00.000Z',
      updatedAt: '2025-10-06T12:42:00.000Z',
      target: 10,
      teamA: ['a'],
      teamB: ['b'],
      scoreA: 10,
      scoreB: 8,
    },
  })
  return reducer(state, { type: 'setSetting', patch: { lastFormat: '1v1', lastExportAt: '2025-10-07T00:00:00.000Z' } })
}

describe('with a working localStorage', () => {
  let storage: FakeStorage

  beforeEach(() => {
    storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a store through the babyflair.v1 key', () => {
    const store = sample()
    expect(saveStore(store)).toBe(true)
    expect(storage.data.has(STORAGE_KEY)).toBe(true)
    expect(STORAGE_KEY).toBe('babyflair.v1')
    expect(loadStore()).toEqual(store)
  })

  it('falls back to initialStore when the key is missing', () => {
    expect(loadStore()).toBe(initialStore)
  })

  it('falls back to initialStore on corrupt JSON, wrong version or missing arrays', () => {
    storage.data.set(STORAGE_KEY, '{not json')
    expect(loadStore()).toBe(initialStore)
    storage.data.set(STORAGE_KEY, JSON.stringify({ ...sample(), version: 2 }))
    expect(loadStore()).toBe(initialStore)
    storage.data.set(STORAGE_KEY, JSON.stringify({ version: 1, players: {}, matches: [] }))
    expect(loadStore()).toBe(initialStore)
    storage.data.set(STORAGE_KEY, JSON.stringify([1, 2]))
    expect(loadStore()).toBe(initialStore)
  })

  it('migrates data written before seq and nextSeq existed', () => {
    const legacy = {
      version: 1,
      players: [{ id: 'a', name: 'Alice' }],
      matches: [
        {
          id: 'm1',
          playedAt: '2025-10-06T12:42:00.000Z',
          target: 10,
          teamA: ['a'],
          teamB: ['b'],
          scoreA: 10,
          scoreB: 8,
        },
        { id: 'm2', playedAt: '2025-10-06T13:00:00.000Z', target: 5, teamA: ['b'], teamB: ['a'], scoreA: 5, scoreB: 1 },
      ],
      settings: { lastFormat: 'nope', lastTarget: 7 },
    }
    storage.data.set(STORAGE_KEY, JSON.stringify(legacy))
    const store = loadStore()
    expect(store.matches.map((m) => m.seq)).toEqual([1, 2])
    expect(store.nextSeq).toBe(3)
    expect(store.matches[0].createdAt).toBe('2025-10-06T12:42:00.000Z')
    expect(store.matches[0].updatedAt).toBe('2025-10-06T12:42:00.000Z')
    expect(store.players[0]).toEqual({ id: 'a', name: 'Alice', isGuest: false, createdAt: new Date(0).toISOString() })
    expect(store.settings).toEqual({ lastFormat: '2v2', lastTarget: 5 })
  })

  it('drops malformed items and keeps a nextSeq that is ahead of the matches', () => {
    const data = {
      version: 1,
      players: [{ id: 'a', name: 'Alice', isGuest: true, createdAt: 'x' }, { name: 'no id' }, 'junk', null],
      matches: [
        {
          id: 'ok',
          seq: 4,
          playedAt: 'p',
          createdAt: 'c',
          updatedAt: 'u',
          target: 10,
          teamA: ['a'],
          teamB: ['b'],
          scoreA: 10,
          scoreB: 0,
        },
        { id: 'bad-target', seq: 5, playedAt: 'p', target: 7, teamA: ['a'], teamB: ['b'], scoreA: 7, scoreB: 0 },
        { id: 'bad-team', seq: 6, playedAt: 'p', target: 10, teamA: 'a', teamB: ['b'], scoreA: 10, scoreB: 0 },
      ],
      settings: { lastFormat: '1v1', lastTarget: 5, installHintDismissedAt: 'd', exportHintDismissedAt: 3 },
      nextSeq: 12,
    }
    const store = normaliseStore(data)
    expect(store?.players).toEqual([{ id: 'a', name: 'Alice', isGuest: true, createdAt: 'x' }])
    expect(store?.matches.map((m) => m.id)).toEqual(['ok'])
    expect(store?.nextSeq).toBe(12)
    expect(store?.settings).toEqual({ lastFormat: '1v1', lastTarget: 5, installHintDismissedAt: 'd' })
    expect(normaliseStore({ ...data, nextSeq: 2 })?.nextSeq).toBe(5)
    expect(normaliseSettings(null)).toEqual({ lastFormat: '2v2', lastTarget: 5 })
  })

  it('saveStore returns false when setItem throws (quota, private mode)', () => {
    storage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(saveStore(sample())).toBe(false)
  })

  it('loadStore falls back when getItem throws', () => {
    storage.getItem = () => {
      throw new Error('SecurityError')
    }
    expect(loadStore()).toBe(initialStore)
  })
})

describe('without any localStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loadStore returns initialStore and saveStore returns false', () => {
    expect(loadStore()).toBe(initialStore)
    expect(saveStore(sample())).toBe(false)
  })
})

describe('normaliseSettings · officeCode', () => {
  it('keeps a non-empty string office code and drops anything else', () => {
    expect(normaliseSettings({ officeCode: 'secret' }).officeCode).toBe('secret')
    expect(normaliseSettings({ officeCode: '' }).officeCode).toBeUndefined()
    expect(normaliseSettings({ officeCode: 42 }).officeCode).toBeUndefined()
  })
})

describe('appels à jouer', () => {
  it('normaliseStore defaults calls to empty arrays and keeps well-formed ones', () => {
    const base = { version: 1, players: [], matches: [] }
    expect(normaliseStore(base)).toMatchObject({ calls: [], callPlayers: [] })
    const data = {
      ...base,
      calls: [{ id: 'c1', createdAt: 'a', expiresAt: 'b', createdBy: 'p1', closedAt: 'z' }, { id: 'no-expiry' }, 'junk'],
      callPlayers: [{ callId: 'c1', playerId: 'p1', joinedAt: 'j' }, { callId: 'c1' }],
    }
    expect(normaliseStore(data)).toMatchObject({
      calls: [{ id: 'c1', createdAt: 'a', expiresAt: 'b', createdBy: 'p1', closedAt: 'z' }],
      callPlayers: [{ callId: 'c1', playerId: 'p1', joinedAt: 'j' }],
    })
  })

  it('normaliseSettings keeps myPlayerId, pushEnabled and the notifications snooze', () => {
    const settings = normaliseSettings({ myPlayerId: 'p1', pushEnabled: true, notifHintDismissedAt: 'd' })
    expect(settings).toMatchObject({ myPlayerId: 'p1', pushEnabled: true, notifHintDismissedAt: 'd' })
    const none = normaliseSettings({ myPlayerId: '', pushEnabled: 'yes' })
    expect(none.myPlayerId).toBeUndefined()
    expect(none.pushEnabled).toBeUndefined()
  })
})

describe('profils', () => {
  it('normaliseSettings keeps profileConfirmed and visitor only when true', () => {
    expect(normaliseSettings({ profileConfirmed: true, visitor: true })).toMatchObject({
      profileConfirmed: true,
      visitor: true,
    })
    const none = normaliseSettings({ profileConfirmed: 'yes', visitor: false })
    expect(none.profileConfirmed).toBeUndefined()
    expect(none.visitor).toBeUndefined()
  })

  it('normaliseStore keeps the authorship of a match when present', () => {
    const match = {
      id: 'm1',
      seq: 1,
      playedAt: '2025-10-06T12:42:00.000Z',
      target: 5,
      teamA: ['a'],
      teamB: ['b'],
      scoreA: 5,
      scoreB: 1,
    }
    const store = normaliseStore({
      version: 1,
      players: [],
      matches: [{ ...match, createdBy: 'a', updatedBy: 'b' }, { ...match, id: 'm2', seq: 2, createdBy: 3 }],
    })
    expect(store?.matches[0]).toMatchObject({ createdBy: 'a', updatedBy: 'b' })
    expect(store?.matches[1].createdBy).toBeUndefined()
  })
})
