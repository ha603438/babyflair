import { describe, expect, it } from 'vitest'
import type { CallPlayer, Match, Player, Store } from '../types'
import { backfillSeq, initialStore, nextSeqOf, playerHasMatches, reducer } from './reducer'

function player(id: string, name = id, isGuest = false): Player {
  return { id, name, isGuest, createdAt: '2025-10-01T10:00:00.000Z' }
}

const PLAYED_AT = '2025-10-06T12:42:00.000Z'

function matchInput(id: string, teamA: string[], teamB: string[], playedAt = PLAYED_AT): Omit<Match, 'seq'> {
  return { id, playedAt, createdAt: playedAt, updatedAt: playedAt, target: 10, teamA, teamB, scoreA: 10, scoreB: 8 }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value
  Object.freeze(value)
  for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
  return value
}

function seeded(): Store {
  let state = initialStore
  state = reducer(state, { type: 'addPlayer', player: player('alice', 'Alice') })
  state = reducer(state, { type: 'addPlayer', player: player('bob', 'Bob') })
  state = reducer(state, { type: 'addPlayer', player: player('chloe', 'Chloé') })
  state = reducer(state, { type: 'addPlayer', player: player('dan', 'Dan') })
  state = reducer(state, { type: 'addMatch', match: matchInput('m1', ['alice', 'bob'], ['chloe', 'dan']) })
  state = reducer(state, { type: 'addMatch', match: matchInput('m2', ['alice'], ['chloe']) })
  state = reducer(state, { type: 'addMatch', match: matchInput('m3', ['bob'], ['dan']) })
  return deepFreeze(state)
}

describe('initialStore', () => {
  it('is empty, version 1, with default settings and nextSeq 1', () => {
    expect(initialStore).toEqual({
      version: 1,
      players: [],
      matches: [],
      settings: { lastFormat: '2v2', lastTarget: 5 },
      nextSeq: 1,
      calls: [],
      callPlayers: [],
    })
  })
})

describe('players', () => {
  it('addPlayer appends without mutating the previous state', () => {
    const before = deepFreeze({ ...initialStore })
    const after = reducer(before, { type: 'addPlayer', player: player('alice') })
    expect(after.players.map((p) => p.id)).toEqual(['alice'])
    expect(before.players).toEqual([])
    expect(after).not.toBe(before)
  })

  it('renamePlayer updates name and guest flag of that player only', () => {
    const state = seeded()
    const after = reducer(state, { type: 'renamePlayer', id: 'bob', name: 'Bobby', isGuest: true })
    expect(after.players.find((p) => p.id === 'bob')).toEqual({ ...player('bob', 'Bobby', true) })
    expect(after.players.find((p) => p.id === 'alice')).toEqual(player('alice', 'Alice'))
    expect(after.players).toHaveLength(4)
  })

  it('deletePlayer removes a player who has no match', () => {
    const state = reducer(seeded(), { type: 'addPlayer', player: player('eve', 'Eve') })
    const after = reducer(state, { type: 'deletePlayer', id: 'eve' })
    expect(after.players.some((p) => p.id === 'eve')).toBe(false)
    expect(after.players).toHaveLength(4)
  })

  it('deletePlayer throws when the player has matches', () => {
    const state = seeded()
    expect(() => reducer(state, { type: 'deletePlayer', id: 'alice' })).toThrow(/alice/)
    expect(playerHasMatches(state.matches, 'alice')).toBe(true)
    expect(playerHasMatches(state.matches, 'nobody')).toBe(false)
  })
})

describe('addMatch', () => {
  it('assigns seq = nextSeq, increments nextSeq and appends', () => {
    const state = seeded()
    expect(state.matches.map((m) => m.seq)).toEqual([1, 2, 3])
    expect(state.nextSeq).toBe(4)
    const after = reducer(state, { type: 'addMatch', match: matchInput('m4', ['alice'], ['dan']) })
    expect(after.matches.at(-1)).toMatchObject({ id: 'm4', seq: 4 })
    expect(after.nextSeq).toBe(5)
    expect(state.matches).toHaveLength(3)
  })

  it('ignores a seq smuggled into the payload', () => {
    const state = seeded()
    const smuggled = { ...matchInput('m4', ['alice'], ['dan']), seq: 99 } as Omit<Match, 'seq'>
    const after = reducer(state, { type: 'addMatch', match: smuggled })
    expect(after.matches.at(-1)?.seq).toBe(4)
  })
})

describe('updateMatch', () => {
  it('keeps id, seq, createdAt and playedAt, takes the new fields and updatedAt', () => {
    const state = seeded()
    const stored = state.matches[1]
    const edited: Match = {
      ...stored,
      seq: 42,
      createdAt: '2030-01-01T00:00:00.000Z',
      playedAt: '2030-01-01T00:00:00.000Z',
      updatedAt: '2025-10-07T09:00:00.000Z',
      teamA: ['bob'],
      teamB: ['dan'],
      target: 5,
      scoreA: 3,
      scoreB: 5,
    }
    const after = reducer(state, { type: 'updateMatch', match: edited })
    expect(after.matches[1]).toEqual({
      id: 'm2',
      seq: 2,
      createdAt: stored.createdAt,
      playedAt: stored.playedAt,
      updatedAt: '2025-10-07T09:00:00.000Z',
      teamA: ['bob'],
      teamB: ['dan'],
      target: 5,
      scoreA: 3,
      scoreB: 5,
    })
    expect(after.matches.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
    expect(after.nextSeq).toBe(4)
  })

  it('is a no-op for an unknown id', () => {
    const state = seeded()
    const after = reducer(state, { type: 'updateMatch', match: { ...state.matches[0], id: 'ghost' } })
    expect(after).toBe(state)
  })

  it('keeps the author: the edit flow rebuilds the match without it', () => {
    const first = { ...seeded().matches[0], createdBy: 'alice' }
    const signed = reducer(seeded(), { type: 'replaceData', players: [], matches: [first] })
    const { createdBy: _author, ...rebuilt } = signed.matches[0]
    const after = reducer(signed, { type: 'updateMatch', match: { ...rebuilt, scoreB: 9 } })
    expect(after.matches[0]).toMatchObject({ createdBy: 'alice', scoreB: 9 })
  })
})

describe('deleteMatch / restoreMatch', () => {
  it('deleteMatch removes the match and keeps nextSeq', () => {
    const state = seeded()
    const after = reducer(state, { type: 'deleteMatch', id: 'm2' })
    expect(after.matches.map((m) => m.id)).toEqual(['m1', 'm3'])
    expect(after.nextSeq).toBe(4)
  })

  it('restoreMatch re-inserts at the exact index so the replay is byte-identical', () => {
    const state = seeded()
    const index = state.matches.findIndex((m) => m.id === 'm2')
    const removed = state.matches[index]
    const deleted = reducer(state, { type: 'deleteMatch', id: 'm2' })
    const restored = reducer(deleted, { type: 'restoreMatch', match: removed, index })
    expect(JSON.stringify(restored)).toBe(JSON.stringify(state))
  })

  it('restoreMatch clamps the index and refuses a duplicate id', () => {
    const state = seeded()
    const removed = state.matches[2]
    const deleted = reducer(state, { type: 'deleteMatch', id: 'm3' })
    const atEnd = reducer(deleted, { type: 'restoreMatch', match: removed, index: 99 })
    expect(atEnd.matches.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
    const atStart = reducer(deleted, { type: 'restoreMatch', match: removed, index: -5 })
    expect(atStart.matches.map((m) => m.id)).toEqual(['m3', 'm1', 'm2'])
    expect(reducer(state, { type: 'restoreMatch', match: removed, index: 0 })).toBe(state)
  })

  it('restoreMatch bumps nextSeq when the restored seq is ahead of it', () => {
    const state = seeded()
    const foreign: Match = { ...matchInput('m9', ['alice'], ['bob']), seq: 10 }
    const after = reducer(state, { type: 'restoreMatch', match: foreign, index: 1 })
    expect(after.nextSeq).toBe(11)
  })
})

describe('importAll', () => {
  it('replaces players, matches and settings and sets nextSeq = max(seq) + 1', () => {
    const state = seeded()
    const matches: Match[] = [
      { ...matchInput('x1', ['p1'], ['p2']), seq: 7 },
      { ...matchInput('x2', ['p2'], ['p1']), seq: 3 },
    ]
    const after = reducer(state, {
      type: 'importAll',
      players: [player('p1'), player('p2')],
      matches,
      settings: { lastFormat: '1v1', lastTarget: 5, lastExportAt: '2025-10-01T00:00:00.000Z' },
    })
    expect(after.players.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(after.matches.map((m) => [m.id, m.seq])).toEqual([
      ['x1', 7],
      ['x2', 3],
    ])
    expect(after.settings).toEqual({ lastFormat: '1v1', lastTarget: 5, lastExportAt: '2025-10-01T00:00:00.000Z' })
    expect(after.nextSeq).toBe(8)
    expect(after.version).toBe(1)
  })

  it('backfills seq in array order for matches lacking one', () => {
    const noSeq = [matchInput('a', ['p1'], ['p2']), matchInput('b', ['p2'], ['p1']), matchInput('c', ['p1'], ['p2'])]
    const after = reducer(initialStore, {
      type: 'importAll',
      players: [player('p1'), player('p2')],
      matches: noSeq as Match[],
      settings: { lastFormat: '2v2', lastTarget: 10 },
    })
    expect(after.matches.map((m) => m.seq)).toEqual([1, 2, 3])
    expect(after.nextSeq).toBe(4)
  })

  it('backfills after the highest existing seq when only some matches have one', () => {
    const mixed = [
      matchInput('a', ['p1'], ['p2']),
      { ...matchInput('b', ['p2'], ['p1']), seq: 5 },
      matchInput('c', ['p1'], ['p2']),
    ] as Match[]
    expect(backfillSeq(mixed).map((m) => m.seq)).toEqual([6, 5, 7])
    expect(nextSeqOf(backfillSeq(mixed))).toBe(8)
    expect(nextSeqOf([])).toBe(1)
  })

  it('returns the same array when every match already has a seq', () => {
    const state = seeded()
    expect(backfillSeq(state.matches)).toBe(state.matches)
  })
})

describe('clearAll / setSetting', () => {
  it('clearAll returns a fresh copy of the initial store (a new identity, so it gets persisted)', () => {
    const cleared = reducer(seeded(), { type: 'clearAll' })
    expect(cleared).toEqual(initialStore)
    expect(cleared).not.toBe(initialStore)
  })

  it('setSetting merges the patch', () => {
    const state = seeded()
    const patch = { lastFormat: '1v1', lastExportAt: '2025-10-10T00:00:00.000Z' } as const
    const after = reducer(state, { type: 'setSetting', patch })
    expect(after.settings).toEqual({ lastFormat: '1v1', lastTarget: 5, lastExportAt: '2025-10-10T00:00:00.000Z' })
    expect(state.settings).toEqual({ lastFormat: '2v2', lastTarget: 5 })
  })
})

describe('replaceData', () => {
  it('replaces players and matches, keeps settings, recomputes nextSeq and backfills a missing seq', () => {
    const state = reducer(seeded(), { type: 'setSetting', patch: { officeCode: 'secret', lastTarget: 5 } })
    const incoming = [{ ...matchInput('s1', ['p1'], ['p2']), seq: 12 }, matchInput('s2', ['p2'], ['p1']) as Match]
    const after = reducer(state, { type: 'replaceData', players: [player('p1'), player('p2')], matches: incoming })
    expect(after.players.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(after.matches.map((m) => [m.id, m.seq])).toEqual([
      ['s1', 12],
      ['s2', 13],
    ])
    expect(after.nextSeq).toBe(14)
    expect(after.settings).toEqual({ lastFormat: '2v2', lastTarget: 5, officeCode: 'secret' })
  })
})

describe('importAll with an office code', () => {
  it('keeps the office code of this phone, never the one of the file', () => {
    const state = reducer(seeded(), { type: 'setSetting', patch: { officeCode: 'secret' } })
    const after = reducer(state, {
      type: 'importAll',
      players: [],
      matches: [],
      settings: { lastFormat: '1v1', lastTarget: 5, officeCode: 'other' },
    })
    expect(after.settings).toEqual({ lastFormat: '1v1', lastTarget: 5, officeCode: 'secret' })
  })

  it('keeps the profile and the notifications of this phone, never the ones of the file', () => {
    const phone = {
      officeCode: 'secret',
      myPlayerId: 'alice',
      profileConfirmed: true,
      visitor: false,
      pushEnabled: true,
    }
    const state = reducer(seeded(), { type: 'setSetting', patch: phone })
    const after = reducer(state, {
      type: 'importAll',
      players: [],
      matches: [],
      settings: { lastFormat: '2v2', lastTarget: 10, myPlayerId: 'bob', visitor: true },
    })
    expect(after.settings).toEqual({ lastFormat: '2v2', lastTarget: 10, ...phone })
  })
})

describe('appels à jouer', () => {
  const call = { id: 'c1', createdAt: 'a', expiresAt: 'b', createdBy: 'alice' }
  const organizer: CallPlayer = { callId: 'c1', playerId: 'alice', joinedAt: 'a', response: 'in' }

  it('addCall appends the call and its organizer once', () => {
    const state = reducer(seeded(), { type: 'addCall', call, organizer })
    expect(state.calls).toEqual([call])
    expect(state.callPlayers).toEqual([organizer])
    expect(reducer(state, { type: 'addCall', call, organizer })).toBe(state)
  })

  it('respondCall adds an answer, then replaces it when the player changes their mind', () => {
    const state = reducer(seeded(), { type: 'addCall', call, organizer })
    const bob: CallPlayer = { callId: 'c1', playerId: 'bob', joinedAt: 'c', response: 'in' }
    const joined = reducer(state, { type: 'respondCall', callPlayer: bob })
    expect(joined.callPlayers).toEqual([organizer, bob])
    const declined = reducer(joined, { type: 'respondCall', callPlayer: { ...bob, joinedAt: 'd', response: 'out' } })
    expect(declined.callPlayers).toEqual([organizer, { ...bob, joinedAt: 'd', response: 'out' }])
    const back = reducer(declined, { type: 'respondCall', callPlayer: { ...bob, joinedAt: 'e' } })
    expect(back.callPlayers).toEqual([organizer, { ...bob, joinedAt: 'e' }])
  })

  it('respondCall keeps the answers of other calls and other players apart', () => {
    let state = reducer(seeded(), { type: 'addCall', call, organizer })
    state = reducer(state, { type: 'addCall', call: { ...call, id: 'c2' }, organizer: { ...organizer, callId: 'c2' } })
    const declined = reducer(state, { type: 'respondCall', callPlayer: { ...organizer, joinedAt: 'z', response: 'out' } })
    expect(declined.callPlayers).toEqual([{ ...organizer, joinedAt: 'z', response: 'out' }, { ...organizer, callId: 'c2' }])
    const chloe: CallPlayer = { callId: 'c2', playerId: 'chloe', joinedAt: 'y', response: 'out' }
    expect(reducer(declined, { type: 'respondCall', callPlayer: chloe }).callPlayers).toHaveLength(3)
  })

  it('closeCall stamps closedAt once and leaves other calls alone', () => {
    const other = { ...call, id: 'c2' }
    let state = reducer(seeded(), { type: 'addCall', call, organizer })
    state = reducer(state, { type: 'addCall', call: other, organizer: { ...organizer, callId: 'c2' } })
    const closed = reducer(state, { type: 'closeCall', id: 'c1', closedAt: 'z' })
    expect(closed.calls).toEqual([{ ...call, closedAt: 'z' }, other])
    expect(reducer(closed, { type: 'closeCall', id: 'c1', closedAt: 'later' }).calls[0].closedAt).toBe('z')
  })

  it('replaceData replaces the calls (empty when the server sends none) and clearAll drops them', () => {
    const state = reducer(seeded(), { type: 'addCall', call, organizer })
    const replaced = reducer(state, { type: 'replaceData', players: state.players, matches: state.matches, calls: [call], callPlayers: [] })
    expect(replaced.calls).toEqual([call])
    expect(replaced.callPlayers).toEqual([])
    expect(reducer(state, { type: 'replaceData', players: [], matches: [] }).calls).toEqual([])
    expect(reducer(state, { type: 'clearAll' }).calls).toEqual([])
  })
})

describe('announcements', () => {
  it('addMatch, updateMatch and restoreMatch clamp them to the target; an edit can remove one', () => {
    const state = seeded()
    const input = matchInput('m4', ['alice'], ['dan'])
    const fiveTwo = { ...input, target: 5 as const, scoreA: 5, scoreB: 2, betA: 7, betB: 2 }
    const added = reducer(state, { type: 'addMatch', match: fiveTwo })
    expect(added.matches.at(-1)).toMatchObject({ betA: 5, betB: 2 })
    const edited = reducer(state, { type: 'updateMatch', match: { ...state.matches[0], betB: 3 } })
    expect(edited.matches[0].betB).toBe(3)
    const { betB: _removed, ...without } = edited.matches[0]
    const cleared = reducer(edited, { type: 'updateMatch', match: without })
    expect('betB' in cleared.matches[0]).toBe(false)
    const removed = { ...state.matches[2], betA: 0 }
    const gone = reducer(state, { type: 'deleteMatch', id: removed.id })
    expect('betA' in reducer(gone, { type: 'restoreMatch', match: removed, index: 2 }).matches[2]).toBe(false)
  })

  it('importAll keeps the array when there is nothing to fix', () => {
    const valid: Match = { ...matchInput('x1', ['p1'], ['p2']), seq: 1, betA: 3 }
    const settings = { lastFormat: '1v1', lastTarget: 5 } as const
    const matches = [valid]
    const players = [player('p1'), player('p2')]
    const imported = reducer(initialStore, { type: 'importAll', players, matches, settings })
    expect(imported.matches).toBe(matches)
  })
})

describe('comeback', () => {
  const fiveFour = { target: 5, scoreA: 5, scoreB: 4 } as const

  it('addMatch, updateMatch and restoreMatch keep a comeback on a 5-4 in 5 and drop a stray one', () => {
    const state = seeded()
    const input = matchInput('m4', ['alice'], ['dan'])
    const added = reducer(state, { type: 'addMatch', match: { ...input, ...fiveFour, comeback: true } })
    expect(added.matches.at(-1)?.comeback).toBe(true)
    const stray = reducer(state, { type: 'addMatch', match: { ...input, comeback: true } })
    expect(stray.matches.at(-1)?.comeback).toBe(false)
    const edited = reducer(state, { type: 'updateMatch', match: { ...state.matches[0], ...fiveFour, comeback: true } })
    expect(edited.matches[0]).toMatchObject({ ...fiveFour, comeback: true })
    const unticked = reducer(edited, { type: 'updateMatch', match: { ...edited.matches[0], scoreB: 3 } })
    expect(unticked.matches[0]).toMatchObject({ scoreB: 3, comeback: false })
    const removed = { ...state.matches[2], comeback: true }
    const without = reducer(state, { type: 'deleteMatch', id: removed.id })
    expect(reducer(without, { type: 'restoreMatch', match: removed, index: 2 }).matches[2].comeback).toBe(false)
  })

  it('importAll and replaceData drop stray flags and keep the array when there is nothing to fix', () => {
    const valid: Match = { ...matchInput('x1', ['p1'], ['p2']), ...fiveFour, seq: 1, comeback: true }
    const stray: Match = { ...matchInput('x2', ['p2'], ['p1']), seq: 2, comeback: true }
    const settings = { lastFormat: '1v1', lastTarget: 5 } as const
    const players = [player('p1'), player('p2')]
    const imported = reducer(initialStore, { type: 'importAll', players, matches: [valid, stray], settings })
    expect(imported.matches.map((m) => m.comeback)).toEqual([true, false])
    const replaced = reducer(initialStore, { type: 'replaceData', players, matches: [valid, stray] })
    expect(replaced.matches.map((m) => m.comeback)).toEqual([true, false])
    const clean = [valid]
    expect(reducer(initialStore, { type: 'replaceData', players, matches: clean }).matches).toBe(clean)
  })
})
