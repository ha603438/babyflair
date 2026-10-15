import { describe, expect, it } from 'vitest'
import type { Call, CallPlayer, CallResponse, Player, PlayerStatus } from '../types'
import {
  anyOpenCall,
  CALL_FULL_MS,
  CALL_RECRUIT_MS,
  callResponses,
  canFormTeams,
  canRespond,
  hotListCaption,
  isCallFull,
  isCallOpen,
  isInCall,
  nameFor,
  newCall,
  newCallPlayer,
  notifyToast,
  openCallFor,
  parseCallResponse,
  participantIdsOf,
  responseOf,
  rosterLine,
  rosterOf,
} from './calls'
import { createSeenCalls } from './seen'
import type { StorageLike } from './seen'
import { callToShow } from './watch'

const NOW = new Date('2026-10-12T10:00:00.000Z')
const later = (minutes: number): string => new Date(NOW.getTime() + minutes * 60_000).toISOString()

function call(id: string, patch: Partial<Call> = {}): Call {
  return { id, createdAt: later(-10), expiresAt: later(35), createdBy: 'alice', ...patch }
}

function cp(callId: string, playerId: string, minutesAgo = 5, response: CallResponse = 'in'): CallPlayer {
  return { callId, playerId, joinedAt: later(-minutesAgo), response }
}

const PLAYERS = new Map<string, Player>(
  ['alice', 'bob', 'chloe', 'dan'].map((id) => [id, { id, name: id[0].toUpperCase() + id.slice(1), isGuest: false, createdAt: 'x' }]),
)

describe('newCall / newCallPlayer', () => {
  it('recruits for 5 minutes after creation', () => {
    const created = newCall('c1', 'alice', NOW)
    expect(created).toEqual({ id: 'c1', createdAt: NOW.toISOString(), expiresAt: later(5), createdBy: 'alice' })
    expect(CALL_RECRUIT_MS).toBe(5 * 60 * 1000)
    expect(CALL_FULL_MS).toBe(45 * 60 * 1000)
    const bob = { callId: 'c1', playerId: 'bob', joinedAt: NOW.toISOString(), response: 'in' }
    expect(newCallPlayer('c1', 'bob', NOW)).toEqual(bob)
    expect(newCallPlayer('c1', 'bob', NOW, 'out').response).toBe('out')
  })
})

describe('isCallOpen', () => {
  it('is false once closed, expired or unparsable', () => {
    expect(isCallOpen(call('c1'), NOW)).toBe(true)
    expect(isCallOpen(call('c1', { closedAt: later(-1) }), NOW)).toBe(false)
    expect(isCallOpen(call('c1', { expiresAt: later(-1) }), NOW)).toBe(false)
    expect(isCallOpen(call('c1', { expiresAt: 'nope' }), NOW)).toBe(false)
  })
})

describe('participants', () => {
  const players = [cp('c1', 'bob', 2), cp('c2', 'dan', 1), cp('c1', 'alice', 9)]

  it('lists the participants of a call in join order', () => {
    expect(participantIdsOf('c1', players)).toEqual(['alice', 'bob'])
    expect(participantIdsOf('c3', players)).toEqual([])
  })

  it('knows who is in and when the call is full', () => {
    expect(isInCall('c1', players, 'bob')).toBe(true)
    expect(isInCall('c1', players, 'dan')).toBe(false)
    expect(isInCall('c1', players, undefined)).toBe(false)
    expect(isCallFull('c1', players)).toBe(false)
    const four = ['a', 'b', 'c', 'd'].map((id) => cp('c1', id))
    expect(isCallFull('c1', four)).toBe(true)
    expect(canFormTeams(3)).toBe(false)
    expect(canFormTeams(4)).toBe(true)
  })

  it('builds the roster with the organizer and the known players', () => {
    const roster = rosterOf(call('c1'), [cp('c1', 'bob', 2), cp('c1', 'alice', 9), cp('c1', 'ghost', 1)], PLAYERS)
    expect(roster.organizer?.name).toBe('Alice')
    expect(roster.participants.map((p) => p.name)).toEqual(['Alice', 'Bob'])
    expect(roster.participantIds).toEqual(['alice', 'bob', 'ghost'])
  })
})

describe('answers (in / out)', () => {
  const answers = [cp('c1', 'alice', 9), cp('c1', 'bob', 4, 'out'), cp('c1', 'chloe', 2), cp('c2', 'dan', 1, 'out')]

  it('reads a missing or unknown stored response as in', () => {
    expect(parseCallResponse('out')).toBe('out')
    expect(parseCallResponse('in')).toBe('in')
    expect(parseCallResponse(undefined)).toBe('in')
    expect(parseCallResponse('maybe')).toBe('in')
  })

  it('only counts the « Chauuud » answers as participants', () => {
    expect(participantIdsOf('c1', answers)).toEqual(['alice', 'chloe'])
    expect(isInCall('c1', answers, 'chloe')).toBe(true)
    expect(isInCall('c1', answers, 'bob')).toBe(false)
    expect(responseOf('c1', answers, 'bob')).toBe('out')
    expect(responseOf('c1', answers, 'dan')).toBeUndefined()
    expect(responseOf('c1', answers, undefined)).toBeUndefined()
  })

  it('is full with 4 in, whatever the number of out', () => {
    const three = ['a', 'b', 'c'].map((id) => cp('c1', id))
    const withOuts = [...three, cp('c1', 'x', 1, 'out'), cp('c1', 'y', 1, 'out')]
    expect(isCallFull('c1', withOuts)).toBe(false)
    expect(isCallFull('c1', [...withOuts, cp('c1', 'd')])).toBe(true)
    expect(rosterOf(call('c1'), withOuts, PLAYERS).participantIds).toEqual(['a', 'b', 'c'])
  })

  it('refuses « Chauuud » once 4 are in, but declining is always possible', () => {
    const four = ['a', 'b', 'c', 'd'].map((id) => cp('c1', id))
    expect(canRespond('c1', four, 'e', 'in')).toBe(false)
    expect(canRespond('c1', four, 'e', 'out')).toBe(true)
    expect(canRespond('c1', four, 'a', 'out')).toBe(true)
    expect(canRespond('c1', four.slice(0, 3), 'e', 'in')).toBe(true)
  })

  it('lets a player change their mind, and skips an unchanged answer', () => {
    expect(canRespond('c1', answers, 'bob', 'in')).toBe(true)
    expect(canRespond('c1', answers, 'bob', 'out')).toBe(false)
    expect(canRespond('c1', answers, 'chloe', 'out')).toBe(true)
    expect(canRespond('c1', answers, 'chloe', 'in')).toBe(false)
    const changed = [cp('c1', 'alice', 9), cp('c1', 'bob', 4, 'out'), cp('c1', 'chloe', 1, 'out')]
    expect(participantIdsOf('c1', changed)).toEqual(['alice'])
  })

  it('a full call frees a place when one of the 4 declines', () => {
    const four = ['a', 'b', 'c', 'd'].map((id) => cp('c1', id))
    const declined = [...four.slice(0, 3), cp('c1', 'd', 1, 'out')]
    expect(isCallFull('c1', declined)).toBe(false)
    expect(openCallFor([call('c1')], declined, 'zoe', NOW)?.id).toBe('c1')
  })
})

describe('callResponses', () => {
  const named = (id: string, patch: Partial<Player> = {}): Player => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    isGuest: false,
    createdAt: 'x',
    ...patch,
  })
  const everyone = [
    named('alice'),
    named('bob'),
    named('chloe'),
    named('dan'),
    named('émile'),
    named('zoe'),
    named('guest', { isGuest: true }),
    named('old'),
  ]
  const status = (entries: Array<[string, PlayerStatus]>) => new Map(entries.map(([id, s]) => [id, { status: s }]))
  const byPlayer = status([['old', 'inactive'], ['zoe', 'rookie'], ['bob', 'ranked']])
  const names = (players: Player[]) => players.map((player) => player.name)

  it('splits the office into in (organizer first), out and pending (A→Z, no guest, no inactive)', () => {
    const answers = [cp('c1', 'chloe', 8), cp('c1', 'alice', 6), cp('c1', 'dan', 4, 'out'), cp('c1', 'bob', 7, 'out')]
    const lists = callResponses(call('c1'), answers, everyone, byPlayer)
    expect(names(lists.in)).toEqual(['Alice', 'Chloe'])
    expect(names(lists.out)).toEqual(['Bob', 'Dan'])
    expect(names(lists.pending)).toEqual(['Émile', 'Zoe'])
  })

  it('ignores the answers of other calls and of deleted players, and lists everyone pending at first', () => {
    const answers = [cp('c1', 'alice', 6), cp('c2', 'bob', 1), cp('c1', 'ghost', 2)]
    const lists = callResponses(call('c1'), answers, everyone, new Map())
    expect(names(lists.in)).toEqual(['Alice'])
    expect(lists.out).toEqual([])
    expect(names(lists.pending)).toEqual(['Bob', 'Chloe', 'Dan', 'Émile', 'Old', 'Zoe'])
  })

  it('lists an organizer who declined with the out answers; answered guests and inactive players show', () => {
    const answers = [cp('c1', 'alice', 9, 'out'), cp('c1', 'guest', 3), cp('c1', 'old', 2, 'out')]
    const lists = callResponses(call('c1'), answers, everyone, byPlayer)
    expect(names(lists.in)).toEqual(['Guest'])
    expect(names(lists.out)).toEqual(['Alice', 'Old'])
  })

  it('follows a change of mind', () => {
    const before = [cp('c1', 'alice', 9), cp('c1', 'bob', 5)]
    const after = [cp('c1', 'alice', 9), cp('c1', 'bob', 1, 'out')]
    expect(names(callResponses(call('c1'), before, everyone, byPlayer).in)).toEqual(['Alice', 'Bob'])
    expect(names(callResponses(call('c1'), after, everyone, byPlayer).out)).toEqual(['Bob'])
  })
})

describe('openCallFor', () => {
  it('ignores closed and expired calls, prefers the newest', () => {
    const calls = [
      call('old', { createdAt: later(-30) }),
      call('new', { createdAt: later(-5) }),
      call('closed', { createdAt: later(-1), closedAt: later(-1) }),
      call('expired', { createdAt: later(-1), expiresAt: later(-1) }),
    ]
    expect(openCallFor(calls, [], undefined, NOW)?.id).toBe('new')
    expect(anyOpenCall(calls, NOW)?.id).toBe('new')
    expect(openCallFor([], [], undefined, NOW)).toBeNull()
  })

  it('skips a full call unless the viewer is in it; anyOpenCall still returns it', () => {
    const four = ['a', 'b', 'c', 'd'].map((id) => cp('c1', id))
    expect(openCallFor([call('c1')], four, 'zoe', NOW)).toBeNull()
    expect(openCallFor([call('c1')], four, 'b', NOW)?.id).toBe('c1')
    expect(anyOpenCall([call('c1')], NOW)?.id).toBe('c1')
  })
})

describe('copy', () => {
  it('rosterLine and notifyToast', () => {
    expect(rosterLine('Alice', 2)).toBe('Alice propose un baby · 2/4 présents')
    expect(rosterLine(undefined, 5)).toBe('Quelqu’un propose un baby · 4/4 présents')
    expect(hotListCaption(2)).toBe('Chauds · 2/4')
    expect(hotListCaption(5)).toBe('Chauds · 4/4')
    const bob: Player = { id: 'bob', name: 'Bob', isGuest: false, createdAt: 'x' }
    expect(nameFor(bob, 'bob')).toBe('Bob (toi)')
    expect(nameFor(bob, 'alice')).toBe('Bob')
    expect(nameFor(bob, undefined)).toBe('Bob')
    expect(notifyToast(0)).toBe('Notification envoyée à 0 téléphones')
    expect(notifyToast(1)).toBe('Notification envoyée à 1 téléphone')
    expect(notifyToast(3)).toBe('Notification envoyée à 3 téléphones')
  })
})

describe('seen calls', () => {
  function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
    const data = new Map(Object.entries(initial))
    return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) }
  }

  it('remembers ids in memory and in the storage', () => {
    const storage = memoryStorage()
    const seen = createSeenCalls(storage)
    expect(seen.has('c1')).toBe(false)
    seen.add('c1')
    expect(seen.has('c1')).toBe(true)
    expect(JSON.parse(storage.data.get('babyflair.calls.seen') ?? '')).toEqual(['c1'])
    expect(createSeenCalls(storage).has('c1')).toBe(true)
  })

  it('survives a missing or corrupt storage', () => {
    expect(createSeenCalls(null).has('c1')).toBe(false)
    const seen = createSeenCalls(memoryStorage({ 'babyflair.calls.seen': '{oops' }))
    seen.add('c1')
    expect(seen.has('c1')).toBe(true)
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const blocked = createSeenCalls(throwing)
    blocked.add('c2')
    expect(blocked.has('c2')).toBe(true)
  })
})

describe('callToShow', () => {
  const base = { callPlayers: [], viewerId: undefined, now: NOW, forcedId: undefined, awaitingFirstSync: false }

  it('shows the open call once (seen ids are skipped)', () => {
    const calls = [call('c1')]
    expect(callToShow({ ...base, calls, hasSeen: () => false })).toEqual({ id: 'c1', call: calls[0] })
    expect(callToShow({ ...base, calls, hasSeen: (id) => id === 'c1' })).toBeNull()
  })

  it('a forced call is shown even when seen, and reads « terminé » when closed, expired or unknown', () => {
    const calls = [call('c1'), call('done', { closedAt: later(-1) })]
    expect(callToShow({ ...base, calls, forcedId: 'c1', hasSeen: () => true })).toEqual({ id: 'c1', call: calls[0] })
    expect(callToShow({ ...base, calls, forcedId: 'done', hasSeen: () => false })).toEqual({ id: 'done', call: null })
    expect(callToShow({ ...base, calls, forcedId: 'nope', hasSeen: () => false })).toEqual({ id: 'nope', call: null })
  })

  it('waits for the first sync before declaring a forced call unknown', () => {
    expect(callToShow({ ...base, calls: [], forcedId: 'c1', awaitingFirstSync: true, hasSeen: () => false })).toBeNull()
  })
})

describe('call lifetime', () => {
  const call = newCall('c1', 'a', NOW)
  const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60 * 1000)
  const joined = (ids: string[]) => ids.map((id) => newCallPlayer('c1', id, NOW))
  it('is over after 5 minutes without 4 players', () => {
    expect(isCallOpen(call, at(4), joined(['a', 'b', 'c']))).toBe(true)
    expect(isCallOpen(call, at(6), joined(['a', 'b', 'c']))).toBe(false)
  })
  it('stays open for the 4 players until 45 minutes, unless closed', () => {
    const four = joined(['a', 'b', 'c', 'd'])
    expect(isCallOpen(call, at(20), four)).toBe(true)
    expect(isCallOpen(call, at(46), four)).toBe(false)
    expect(isCallOpen({ ...call, closedAt: at(1).toISOString() }, at(2), four)).toBe(false)
  })
})
