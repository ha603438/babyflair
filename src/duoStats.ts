import { teamDuoId } from './duo'
import type { DuoId } from './duo'
import { isComeback, isFanny, RIVALRY_MIN_MATCHES } from './stats'
import type { FannyComebackRecord, WinLoss } from './stats'
import type { HistoryPoint, Match, MatchId, PlayerId, Team } from './types'

// Duo page statistics (2V2 ranking): the player-page derivations of src/stats.ts, for a pair of teammates. A duo
// « plays » a match when one team is exactly its two members (in any order). No rating math here.

type Outcome = 'win' | 'loss'

export type DuoRivalry = { duoId: DuoId; matches: number; wins: number; losses: number }
export type DuoStreak = { kind: Outcome; length: number }

const MIN_STREAK = 2

/** The side the duo played, null when it did not play this match together. */
export function duoSide(id: DuoId, match: Match): Team | null {
  if (teamDuoId(match.teamA) === id) return 'A'
  if (teamDuoId(match.teamB) === id) return 'B'
  return null
}

function winnerOf(match: Match): Team {
  if (match.scoreA === match.target) return 'A'
  return 'B'
}

function outcomeOf(side: Team, match: Match): Outcome {
  if (winnerOf(match) === side) return 'win'
  return 'loss'
}

export function duoOutcome(id: DuoId, match: Match): Outcome | null {
  const side = duoSide(id, match)
  if (side === null) return null
  return outcomeOf(side, match)
}

/** The duo's matches together, in the given order. */
export function duoMatches(id: DuoId, matches: Match[]): Match[] {
  return matches.filter((match) => duoSide(id, match) !== null)
}

// ---------------------------------------------------------------------------
// Positions: in each team array, index 0 is the arrière, index 1 the avant
// ---------------------------------------------------------------------------

function addOutcome(record: WinLoss, outcome: Outcome): void {
  if (outcome === 'win') {
    record.wins += 1
    return
  }
  record.losses += 1
}

function isFormation(team: PlayerId[], arriere: PlayerId, avant: PlayerId): boolean {
  return team.length === 2 && team[0] === arriere && team[1] === avant
}

function formationSide(arriere: PlayerId, avant: PlayerId, match: Match): Team | null {
  if (isFormation(match.teamA, arriere, avant)) return 'A'
  if (isFormation(match.teamB, arriere, avant)) return 'B'
  return null
}

/** Wins and losses of the formation « arriere at the back, avant in front ». */
export function formationRecord(arriere: PlayerId, avant: PlayerId, matches: Match[]): WinLoss {
  const record: WinLoss = { wins: 0, losses: 0 }
  for (const match of matches) {
    const side = formationSide(arriere, avant, match)
    if (side === null) continue
    addOutcome(record, outcomeOf(side, match))
  }
  return record
}

// ---------------------------------------------------------------------------
// Fanny et comebacks, given and conceded by the duo
// ---------------------------------------------------------------------------

function countFanny(record: FannyComebackRecord, outcome: Outcome): void {
  if (outcome === 'win') {
    record.fannyGiven += 1
    return
  }
  record.fannyTaken += 1
}

function countComeback(record: FannyComebackRecord, outcome: Outcome): void {
  if (outcome === 'win') {
    record.comebackDone += 1
    return
  }
  record.comebackSuffered += 1
}

export function duoFannyComeback(id: DuoId, matches: Match[]): FannyComebackRecord {
  const record: FannyComebackRecord = { fannyGiven: 0, fannyTaken: 0, comebackDone: 0, comebackSuffered: 0 }
  for (const match of matches) {
    const outcome = duoOutcome(id, match)
    if (outcome === null) continue
    if (isFanny(match)) countFanny(record, outcome)
    if (isComeback(match)) countComeback(record, outcome)
  }
  return record
}

// ---------------------------------------------------------------------------
// Rivalries against the other duos, over at least RIVALRY_MIN_MATCHES matches (same rule as the player page)
// ---------------------------------------------------------------------------

function opponentDuo(id: DuoId, match: Match): DuoId | null {
  const side = duoSide(id, match)
  if (side === 'A') return teamDuoId(match.teamB)
  if (side === 'B') return teamDuoId(match.teamA)
  return null
}

function tallyOpponents(id: DuoId, matches: Match[]): DuoRivalry[] {
  const byDuo = new Map<DuoId, DuoRivalry>()
  for (const match of matches) {
    const opponent = opponentDuo(id, match)
    const outcome = duoOutcome(id, match)
    if (opponent === null || outcome === null) continue
    const entry = byDuo.get(opponent) ?? { duoId: opponent, matches: 0, wins: 0, losses: 0 }
    entry.matches += 1
    addOutcome(entry, outcome)
    byDuo.set(opponent, entry)
  }
  return [...byDuo.values()].filter((entry) => entry.matches >= RIVALRY_MIN_MATCHES)
}

type NameOf = (id: DuoId) => string

function byName(nameOf: NameOf) {
  return (a: DuoRivalry, b: DuoRivalry): number =>
    nameOf(a.duoId).localeCompare(nameOf(b.duoId), 'fr', { sensitivity: 'base' })
}

/** « Bête noire », like the player « Némésis »: the opposing duo with the worst win rate; ties → more losses, name. */
export function duoBeteNoire(id: DuoId, matches: Match[], nameOf: NameOf): DuoRivalry | null {
  const candidates = tallyOpponents(id, matches).filter((entry) => entry.losses > 0)
  // Cross-multiplied win rates: exact integer comparison, no float noise.
  candidates.sort((a, b) => a.wins * b.matches - b.wins * a.matches || b.losses - a.losses || byName(nameOf)(a, b))
  return candidates[0] ?? null
}

/** « Victime préférée »: the mirror, the opposing duo with the best win rate; ties → more wins, then name. */
export function duoVictimePreferee(id: DuoId, matches: Match[], nameOf: NameOf): DuoRivalry | null {
  const candidates = tallyOpponents(id, matches).filter((entry) => entry.wins > 0)
  candidates.sort((a, b) => b.wins * a.matches - a.wins * b.matches || b.wins - a.wins || byName(nameOf)(a, b))
  return candidates[0] ?? null
}

// ---------------------------------------------------------------------------
// Current streak, from the duo's rating history (replay order)
// ---------------------------------------------------------------------------

/** Same rule as the player page: the run of identical results ending with the last match, shown from 2. */
export function duoStreak(id: DuoId, history: HistoryPoint[], matches: ReadonlyMap<MatchId, Match>): DuoStreak | null {
  let kind: Outcome | null = null
  let length = 0
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const match = matches.get(history[i].matchId)
    if (match === undefined) break
    const outcome = duoOutcome(id, match)
    if (outcome === null) break
    if (kind === null) kind = outcome
    if (outcome !== kind) break
    length += 1
  }
  if (kind === null || length < MIN_STREAK) return null
  return { kind, length }
}
