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
  draftBetShort,
  draftBetSucceeds,
  goalsLabel,
  MIN_BET,
  readBet,
  shortCutText,
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
  it('readBet keeps integers ≥ 2, clamped to the target, and reads anything else as none (an old +1 too)', () => {
    expect(readBet(3, 10)).toBe(3)
    expect(readBet(7, 5)).toBe(5)
    expect(readBet(2, 5)).toBe(2)
    expect(MIN_BET).toBe(2)
    for (const bad of [1, 0, -2, 2.5, '3', null, undefined, Number.NaN, true]) expect(readBet(bad, 10)).toBeUndefined()
  })

  it('clampBet keeps the stepper in 2..target', () => {
    expect(clampBet(null, 10)).toBeNull()
    expect(clampBet(undefined, 10)).toBeNull()
    expect(clampBet(0, 10)).toBe(2)
    expect(clampBet(1, 10)).toBe(2)
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
  const won: BetOutcome = { team: 'A', n: 4, chance: 0.2272491455078125, success: true, short: 0, delta: 12.364 }
  const lost: BetOutcome = { team: 'B', n: 4, chance: 0.2272491455078125, success: false, short: 0, delta: -3.636 }
  // Won 10-8 for +4: 2 goals short, 20 % of the 9,6 base win taken back.
  const short: BetOutcome = { team: 'A', n: 4, chance: 0.2272491455078125, success: false, short: 2, delta: -1.92 }

  it('stepper line: « 23 % », « +12 si réussi », « −4 si perdu », « −10 % par but manquant »', () => {
    expect(betOddsParts(betOutlook(0.5, 10, 4), 10)).toEqual([
      `23${NNBSP}%`,
      '+12 si réussi',
      '−4 si perdu',
      `−10${NNBSP}% par but manquant`,
    ])
    expect(betOddsParts(betOutlook(0.5, 5, 2), 5)[3]).toBe(`−20${NNBSP}% par but manquant`)
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
    expect(betCalculation(lost, { ...MATCH, teamA: ['a'] })).toBe(
      `Perdu, +4 annoncé${NNBSP}: −16 × 22,7${NNBSP}% de chances = −3,6`,
    )
  })

  it('match detail of a win by less than announced: a cut of the win, not a loss', () => {
    expect(betTitle(short)).toBe(`🎯 Annonce des Blancs${NNBSP}: +4 · ratée à 2 buts près (23${NNBSP}% de chances)`)
    expect(betCalculation(short, { ...MATCH, scoreB: 8 })).toBe(
      `Gagné de 2 buts, +4 annoncé${NNBSP}: 2 buts manquants, victoire −20${NNBSP}% = −1,9 chacun`,
    )
    const solo = { ...MATCH, teamA: ['a'], teamB: ['c'], scoreB: 7 }
    expect(betCalculation({ ...short, short: 1, delta: -0.96 }, solo)).toBe(
      `Gagné de 3 buts, +4 annoncé${NNBSP}: 1 but manquant, victoire −10${NNBSP}% = −1,0`,
    )
  })

  it('draftBetShort: goals missing on a win by less, 0 otherwise', () => {
    expect(draftBetShort({ winner: 'A', loserGoals: 4 }, 5, 'A', 2)).toBe(1)
    expect(draftBetShort({ winner: 'A', loserGoals: 4 }, 5, 'A', 4)).toBe(3)
    expect(draftBetShort({ winner: 'A', loserGoals: 3 }, 5, 'A', 2)).toBe(0)
    expect(draftBetShort({ winner: 'B', loserGoals: 4 }, 5, 'A', 2)).toBe(0)
    expect(shortCutText(2, 5)).toBe(`−40${NNBSP}%`)
  })
})
