import { describe, expect, it } from 'vitest'
import type { Draft } from '../types'
import { canBeComeback, draftReducer, initialDraft, isDraftComplete, NO_ACTIVE_SLOT, visibleSlots } from './draft'
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
      comeback: false,
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
      comeback: false,
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

describe('swapTeam', () => {
  it('swaps arrière and avant of one team in 2v2, no-op in 1v1', () => {
    const d = { ...initialDraft({ lastFormat: '2v2', lastTarget: 5 }), slots: ['a', 'b', 'c', 'd'] }
    expect(draftReducer(d, { type: 'swapTeam', team: 1 }).slots).toEqual(['b', 'a', 'c', 'd'])
    expect(draftReducer(d, { type: 'swapTeam', team: 2 }).slots).toEqual(['a', 'b', 'd', 'c'])
    const solo = { ...d, format: '1v1' as const }
    expect(draftReducer(solo, { type: 'swapTeam', team: 1 })).toBe(solo)
  })
})

describe('keepWinners', () => {
  it('keeps the winning side in place and empties the other, next slot active', () => {
    const d = initialDraft({ lastFormat: '1v1', lastTarget: 10 })
    const next = draftReducer(d, { type: 'keepWinners', winner: 'B', teamA: ['a', 'b'], teamB: ['c', 'd'], target: 5 })
    expect(next.format).toBe('2v2')
    expect(next.target).toBe(5)
    expect(next.slots).toEqual([null, null, 'c', 'd'])
    expect(next.activeSlot).toBe(0)
    expect(next.step).toBe('players')
    const solo = draftReducer(d, { type: 'keepWinners', winner: 'A', teamA: ['a'], teamB: ['b'], target: 10 })
    expect(solo.format).toBe('1v1')
    expect(solo.slots).toEqual(['a', null, null, null])
    expect(solo.activeSlot).toBe(2)
  })
})

describe('comeback', () => {
  const fourFive = { winner: 'B', loserGoals: 4 } as const

  /** A complete 2v2 draft in 5 scored 4-5 with the « Comeback » box ticked. */
  function ticked(): Draft {
    const scored = run(pickAll(initialDraft({ lastFormat: '2v2', lastTarget: 5 }), 'a', 'b', 'c', 'd'), {
      type: 'setScore',
      score: fourFive,
    })
    return draftReducer(scored, { type: 'setComeback', value: true })
  }

  it('canBeComeback only accepts a 5-4 in a game to 5', () => {
    expect(canBeComeback({ target: 5, score: { winner: 'A', loserGoals: 4 } })).toBe(true)
    expect(canBeComeback({ target: 5, score: fourFive })).toBe(true)
    expect(canBeComeback({ target: 5, score: { winner: 'A', loserGoals: 3 } })).toBe(false)
    expect(canBeComeback({ target: 10, score: { winner: 'A', loserGoals: 4 } })).toBe(false)
    expect(canBeComeback({ target: 5, score: null })).toBe(false)
  })

  it('setComeback ticks and unticks the box on a 5-4 in 5', () => {
    const on = ticked()
    expect(on.comeback).toBe(true)
    expect(draftReducer(on, { type: 'setComeback', value: true })).toBe(on)
    expect(draftReducer(on, { type: 'setComeback', value: false }).comeback).toBe(false)
  })

  it('setComeback is refused on any other score or target', () => {
    const tenEight = run(pickAll(initialDraft(SETTINGS), 'a', 'b', 'c', 'd'), {
      type: 'setScore',
      score: { winner: 'A', loserGoals: 8 },
    })
    expect(draftReducer(tenEight, { type: 'setComeback', value: true })).toBe(tenEight)
    const fourInTen = draftReducer(tenEight, { type: 'setScore', score: { winner: 'A', loserGoals: 4 } })
    expect(draftReducer(fourInTen, { type: 'setComeback', value: true }).comeback).toBe(false)
    const unscored = initialDraft({ lastFormat: '2v2', lastTarget: 5 })
    expect(draftReducer(unscored, { type: 'setComeback', value: true }).comeback).toBe(false)
  })

  it('a new score clears it, the same score tapped again keeps it', () => {
    const on = ticked()
    expect(draftReducer(on, { type: 'setScore', score: { winner: 'B', loserGoals: 4 } }).comeback).toBe(true)
    expect(draftReducer(on, { type: 'setScore', score: { winner: 'A', loserGoals: 4 } }).comeback).toBe(false)
    expect(draftReducer(on, { type: 'setScore', score: { winner: 'B', loserGoals: 3 } }).comeback).toBe(false)
    expect(draftReducer(on, { type: 'setScore', score: null }).comeback).toBe(false)
  })

  it('a change of target, format or players clears it', () => {
    const on = ticked()
    expect(draftReducer(on, { type: 'setTarget', target: 10 }).comeback).toBe(false)
    expect(draftReducer(on, { type: 'setFormat', format: '1v1' }).comeback).toBe(false)
    expect(draftReducer(on, { type: 'pick', playerId: 'a' }).comeback).toBe(false)
    expect(draftReducer(on, { type: 'clearSlot', index: 3 }).comeback).toBe(false)
    const replaced = run(on, { type: 'setActiveSlot', index: 1 }, { type: 'pick', playerId: 'e' })
    expect(replaced.comeback).toBe(false)
  })

  it('moving around or swapping arrière and avant keeps it', () => {
    const on = ticked()
    expect(draftReducer(on, { type: 'swapTeam', team: 2 }).comeback).toBe(true)
    expect(draftReducer(on, { type: 'goToPlayers' }).comeback).toBe(true)
    expect(draftReducer(on, { type: 'setActiveSlot', index: 0 }).comeback).toBe(true)
    expect(draftReducer(on, { type: 'saved', matchId: 'm1' }).comeback).toBe(true)
  })

  it('reset, prefill and keepWinners start unticked', () => {
    const done = draftReducer(ticked(), { type: 'saved', matchId: 'm1' })
    expect(draftReducer(done, { type: 'reset' }).comeback).toBe(false)
    const prefilled = draftReducer(done, { type: 'prefill', teamA: ['a', 'b'], teamB: ['c', 'd'], target: 5 })
    expect(prefilled.comeback).toBe(false)
    const keep: DraftAction = { type: 'keepWinners', winner: 'B', teamA: ['a', 'b'], teamB: ['c', 'd'], target: 5 }
    expect(draftReducer(done, keep).comeback).toBe(false)
  })
})
