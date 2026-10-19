// « Annonces d'écart »: before a match, each team may announce « on gagne d'au moins N buts » (Match.betA for the
// Blancs, Match.betB for the Noirs). Pure helpers shared by the store, the remote mapping, the import, the match
// screens and the history; the statistics can build on them too. The points themselves are the engine's
// (src/rating/engine.ts: rateBet, betChance, betOutlook); nothing here moves a rating.
import { fmtDelta, fmtPercent, plural } from './format'
import { DEFAULT_CONFIG } from './rating/engine'
import type { BetOutcome, Match, Score, Target, Team } from './types'

/** The stepper's value when « Annoncer un écart » is tapped. */
export const DEFAULT_BET = 2

/** U+202F before « : » and « % » (French typography, spec §7). */
const NNBSP = ' '
const MINUS = '−'

export const SIDE_NAME: Record<Team, string> = { A: 'Blancs', B: 'Noirs' }

/** One announcement of a match. */
export type Announcement = { team: Team; n: number }

type BetFields = Pick<Match, 'betA' | 'betB'>
type ScoreFields = Pick<Match, 'target' | 'scoreA' | 'scoreB'>

/** A stored or received announcement: an integer ≥ 1 is kept, clamped to the target; anything else means none. */
export function readBet(raw: unknown, target: Target): number | undefined {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) return undefined
  return Math.min(raw, target)
}

/** The stepper's range 1..target; null (no announcement) for null, undefined or a non-number. */
export function clampBet(n: number | null | undefined, target: Target): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null
  return Math.min(target, Math.max(1, Math.round(n)))
}

function isValidBet(n: number | null | undefined, target: Target): boolean {
  if (n === null || n === undefined) return true
  return Number.isInteger(n) && n >= 1 && n <= target
}

/** The announcement of one team (null when it announced nothing). */
export function betOf(match: BetFields, team: Team): number | null {
  if (team === 'A') return match.betA ?? null
  return match.betB ?? null
}

/** The announcements of a match, Blancs first. */
export function announcedBets(match: BetFields): Announcement[] {
  const bets: Announcement[] = []
  for (const team of ['A', 'B'] as const) {
    const n = betOf(match, team)
    if (n !== null) bets.push({ team, n })
  }
  return bets
}

/** The announced keys of a match, as written on a Match or a Draft. */
export type Bets = { betA?: number; betB?: number }

/** `{ betA, betB }` with only the announced keys (none when nobody announced). */
export function betFields(betA: number | null | undefined, betB: number | null | undefined): Bets {
  const fields: Bets = {}
  if (betA !== null && betA !== undefined) fields.betA = betA
  if (betB !== null && betB !== undefined) fields.betB = betB
  return fields
}

/** Drops unreadable announcements and clamps the others to the target; the match itself when nothing needs a fix. */
export function withValidBets<T extends BetFields & Pick<Match, 'target'>>(match: T): T {
  if (isValidBet(match.betA, match.target) && isValidBet(match.betB, match.target)) return match
  const { betA, betB, ...rest } = match
  return { ...rest, ...betFields(readBet(betA, match.target), readBet(betB, match.target)) } as unknown as T
}

export function winnerOf(match: ScoreFields): Team {
  if (match.scoreA === match.target) return 'A'
  return 'B'
}

/** Goals between the winner (always at the target) and the loser. */
export function winningMargin(match: ScoreFields): number {
  return match.target - Math.min(match.scoreA, match.scoreB)
}

/** The engine's rule: the announcing team won with a margin of at least n. */
export function isBetSuccess(won: boolean, margin: number, n: number): boolean {
  return won && margin >= n
}

/** Whether a team's announcement worked on this score; null when it announced nothing. */
export function betSucceeded(match: ScoreFields & BetFields, team: Team): boolean | null {
  const n = betOf(match, team)
  if (n === null) return null
  return isBetSuccess(winnerOf(match) === team, winningMargin(match), n)
}

/** Same rule on a draft score (match sheet), before saving. */
export function draftBetSucceeds(score: Score, target: Target, team: Team, n: number): boolean {
  return isBetSuccess(score.winner === team, target - score.loserGoals, n)
}

// ---------------------------------------------------------------------------
// French copy
// ---------------------------------------------------------------------------

/** « 1 but » / « 4 buts ». */
export function goalsLabel(n: number): string {
  return plural(n, 'but')
}

/** The stepper's live line, in three unbreakable parts: « 23 % », « +12 si réussi », « −4 sinon ». */
export function betOddsParts(outlook: { chance: number; success: number; failure: number }): string[] {
  return [fmtPercent(outlook.chance), `${fmtDelta(outlook.success)} si réussi`, `${fmtDelta(outlook.failure)} sinon`]
}

/** History pill: « 🎯 +4 ✓ » / « 🎯 +4 ✗ ». */
export function betPillText(n: number, success: boolean): string {
  if (success) return `🎯 +${n} ✓`
  return `🎯 +${n} ✗`
}

/** « réussie » / « ratée ». */
export function outcomeWord(success: boolean): string {
  if (success) return 'réussie'
  return 'ratée'
}

/** Pill tooltip: « Annonce des Blancs : +4, réussie ». */
export function betPillTitle(team: Team, n: number, success: boolean): string {
  return `Annonce des ${SIDE_NAME[team]}${NNBSP}: +${n}, ${outcomeWord(success)}`
}

/** Match detail: « 🎯 Annonce des Blancs : +4 · réussie (23 % de chances) ». */
export function betTitle(bet: BetOutcome): string {
  const chance = `(${fmtPercent(bet.chance)} de chances)`
  return `🎯 Annonce des ${SIDE_NAME[bet.team]}${NNBSP}: +${bet.n} · ${outcomeWord(bet.success)} ${chance}`
}

function percent1(p: number): string {
  return `${(p * 100).toFixed(1).replace('.', ',')}${NNBSP}%`
}

function points1(x: number): string {
  const text = Math.abs(x).toFixed(1).replace('.', ',')
  if (x < 0) return `${MINUS}${text}`
  return `+${text}`
}

function resultPart(bet: BetOutcome, match: ScoreFields): string {
  if (winnerOf(match) !== bet.team) return `Perdu, +${bet.n} annoncé`
  return `Gagné de ${goalsLabel(winningMargin(match))}, +${bet.n} annoncé`
}

function formulaPart(bet: BetOutcome, stake: number): string {
  if (bet.success) return `${stake} × ${percent1(1 - bet.chance)} de risque`
  return `${MINUS}${stake} × ${percent1(bet.chance)} de chances`
}

/**
 * Match detail, under the title: how the points came out, e.g. « Gagné de 6 buts, +4 annoncé : 16 × 77,3 % de
 * risque = +12,4 chacun » or « Perdu, +4 annoncé : −16 × 22,7 % de chances = −3,6 chacun ».
 */
export function betCalculation(
  bet: BetOutcome,
  match: ScoreFields & Pick<Match, 'teamA'>,
  stake = DEFAULT_CONFIG.betStake,
): string {
  return `${resultPart(bet, match)}${NNBSP}: ${formulaPart(bet, stake)} = ${points1(bet.delta)}${eachSuffix(match)}`
}

/** « chacun » only when there are two of them (2v2). */
function eachSuffix(match: Pick<Match, 'teamA'>): string {
  if (match.teamA.length > 1) return ' chacun'
  return ''
}
