import { describe, expect, it } from 'vitest'
import {
  announcedBets,
  betCalculation,
  betFields,
  betOddsParts,
  betOf,
  betPillText,
  betPillTitle,
  betSucceeded,
  betTitle,
  clampBet,
  draftBetSucceeds,
  goalsLabel,
  readBet,
  withValidBets,
  winningMargin,
} from './bets'
import { betOutlook } from './rating'
import type { BetOutcome, Match } from './types'

const NNBSP = ' '

const MATCH: Match = {
  id: 'm1',
  seq: 1,
  playedAt: '2026-10-19T12:00:00.000Z',
  createdAt: '2026-10-19T12:00:00.000Z',
  updatedAt: '2026-10-19T12:00:00.000Z',
  target: 10,
  teamA: ['a', 'b'],
  teamB: ['c', 'd'],
  scoreA: 10,
  scoreB: 4,
}

describe('reading and clamping announcements', () => {
  it('readBet keeps integers ≥ 1, clamped to the target, and reads anything else as none', () => {
    expect(readBet(3, 10)).toBe(3)
    expect(readBet(7, 5)).toBe(5)
    expect(readBet(1, 5)).toBe(1)
    for (const bad of [0, -2, 2.5, '3', null, undefined, Number.NaN, true]) expect(readBet(bad, 10)).toBeUndefined()
  })

  it('clampBet keeps the stepper in 1..target', () => {
    expect(clampBet(null, 10)).toBeNull()
    expect(clampBet(undefined, 10)).toBeNull()
    expect(clampBet(0, 10)).toBe(1)
    expect(clampBet(11, 10)).toBe(10)
    expect(clampBet(7, 5)).toBe(5)
    expect(clampBet(4, 5)).toBe(4)
  })

  it('withValidBets returns the match itself when valid, else clamps or drops', () => {
    const valid = { ...MATCH, betA: 4, betB: null }
    expect(withValidBets(valid)).toBe(valid)
    expect(withValidBets(MATCH)).toBe(MATCH)
    expect(withValidBets({ ...MATCH, target: 5 as const, scoreA: 5, betA: 8 })).toEqual({
      ...MATCH,
      target: 5,
      scoreA: 5,
      betA: 5,
    })
    expect(withValidBets({ ...MATCH, betA: 0, betB: 2 })).toEqual({ ...MATCH, betB: 2 })
  })

  it('betFields only writes the announced keys', () => {
    expect(betFields(null, undefined)).toEqual({})
    expect(betFields(3, null)).toEqual({ betA: 3 })
    expect(betFields(undefined, 2)).toEqual({ betB: 2 })
  })
})

describe('announcement outcome (same rule as the engine)', () => {
  it('lists the announcements, Blancs first', () => {
    expect(announcedBets(MATCH)).toEqual([])
    expect(announcedBets({ betB: 2, betA: 5 })).toEqual([
      { team: 'A', n: 5 },
      { team: 'B', n: 2 },
    ])
    expect(betOf({ betA: null }, 'A')).toBeNull()
  })

  it('succeeds on a win by at least N, fails on a smaller win or a loss', () => {
    expect(winningMargin(MATCH)).toBe(6)
    expect(betSucceeded({ ...MATCH, betA: 6 }, 'A')).toBe(true)
    expect(betSucceeded({ ...MATCH, betA: 7 }, 'A')).toBe(false)
    expect(betSucceeded({ ...MATCH, betB: 1 }, 'B')).toBe(false)
    expect(betSucceeded(MATCH, 'A')).toBeNull()
    expect(draftBetSucceeds({ winner: 'B', loserGoals: 1 }, 5, 'B', 4)).toBe(true)
    expect(draftBetSucceeds({ winner: 'B', loserGoals: 2 }, 5, 'B', 4)).toBe(false)
    expect(draftBetSucceeds({ winner: 'A', loserGoals: 0 }, 5, 'B', 1)).toBe(false)
  })
})

describe('French copy', () => {
  const won: BetOutcome = { team: 'A', n: 4, chance: 0.2272491455078125, success: true, delta: 12.364 }
  const lost: BetOutcome = { team: 'B', n: 4, chance: 0.2272491455078125, success: false, delta: -3.636 }

  it('stepper line: « 23 % », « +12 si réussi », « −4 sinon »', () => {
    expect(betOddsParts(betOutlook(0.5, 10, 4))).toEqual([`23${NNBSP}%`, '+12 si réussi', '−4 sinon'])
    expect(goalsLabel(1)).toBe('1 but')
    expect(goalsLabel(4)).toBe('4 buts')
  })

  it('history pill and its tooltip', () => {
    expect(betPillText(4, true)).toBe('🎯 +4 ✓')
    expect(betPillText(2, false)).toBe('🎯 +2 ✗')
    expect(betPillTitle('B', 2, false)).toBe(`Annonce des Noirs${NNBSP}: +2, ratée`)
  })

  it('match detail: title and calculation', () => {
    expect(betTitle(won)).toBe(`🎯 Annonce des Blancs${NNBSP}: +4 · réussie (23${NNBSP}% de chances)`)
    expect(betTitle(lost)).toBe(`🎯 Annonce des Noirs${NNBSP}: +4 · ratée (23${NNBSP}% de chances)`)
    expect(betCalculation(won, MATCH)).toBe(
      `Gagné de 6 buts, +4 annoncé${NNBSP}: 16 × 77,3${NNBSP}% de risque = +12,4 chacun`,
    )
    expect(betCalculation(lost, MATCH)).toBe(
      `Perdu, +4 annoncé${NNBSP}: −16 × 22,7${NNBSP}% de chances = −3,6 chacun`,
    )
    const short = { ...MATCH, teamA: ['a'], teamB: ['c'], scoreB: 7 }
    expect(betCalculation({ ...lost, team: 'A' }, short)).toBe(
      `Gagné de 3 buts, +4 annoncé${NNBSP}: −16 × 22,7${NNBSP}% de chances = −3,6`,
    )
  })
})
