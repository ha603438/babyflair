import { describe, expect, it } from 'vitest'

import { duoId } from './duo'
import {
  duoBeteNoire,
  duoFannyComeback,
  duoMatches,
  duoOutcome,
  duoSide,
  duoStreak,
  duoVictimePreferee,
  formationRecord,
} from './duoStats'
import type { HistoryPoint, Match, Target } from './types'

// ---------------------------------------------------------------------------
// Fixtures: duo a+b against c+d, e+f and g+h
// ---------------------------------------------------------------------------

type Spec = { teamA: string[]; teamB: string[]; scoreA: number; scoreB: number; target?: Target; comeback?: boolean }

function matches(specs: Spec[]): Match[] {
  return specs.map((spec, i) => {
    const at = new Date(Date.UTC(2026, 9, 1, 12, i)).toISOString()
    return {
      id: `m${i + 1}`,
      seq: i + 1,
      playedAt: at,
      createdAt: at,
      updatedAt: at,
      target: spec.target ?? 10,
      teamA: spec.teamA,
      teamB: spec.teamB,
      scoreA: spec.scoreA,
      scoreB: spec.scoreB,
      comeback: spec.comeback,
    }
  })
}

const AB = duoId('a', 'b')
const CD = duoId('c', 'd')
const EF = duoId('e', 'f')
const GH = duoId('g', 'h')
const NAMES = new Map([
  [CD, 'Chloé & Dan'],
  [EF, 'Ève & Fred'],
  [GH, 'Gus & Hugo'],
])
const nameOf = (id: string): string => NAMES.get(id) ?? '?'

const HISTORY = matches([
  { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 10, scoreB: 0 }, // m1 a arrière, win, fanny given
  { teamA: ['d', 'c'], teamB: ['b', 'a'], scoreA: 10, scoreB: 7 }, // m2 b arrière, loss
  { teamA: ['b', 'a'], teamB: ['c', 'd'], scoreA: 4, scoreB: 5, target: 5, comeback: true }, // m3 b arrière, loss
  { teamA: ['a', 'b'], teamB: ['e', 'f'], scoreA: 5, scoreB: 4, target: 5, comeback: true }, // m4 a arrière, win
  { teamA: ['e', 'f'], teamB: ['a', 'b'], scoreA: 0, scoreB: 10 }, // m5 a arrière, win, fanny given
  { teamA: ['a', 'b'], teamB: ['e', 'f'], scoreA: 10, scoreB: 3 }, // m6 a arrière, win
  { teamA: ['a', 'c'], teamB: ['b', 'd'], scoreA: 10, scoreB: 5 }, // m7 not the duo
  { teamA: ['a'], teamB: ['b'], scoreA: 10, scoreB: 5 }, // m8 1v1, not the duo
  { teamA: ['g', 'h'], teamB: ['a', 'b'], scoreA: 10, scoreB: 0 }, // m9 a arrière, loss, fanny taken
])

function history(ids: string[]): HistoryPoint[] {
  return ids.map((matchId) => ({ matchId, playedAt: '', ratingBefore: 1000, ratingAfter: 1000, delta: 0 }))
}

const BY_ID = new Map(HISTORY.map((m) => [m.id, m]))

// ---------------------------------------------------------------------------

describe('duo matches and outcomes', () => {
  it('finds the matches the two played together, on either side, in any order', () => {
    expect(duoMatches(AB, HISTORY).map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm9'])
    expect(duoSide(AB, HISTORY[0])).toBe('A')
    expect(duoSide(AB, HISTORY[1])).toBe('B')
    expect(duoSide(AB, HISTORY[6])).toBeNull()
    expect(duoSide(AB, HISTORY[7])).toBeNull()
    expect(duoOutcome(AB, HISTORY[0])).toBe('win')
    expect(duoOutcome(AB, HISTORY[1])).toBe('loss')
    expect(duoOutcome(AB, HISTORY[7])).toBeNull()
  })
})

describe('formationRecord', () => {
  it('counts each formation (index 0 arrière, index 1 avant) apart', () => {
    expect(formationRecord('a', 'b', HISTORY)).toEqual({ wins: 4, losses: 1 })
    expect(formationRecord('b', 'a', HISTORY)).toEqual({ wins: 0, losses: 2 })
    expect(formationRecord('a', 'z', HISTORY)).toEqual({ wins: 0, losses: 0 })
  })
})

describe('duoFannyComeback', () => {
  it('counts fannys and comebacks given and conceded by the duo only', () => {
    expect(duoFannyComeback(AB, HISTORY)).toEqual({
      fannyGiven: 2,
      fannyTaken: 1,
      comebackDone: 1,
      comebackSuffered: 1,
    })
    expect(duoFannyComeback(duoId('a', 'c'), HISTORY)).toEqual({
      fannyGiven: 0,
      fannyTaken: 0,
      comebackDone: 0,
      comebackSuffered: 0,
    })
  })
})

describe('duo rivalries', () => {
  it('needs 3 matches against the same duo', () => {
    // g+h beat a+b once only: not enough for a bête noire.
    expect(duoBeteNoire(AB, HISTORY, nameOf)?.duoId).toBe(CD)
    expect(duoBeteNoire(AB, HISTORY.slice(0, 2), nameOf)).toBeNull()
  })

  it('« Bête noire » is the duo they lost to most, « Victime préférée » the one they beat most', () => {
    expect(duoBeteNoire(AB, HISTORY, nameOf)).toEqual({ duoId: CD, matches: 3, wins: 1, losses: 2 })
    expect(duoVictimePreferee(AB, HISTORY, nameOf)).toEqual({ duoId: EF, matches: 3, wins: 3, losses: 0 })
    // Seen from the other side: c+d beat a+b twice in 3, e+f lost all 3.
    expect(duoVictimePreferee(CD, HISTORY, nameOf)).toEqual({ duoId: AB, matches: 3, wins: 2, losses: 1 })
    expect(duoBeteNoire(EF, HISTORY, nameOf)).toEqual({ duoId: AB, matches: 3, wins: 0, losses: 3 })
    expect(duoVictimePreferee(EF, HISTORY, nameOf)).toBeNull()
  })

  it('breaks ties on the win rate, then the name', () => {
    const tied = matches([
      { teamA: ['a', 'b'], teamB: ['g', 'h'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['g', 'h'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['g', 'h'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['e', 'f'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['e', 'f'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['e', 'f'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 10, scoreB: 0 },
    ])
    // 3 losses each; c+d has the better win rate (1 in 4), so e+f and g+h stay, then by name: « Ève & Fred ».
    expect(duoBeteNoire(AB, tied, nameOf)?.duoId).toBe(EF)
  })

  it('ranks by win rate first, like the player « Némésis »', () => {
    const history = matches([
      { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['e', 'f'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['e', 'f'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['e', 'f'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['e', 'f'], scoreA: 0, scoreB: 10 },
      { teamA: ['a', 'b'], teamB: ['e', 'f'], scoreA: 10, scoreB: 0 },
    ])
    // 3 losses out of 3 against c+d beats 4 losses out of 5 against e+f.
    expect(duoBeteNoire(AB, history, nameOf)?.duoId).toBe(CD)
    expect(duoVictimePreferee(AB, history, nameOf)?.duoId).toBe(EF)
  })
})

describe('duoStreak', () => {
  it('counts the run of identical results ending with the last match, from 2', () => {
    expect(duoStreak(AB, history(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']), BY_ID)).toEqual({ kind: 'win', length: 3 })
    expect(duoStreak(AB, history(['m1', 'm2', 'm3']), BY_ID)).toEqual({ kind: 'loss', length: 2 })
    expect(duoStreak(AB, history(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm9']), BY_ID)).toBeNull()
    expect(duoStreak(AB, [], BY_ID)).toBeNull()
  })

  it('stops at a match it does not know or the duo did not play', () => {
    expect(duoStreak(AB, history(['m4', 'zz', 'm5', 'm6']), BY_ID)).toEqual({ kind: 'win', length: 2 })
    expect(duoStreak(AB, history(['m5', 'm7', 'm6']), BY_ID)).toBeNull()
  })
})
