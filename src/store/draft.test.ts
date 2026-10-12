import { describe, expect, it } from 'vitest'
import type { Draft } from '../types'
import { draftReducer, initialDraft, isDraftComplete, NO_ACTIVE_SLOT, visibleSlots } from './draft'
import type { DraftAction } from './draft'

const SETTINGS = { lastFormat: '2v2', lastTarget: 10 } as const

function run(draft: Draft, ...actions: DraftAction[]): Draft {
  return actions.reduce(draftReducer, draft)
}

function pickAll(draft: Draft, ...ids: string[]): Draft {
  return run(draft, ...ids.map((playerId): DraftAction => ({ type: 'pick', playerId })))
}

describe('initialDraft', () => {
  it('takes format and target from settings, empty slots, slot 0 active, step players', () => {
    expect(initialDraft({ lastFormat: '1v1', lastTarget: 5 })).toEqual({
      format: '1v1',
      target: 5,
      slots: [null, null, null, null],
      activeSlot: 0,
      score: null,
      step: 'players',
    })
  })

  it('visibleSlots gives the fill order per format', () => {
    expect(visibleSlots('2v2')).toEqual([0, 1, 2, 3])
    expect(visibleSlots('1v1')).toEqual([0, 2])
  })
})

describe('pick', () => {
  it('fills 0, 1, 2, 3 in order in 2v2 and opens the score step when complete', () => {
    const d0 = initialDraft(SETTINGS)
    const d1 = draftReducer(d0, { type: 'pick', playerId: 'a' })
    expect(d1.slots).toEqual(['a', null, null, null])
    expect(d1.activeSlot).toBe(1)
    expect(d1.step).toBe('players')
    const d3 = pickAll(d1, 'b', 'c')
    expect(d3.slots).toEqual(['a', 'b', 'c', null])
    expect(d3.activeSlot).toBe(3)
    expect(d3.step).toBe('players')
    expect(isDraftComplete(d3)).toBe(false)
    const d4 = draftReducer(d3, { type: 'pick', playerId: 'd' })
    expect(d4.slots).toEqual(['a', 'b', 'c', 'd'])
    expect(d4.activeSlot).toBe(NO_ACTIVE_SLOT)
    expect(d4.step).toBe('score')
    expect(isDraftComplete(d4)).toBe(true)
    expect(d0.slots).toEqual([null, null, null, null])
  })

  it('uses slots 0 and 2 in 1v1', () => {
    const d = pickAll(initialDraft({ lastFormat: '1v1', lastTarget: 10 }), 'a')
    expect(d.slots).toEqual(['a', null, null, null])
    expect(d.activeSlot).toBe(2)
    const done = draftReducer(d, { type: 'pick', playerId: 'b' })
    expect(done.slots).toEqual(['a', null, 'b', null])
    expect(done.step).toBe('score')
    expect(done.activeSlot).toBe(NO_ACTIVE_SLOT)
  })

  it('on a player already in a slot removes him and makes that slot active', () => {
    const full = pickAll(initialDraft(SETTINGS), 'a', 'b', 'c', 'd')
    const withScore = draftReducer(full, { type: 'setScore', score: { winner: 'A', loserGoals: 8 } })
    const d = draftReducer(withScore, { type: 'pick', playerId: 'b' })
    expect(d.slots).toEqual(['a', null, 'c', 'd'])
    expect(d.activeSlot).toBe(1)
    expect(d.step).toBe('players')
    expect(d.score).toBeNull()
  })

  it('fills the active slot (replacing its player) and advances to the first empty slot', () => {
    const d = pickAll(initialDraft(SETTINGS), 'a', 'b', 'c')
    const replaced = run(d, { type: 'setActiveSlot', index: 0 }, { type: 'pick', playerId: 'z' })
    expect(replaced.slots).toEqual(['z', 'b', 'c', null])
    expect(replaced.activeSlot).toBe(3)
    expect(replaced.step).toBe('players')
  })

  it('is a no-op when all slots are full and none is active', () => {
    const full = pickAll(initialDraft(SETTINGS), 'a', 'b', 'c', 'd')
    const back = draftReducer(full, { type: 'goToPlayers' })
    expect(back.step).toBe('players')
    expect(back.activeSlot).toBe(NO_ACTIVE_SLOT)
    expect(draftReducer(back, { type: 'pick', playerId: 'z' })).toBe(back)
  })

  it('never shows a player twice after a hidden slot kept him in memory', () => {
    const d = pickAll(initialDraft(SETTINGS), 'a', 'b')
    const oneVone = draftReducer(d, { type: 'setFormat', format: '1v1' })
    expect(oneVone.activeSlot).toBe(2)
    const picked = draftReducer(oneVone, { type: 'pick', playerId: 'b' })
    expect(picked.slots).toEqual(['a', null, 'b', null])
    expect(picked.step).toBe('score')
  })
})

describe('setFormat / setTarget', () => {
  it('switching to 1v1 hides slots 1 and 3 but keeps their ids, and clears the score', () => {
    const full = pickAll(initialDraft(SETTINGS), 'a', 'b', 'c', 'd')
    const scored = draftReducer(full, { type: 'setScore', score: { winner: 'B', loserGoals: 3 } })
    const oneVone = draftReducer(scored, { type: 'setFormat', format: '1v1' })
    expect(oneVone.format).toBe('1v1')
    expect(oneVone.slots).toEqual(['a', 'b', 'c', 'd'])
    expect(oneVone.score).toBeNull()
    expect(oneVone.step).toBe('score')
    expect(oneVone.activeSlot).toBe(NO_ACTIVE_SLOT)
    const backTo2v2 = draftReducer(oneVone, { type: 'setFormat', format: '2v2' })
    expect(backTo2v2.slots).toEqual(['a', 'b', 'c', 'd'])
    expect(backTo2v2.step).toBe('score')
  })

  it('switching 1v1 to 2v2 reopens the players step on the first missing slot', () => {
    const d = pickAll(initialDraft({ lastFormat: '1v1', lastTarget: 10 }), 'a', 'b')
    expect(d.step).toBe('score')
    const twoVtwo = draftReducer(d, { type: 'setFormat', format: '2v2' })
    expect(twoVtwo.step).toBe('players')
    expect(twoVtwo.activeSlot).toBe(1)
    expect(twoVtwo.slots).toEqual(['a', null, 'b', null])
  })

  it('keeps a still-visible active slot when switching format', () => {
    const d = run(initialDraft(SETTINGS), { type: 'pick', playerId: 'a' }, { type: 'setActiveSlot', index: 2 })
    expect(draftReducer(d, { type: 'setFormat', format: '1v1' }).activeSlot).toBe(2)
    const onHidden = run(initialDraft(SETTINGS), { type: 'setActiveSlot', index: 1 })
    expect(draftReducer(onHidden, { type: 'setFormat', format: '1v1' }).activeSlot).toBe(0)
  })

  it('same format is a no-op; from done it only records the format for the next match', () => {
    const d = initialDraft(SETTINGS)
    expect(draftReducer(d, { type: 'setFormat', format: '2v2' })).toBe(d)
    const done = run(pickAll(d, 'a', 'b', 'c', 'd'), { type: 'saved', matchId: 'm1' })
    const next = draftReducer(done, { type: 'setFormat', format: '1v1' })
    expect(next).toEqual({ ...done, format: '1v1' })
    expect(draftReducer(next, { type: 'reset' })).toEqual(initialDraft({ lastFormat: '1v1', lastTarget: 10 }))
  })

  it('setTarget clears the score and keeps the step', () => {
    const full = pickAll(initialDraft(SETTINGS), 'a', 'b', 'c', 'd')
    const scored = draftReducer(full, { type: 'setScore', score: { winner: 'A', loserGoals: 9 } })
    const five = draftReducer(scored, { type: 'setTarget', target: 5 })
    expect(five.target).toBe(5)
    expect(five.score).toBeNull()
    expect(five.step).toBe('score')
    expect(draftReducer(five, { type: 'setTarget', target: 5 })).toBe(five)
  })
})

describe('slots, score and navigation', () => {
  it('setActiveSlot returns to the players step without clearing anything', () => {
    const full = pickAll(initialDraft(SETTINGS), 'a', 'b', 'c', 'd')
    const scored = draftReducer(full, { type: 'setScore', score: { winner: 'A', loserGoals: 8 } })
    const d = draftReducer(scored, { type: 'setActiveSlot', index: 2 })
    expect(d.step).toBe('players')
    expect(d.activeSlot).toBe(2)
    expect(d.slots).toEqual(['a', 'b', 'c', 'd'])
    expect(d.score).toEqual({ winner: 'A', loserGoals: 8 })
  })

  it('setActiveSlot ignores hidden or out-of-range slots and the done step', () => {
    const oneVone = initialDraft({ lastFormat: '1v1', lastTarget: 10 })
    expect(draftReducer(oneVone, { type: 'setActiveSlot', index: 1 })).toBe(oneVone)
    expect(draftReducer(oneVone, { type: 'setActiveSlot', index: 7 })).toBe(oneVone)
    const done = run(pickAll(initialDraft(SETTINGS), 'a', 'b', 'c', 'd'), { type: 'saved', matchId: 'm1' })
    expect(draftReducer(done, { type: 'setActiveSlot', index: 0 })).toBe(done)
  })

  it('clearSlot empties the slot, makes it active and clears the score', () => {
    const full = pickAll(initialDraft(SETTINGS), 'a', 'b', 'c', 'd')
    const scored = draftReducer(full, { type: 'setScore', score: { winner: 'A', loserGoals: 8 } })
    const d = draftReducer(scored, { type: 'clearSlot', index: 3 })
    expect(d.slots).toEqual(['a', 'b', 'c', null])
    expect(d.activeSlot).toBe(3)
    expect(d.step).toBe('players')
    expect(d.score).toBeNull()
    const empty = draftReducer(initialDraft(SETTINGS), { type: 'clearSlot', index: 2 })
    expect(empty.activeSlot).toBe(2)
    const oneVone = initialDraft({ lastFormat: '1v1', lastTarget: 10 })
    expect(draftReducer(oneVone, { type: 'clearSlot', index: 1 }).activeSlot).toBe(0)
  })

  it('setScore stores the score, goToPlayers keeps everything', () => {
    const full = pickAll(initialDraft(SETTINGS), 'a', 'b', 'c', 'd')
    const scored = draftReducer(full, { type: 'setScore', score: { winner: 'B', loserGoals: 0 } })
    expect(scored.score).toEqual({ winner: 'B', loserGoals: 0 })
    const back = draftReducer(scored, { type: 'goToPlayers' })
    expect(back.step).toBe('players')
    expect(back.score).toEqual({ winner: 'B', loserGoals: 0 })
    expect(back.slots).toEqual(['a', 'b', 'c', 'd'])
    expect(draftReducer(scored, { type: 'setScore', score: null }).score).toBeNull()
  })

  it('goToPlayers activates the first empty slot when none was active', () => {
    const slots = ['a', null, 'c', null]
    const d: Draft = { ...initialDraft(SETTINGS), slots, activeSlot: NO_ACTIVE_SLOT, step: 'score' }
    expect(draftReducer(d, { type: 'goToPlayers' }).activeSlot).toBe(1)
  })
})

describe('saved / reset / prefill', () => {
  it('saved moves to done with the match id', () => {
    const full = pickAll(initialDraft(SETTINGS), 'a', 'b', 'c', 'd')
    const done = draftReducer(full, { type: 'saved', matchId: 'm42' })
    expect(done.step).toBe('done')
    expect(done.lastSavedMatchId).toBe('m42')
    expect(done.slots).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reset returns to an empty draft keeping format and target', () => {
    const start = initialDraft({ lastFormat: '1v1', lastTarget: 5 })
    const score = { winner: 'A', loserGoals: 2 } as const
    const done = run(pickAll(start, 'a', 'b'), { type: 'setScore', score }, { type: 'saved', matchId: 'm1' })
    const reset = draftReducer(done, { type: 'reset' })
    expect(reset).toEqual(initialDraft({ lastFormat: '1v1', lastTarget: 5 }))
    expect(reset.lastSavedMatchId).toBeUndefined()
  })

  it('prefill sets teams, format and target and jumps to the score step', () => {
    const done = run(pickAll(initialDraft(SETTINGS), 'a', 'b', 'c', 'd'), { type: 'saved', matchId: 'm1' })
    const revanche = draftReducer(done, { type: 'prefill', teamA: ['c', 'd'], teamB: ['a', 'b'], target: 5 })
    expect(revanche).toEqual({
      format: '2v2',
      target: 5,
      slots: ['c', 'd', 'a', 'b'],
      activeSlot: NO_ACTIVE_SLOT,
      score: null,
      step: 'score',
    })
    const single = draftReducer(done, { type: 'prefill', teamA: ['a'], teamB: ['b'], target: 10 })
    expect(single.format).toBe('1v1')
    expect(single.slots).toEqual(['a', null, 'b', null])
    expect(single.step).toBe('score')
  })

  it('prefill with an incomplete roster stays on the players step', () => {
    const d = draftReducer(initialDraft(SETTINGS), { type: 'prefill', teamA: ['a'], teamB: ['b', 'c'], target: 10 })
    expect(d.format).toBe('2v2')
    expect(d.step).toBe('players')
    expect(d.activeSlot).toBe(1)
  })
})
