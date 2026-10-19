import { describe, expect, it } from 'vitest'
import { draftReducer, initialDraft, NO_ACTIVE_SLOT } from '../../store/draft'
import type { Draft, Match, Ranking } from '../../types'
import {
  chipStateOf,
  draftPlayerIds,
  draftTeams,
  draftToMatch,
  entryCaption,
  isDraftChanged,
  matchFieldsOf,
  matchToDraft,
  newMatchFromDraft,
  rankMapOf,
  resultDateLine,
  rosterCaption,
  saveLabel,
  scoreOf,
  scoresOf,
} from './draftMatch'

const NOW_ISO = '2025-10-10T10:00:00.000Z'

function match(extra: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    seq: 7,
    playedAt: '2025-10-01T12:42:00.000Z',
    createdAt: '2025-10-01T12:42:00.000Z',
    updatedAt: '2025-10-01T12:42:00.000Z',
    target: 10,
    teamA: ['alice', 'bob'],
    teamB: ['chloe', 'dan'],
    scoreA: 10,
    scoreB: 8,
    ...extra,
  }
}

function draft(extra: Partial<Draft> = {}): Draft {
  return {
    format: '2v2',
    target: 10,
    slots: ['alice', 'bob', 'chloe', 'dan'],
    activeSlot: NO_ACTIVE_SLOT,
    score: { winner: 'A', loserGoals: 8 },
    step: 'score',
    ...extra,
  }
}

describe('scoreOf / scoresOf', () => {
  it('reads the winner from the side that reached the target', () => {
    expect(scoreOf(match())).toEqual({ winner: 'A', loserGoals: 8 })
    expect(scoreOf(match({ scoreA: 3, scoreB: 10 }))).toEqual({ winner: 'B', loserGoals: 3 })
    expect(scoreOf(match({ target: 5, scoreA: 5, scoreB: 0 }))).toEqual({ winner: 'A', loserGoals: 0 })
  })

  it('writes the target on the winning side', () => {
    expect(scoresOf({ winner: 'A', loserGoals: 8 }, 10)).toEqual({ scoreA: 10, scoreB: 8 })
    expect(scoresOf({ winner: 'B', loserGoals: 4 }, 5)).toEqual({ scoreA: 4, scoreB: 5 })
  })

  it('round-trips through a match', () => {
    const m = match({ scoreA: 6, scoreB: 10 })
    expect(scoresOf(scoreOf(m), m.target)).toEqual({ scoreA: 6, scoreB: 10 })
  })
})

describe('draftTeams / draftPlayerIds', () => {
  it('splits the visible slots in two teams', () => {
    expect(draftTeams(draft())).toEqual({ teamA: ['alice', 'bob'], teamB: ['chloe', 'dan'] })
    expect(draftTeams(draft({ format: '1v1', slots: ['alice', 'x', 'chloe', 'y'] }))).toEqual({
      teamA: ['alice'],
      teamB: ['chloe'],
    })
  })

  it('is null while a visible slot is empty, ignoring hidden slots', () => {
    expect(draftTeams(draft({ slots: ['alice', 'bob', 'chloe', null] }))).toBeNull()
    expect(draftTeams(draft({ format: '1v1', slots: ['alice', null, null, 'y'] }))).toBeNull()
    expect(draftTeams(draft({ format: '1v1', slots: ['alice', null, 'chloe', null] }))).not.toBeNull()
  })

  it('lists the filled visible ids in fill order', () => {
    expect(draftPlayerIds(draft({ slots: ['alice', null, 'chloe', null] }))).toEqual(['alice', 'chloe'])
    expect(draftPlayerIds(draft({ format: '1v1', slots: [null, 'bob', 'chloe', 'dan'] }))).toEqual(['chloe'])
    expect(draftPlayerIds(draft({ slots: [null, null, null, null] }))).toEqual([])
  })
})

describe('matchToDraft', () => {
  it('opens a 2v2 match on the score step with no active slot', () => {
    expect(matchToDraft(match())).toEqual({
      format: '2v2',
      target: 10,
      slots: ['alice', 'bob', 'chloe', 'dan'],
      activeSlot: NO_ACTIVE_SLOT,
      score: { winner: 'A', loserGoals: 8 },
      step: 'score',
      comeback: false,
    })
  })

  it('derives 1v1 from the team sizes and uses slots 0 and 2', () => {
    const d = matchToDraft(match({ target: 5, teamA: ['alice'], teamB: ['chloe'], scoreA: 2, scoreB: 5 }))
    expect(d.format).toBe('1v1')
    expect(d.target).toBe(5)
    expect(d.slots).toEqual(['alice', null, 'chloe', null])
    expect(d.score).toEqual({ winner: 'B', loserGoals: 2 })
  })

  it('produces a draft the reducer accepts as complete (a pick replaces instead of appending)', () => {
    const d = draftReducer(matchToDraft(match()), { type: 'setActiveSlot', index: 1 })
    expect(d.step).toBe('players')
    const next = draftReducer(d, { type: 'pick', playerId: 'eve' })
    expect(next.slots).toEqual(['alice', 'eve', 'chloe', 'dan'])
    expect(next.step).toBe('score')
  })
})

describe('matchFieldsOf / draftToMatch / newMatchFromDraft', () => {
  it('matchFieldsOf is null without a complete roster or a score', () => {
    expect(matchFieldsOf(draft({ score: null }))).toBeNull()
    expect(matchFieldsOf(draft({ slots: ['alice', 'bob', null, 'dan'] }))).toBeNull()
    expect(matchFieldsOf(draft())).toEqual({
      target: 10,
      teamA: ['alice', 'bob'],
      teamB: ['chloe', 'dan'],
      scoreA: 10,
      scoreB: 8,
      comeback: false,
    })
  })

  it('draftToMatch keeps id, seq, createdAt, playedAt and stamps updatedAt', () => {
    const base = match()
    const edited = draftToMatch(draft({ target: 5, score: { winner: 'B', loserGoals: 1 } }), base, NOW_ISO)
    expect(edited).toEqual({
      ...base,
      updatedAt: NOW_ISO,
      target: 5,
      scoreA: 1,
      scoreB: 5,
      comeback: false,
    })
  })

  it('draftToMatch drops the hidden slots of a 1v1 draft', () => {
    const edited = draftToMatch(draft({ format: '1v1', slots: ['alice', 'bob', 'chloe', 'dan'] }), match(), NOW_ISO)
    expect(edited.teamA).toEqual(['alice'])
    expect(edited.teamB).toEqual(['chloe'])
  })

  it('round-trips a stored match except for updatedAt', () => {
    const base = match({ target: 5, teamA: ['alice'], teamB: ['dan'], scoreA: 3, scoreB: 5, comeback: false })
    expect(draftToMatch(matchToDraft(base), base, NOW_ISO)).toEqual({ ...base, updatedAt: NOW_ISO })
    const comeback = match({ target: 5, scoreA: 4, scoreB: 5, comeback: true })
    expect(draftToMatch(matchToDraft(comeback), comeback, NOW_ISO)).toEqual({ ...comeback, updatedAt: NOW_ISO })
  })

  it('draftToMatch and newMatchFromDraft throw on an unscored or incomplete draft', () => {
    expect(() => draftToMatch(draft({ score: null }), match(), NOW_ISO)).toThrow()
    expect(() => newMatchFromDraft(draft({ slots: [null, null, null, null] }), 'id', NOW_ISO)).toThrow()
  })

  it('newMatchFromDraft sets the three dates to now and no seq', () => {
    const created = newMatchFromDraft(draft(), 'new-id', NOW_ISO)
    expect(created).toEqual({
      id: 'new-id',
      playedAt: NOW_ISO,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
      target: 10,
      teamA: ['alice', 'bob'],
      teamB: ['chloe', 'dan'],
      scoreA: 10,
      scoreB: 8,
      comeback: false,
    })
    expect('seq' in created).toBe(false)
  })
})

describe('isDraftChanged', () => {
  const base = match()

  it('is false for the untouched draft of the match', () => {
    expect(isDraftChanged(matchToDraft(base), base)).toBe(false)
  })

  it('is false while the draft is incomplete or unscored, whatever else changed', () => {
    expect(isDraftChanged(draft({ score: null, target: 5 }), base)).toBe(false)
    expect(isDraftChanged(draft({ slots: ['alice', null, 'chloe', 'dan'] }), base)).toBe(false)
  })

  it('is true when the score, the target or a player differs', () => {
    expect(isDraftChanged(draft({ score: { winner: 'A', loserGoals: 7 } }), base)).toBe(true)
    expect(isDraftChanged(draft({ score: { winner: 'B', loserGoals: 8 } }), base)).toBe(true)
    expect(isDraftChanged(draft({ target: 5, score: { winner: 'A', loserGoals: 4 } }), base)).toBe(true)
    expect(isDraftChanged(draft({ slots: ['alice', 'eve', 'chloe', 'dan'] }), base)).toBe(true)
  })

  it('treats a swap inside a team as a change (the order is what the lists display)', () => {
    expect(isDraftChanged(draft({ slots: ['bob', 'alice', 'chloe', 'dan'] }), base)).toBe(true)
  })

  it('is true when the format changes to 1v1 with the same first players', () => {
    expect(isDraftChanged(draft({ format: '1v1' }), base)).toBe(true)
  })
})

describe('comeback', () => {
  const fiveFour = { target: 5, scoreA: 5, scoreB: 4 } as const
  const fourFive = draft({ target: 5, score: { winner: 'A', loserGoals: 4 } })

  it('matchToDraft reads the flag of a 5-4 and ignores a missing or stray one', () => {
    expect(matchToDraft(match({ ...fiveFour, comeback: true })).comeback).toBe(true)
    expect(matchToDraft(match(fiveFour)).comeback).toBe(false)
    expect(matchToDraft(match({ comeback: true })).comeback).toBe(false)
  })

  it('newMatchFromDraft and draftToMatch write true for a ticked 5-4, false otherwise', () => {
    expect(newMatchFromDraft({ ...fourFive, comeback: true }, 'new-id', NOW_ISO)).toMatchObject({
      ...fiveFour,
      comeback: true,
    })
    expect(newMatchFromDraft(fourFive, 'new-id', NOW_ISO).comeback).toBe(false)
    const edited = draftToMatch({ ...fourFive, comeback: true }, match(), NOW_ISO)
    expect(edited).toMatchObject({ ...fiveFour, comeback: true })
    expect(draftToMatch({ ...fourFive, comeback: false }, match(), NOW_ISO).comeback).toBe(false)
  })

  it('a stray ticked box on another score is written as false', () => {
    expect(newMatchFromDraft(draft({ comeback: true }), 'new-id', NOW_ISO).comeback).toBe(false)
    expect(draftToMatch(draft({ target: 5, score: { winner: 'A', loserGoals: 3 }, comeback: true }), match(), NOW_ISO))
      .toMatchObject({ scoreB: 3, comeback: false })
  })

  it('isDraftChanged sees a comeback-only change, so the edit screen can save just the box', () => {
    const flagged = match({ ...fiveFour, comeback: true })
    const plain = match(fiveFour)
    expect(isDraftChanged(matchToDraft(flagged), flagged)).toBe(false)
    expect(isDraftChanged({ ...matchToDraft(plain), comeback: true }, plain)).toBe(true)
    expect(isDraftChanged({ ...matchToDraft(flagged), comeback: false }, flagged)).toBe(true)
    // An untouched stored match without the field reads as « not a comeback ».
    expect(isDraftChanged({ ...matchToDraft(plain), comeback: false }, plain)).toBe(false)
  })
})

describe('captions and labels', () => {
  it('rosterCaption follows the §9 copy', () => {
    expect(rosterCaption(0, 4)).toBe('0 joueur sur 4')
    expect(rosterCaption(1, 4)).toBe('1 joueur sur 4')
    expect(rosterCaption(2, 4)).toBe('2 joueurs sur 4')
    expect(rosterCaption(3, 4)).toBe('Il manque 1 joueur')
    expect(rosterCaption(4, 4)).toBe('4 joueurs sur 4')
    expect(rosterCaption(0, 2)).toBe('0 joueur sur 2')
    expect(rosterCaption(1, 2)).toBe('1 joueur sur 2')
  })

  it('entryCaption counts the visible slots and handles the single-player store', () => {
    const empty = initialDraft({ lastFormat: '2v2', lastTarget: 10 })
    expect(entryCaption(empty, 5)).toBe('0 joueur sur 4')
    expect(entryCaption(draftReducer(empty, { type: 'pick', playerId: 'a' }), 5)).toBe('1 joueur sur 4')
    expect(entryCaption({ format: '1v1', slots: ['a', 'hidden', null, null] }, 5)).toBe('1 joueur sur 2')
    expect(entryCaption({ format: '2v2', slots: ['a', 'b', 'c', null] }, 5)).toBe('Il manque 1 joueur')
    expect(entryCaption(empty, 1)).toBe('Encore 1 joueur à ajouter')
    expect(entryCaption({ format: '2v2', slots: ['a', null, null, null] }, 1)).toBe('Encore 1 joueur à ajouter')
  })

  it('saveLabel uses an en dash and the winner first', () => {
    expect(saveLabel(10, null)).toBe('Enregistrer')
    expect(saveLabel(10, { winner: 'A', loserGoals: 8 })).toBe('Enregistrer 10 – 8')
    expect(saveLabel(5, { winner: 'B', loserGoals: 3 })).toBe('Enregistrer 5 – 3')
  })

  it('chipStateOf maps visible slots to a team and ignores hidden 1v1 slots', () => {
    const d = { format: '2v2' as const, slots: ['alice', 'bob', 'chloe', null] }
    expect(chipStateOf(d, 'alice')).toBe('team1')
    expect(chipStateOf(d, 'bob')).toBe('team1')
    expect(chipStateOf(d, 'chloe')).toBe('team2')
    expect(chipStateOf(d, 'dan')).toBe('default')
    const solo = { format: '1v1' as const, slots: ['alice', 'bob', 'chloe', 'dan'] }
    expect(chipStateOf(solo, 'bob')).toBe('default')
    expect(chipStateOf(solo, 'dan')).toBe('default')
    expect(chipStateOf(solo, 'chloe')).toBe('team2')
  })

  it('resultDateLine reads « aujourd\'hui · 12:42 · en 10 » on the day of the match', () => {
    const played = new Date(2025, 9, 10, 12, 42)
    const now = new Date(2025, 9, 10, 18, 0)
    expect(resultDateLine(played.toISOString(), 10, now, true)).toBe("aujourd'hui · 12:42 · en 10")
    expect(resultDateLine(played.toISOString(), 5, new Date(2025, 9, 11, 9, 0), true)).toBe('hier · 12:42 · en 5')
  })

  it('resultDateLine leaves the time of day out when asked', () => {
    const played = new Date(2025, 9, 10, 12, 42)
    expect(resultDateLine(played.toISOString(), 10, new Date(2025, 9, 10, 18, 0), false)).toBe("aujourd'hui · en 10")
  })

  it('resultDateLine falls back to the long date after two days', () => {
    const played = new Date(2025, 9, 8, 9, 5)
    const line = resultDateLine(played.toISOString(), 10, new Date(2025, 9, 11, 9, 0), true)
    expect(line).toBe('mercredi 8 octobre · 09:05 · en 10')
  })
})

describe('rankMapOf', () => {
  const ranking: Ranking = { ranked: ['alice', 'bob', 'chloe'], rookies: ['dan'], inactive: ['eve'] }

  it('gives 1-based ranks to ranked players only', () => {
    const ranks = rankMapOf(ranking, ['chloe', 'dan', 'alice', 'eve'])
    expect([...ranks.entries()]).toEqual([
      ['chloe', 3],
      ['alice', 1],
    ])
  })

  it('is empty for unknown ids', () => {
    expect(rankMapOf(ranking, ['nobody']).size).toBe(0)
  })
})

describe('announcements through the draft', () => {
  it('a new match carries the announced keys only', () => {
    expect(newMatchFromDraft(draft({ betA: 4 }), 'id', NOW_ISO)).toMatchObject({ betA: 4 })
    expect('betB' in newMatchFromDraft(draft({ betA: 4, betB: null }), 'id', NOW_ISO)).toBe(false)
    expect(matchFieldsOf(draft({ betA: 2, betB: 3 }))).toMatchObject({ betA: 2, betB: 3 })
  })

  it('the edit draft opens with the stored announcements and round-trips them', () => {
    const base = match({ comeback: false, betA: 3, betB: 1 })
    expect(matchToDraft(base)).toMatchObject({ betA: 3, betB: 1 })
    expect(draftToMatch(matchToDraft(base), base, NOW_ISO)).toEqual({ ...base, updatedAt: NOW_ISO })
    expect('betA' in matchToDraft(match())).toBe(false)
  })

  it('changing, adding or removing an announcement is a change to save; removing it drops the key', () => {
    const base = match({ betA: 3 })
    const opened = matchToDraft(base)
    expect(isDraftChanged(opened, base)).toBe(false)
    expect(isDraftChanged(draftReducer(opened, { type: 'setBet', team: 'A', n: 4 }), base)).toBe(true)
    expect(isDraftChanged(draftReducer(opened, { type: 'setBet', team: 'B', n: 2 }), base)).toBe(true)
    const removed = draftReducer(opened, { type: 'setBet', team: 'A', n: null })
    expect(isDraftChanged(removed, base)).toBe(true)
    expect('betA' in draftToMatch(removed, base, NOW_ISO)).toBe(false)
    expect(isDraftChanged(matchToDraft(match({ betA: null })), match())).toBe(false)
  })

  it('a change of target in the edit clamps the announcement', () => {
    const base = match({ betA: 8 })
    const five = draftReducer(matchToDraft(base), { type: 'setTarget', target: 5 })
    const scored = draftReducer(five, { type: 'setScore', score: { winner: 'A', loserGoals: 2 } })
    expect(draftToMatch(scored, base, NOW_ISO)).toMatchObject({ target: 5, betA: 5 })
  })
})
