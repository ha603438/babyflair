// Pure helpers of the match entry / edit flow (spec §3.5, §4, §9). No React, no engine: everything here is
// derived from a Draft, a Match and the store's players, so it is unit-tested in vitest's node environment.
import type { ChipState } from '../../components/Chip'
import { fmtDayHeader, fmtScore, fmtTime, plural } from '../../format'
import { rankIndexOf } from '../../stats'
import { NO_ACTIVE_SLOT, visibleSlots } from '../../store/draft'
import type { Draft, Format, Match, MatchId, PlayerId, Ranking, Score, Target } from '../../types'

/** Slot indices of each team (spec §4: 0-1 = Équipe 1, 2-3 = Équipe 2). */
export const TEAM_A_FIRST_SLOT = 0
export const TEAM_B_FIRST_SLOT = 2

export type DraftTeams = { teamA: PlayerId[]; teamB: PlayerId[] }

/** Fields of a Match that the draft decides; id, seq and the dates come from the caller. */
export type MatchFields = Pick<Match, 'target' | 'teamA' | 'teamB' | 'scoreA' | 'scoreB'>

function formatOf(match: Pick<Match, 'teamA' | 'teamB'>): Format {
  if (match.teamA.length > 1 || match.teamB.length > 1) return '2v2'
  return '1v1'
}

function slotAt(ids: PlayerId[], index: number): PlayerId | null {
  if (index >= ids.length) return null
  return ids[index]
}

function sameIds(a: PlayerId[], b: PlayerId[]): boolean {
  if (a.length !== b.length) return false
  return a.every((id, index) => id === b[index])
}

function lowerFirst(text: string): string {
  if (text.length === 0) return text
  return `${text.charAt(0).toLocaleLowerCase('fr')}${text.slice(1)}`
}

/** The winner / loser-goals pair encoded by a stored match. */
export function scoreOf(match: Pick<Match, 'target' | 'scoreA' | 'scoreB'>): Score {
  if (match.scoreA === match.target) return { winner: 'A', loserGoals: match.scoreB }
  return { winner: 'B', loserGoals: match.scoreA }
}

/** The stored scoreA / scoreB pair of a draft score (the winner always has exactly `target`). */
export function scoresOf(score: Score, target: Target): Pick<Match, 'scoreA' | 'scoreB'> {
  if (score.winner === 'A') return { scoreA: target, scoreB: score.loserGoals }
  return { scoreA: score.loserGoals, scoreB: target }
}

/** Ids of the visible slots grouped by team, or null while a visible slot is still empty. */
export function draftTeams(draft: Pick<Draft, 'slots' | 'format'>): DraftTeams | null {
  const ids: PlayerId[] = []
  for (const index of visibleSlots(draft.format)) {
    const id = draft.slots[index]
    if (id === null || id === undefined) return null
    ids.push(id)
  }
  const half = ids.length / 2
  return { teamA: ids.slice(0, half), teamB: ids.slice(half) }
}

/** Ids of every visible, filled slot in fill order (team A first). */
export function draftPlayerIds(draft: Pick<Draft, 'slots' | 'format'>): PlayerId[] {
  const ids: PlayerId[] = []
  for (const index of visibleSlots(draft.format)) {
    const id = draft.slots[index]
    if (id !== null && id !== undefined) ids.push(id)
  }
  return ids
}

/** The match fields a complete, scored draft describes; null while the roster or the score is missing. */
export function matchFieldsOf(draft: Draft): MatchFields | null {
  const teams = draftTeams(draft)
  if (teams === null || draft.score === null) return null
  return { target: draft.target, teamA: teams.teamA, teamB: teams.teamB, ...scoresOf(draft.score, draft.target) }
}

/** Edit screen: a local draft opened directly on the score step, format derived from the team sizes. */
export function matchToDraft(match: Match): Draft {
  return {
    format: formatOf(match),
    target: match.target,
    slots: [slotAt(match.teamA, 0), slotAt(match.teamA, 1), slotAt(match.teamB, 0), slotAt(match.teamB, 1)],
    activeSlot: NO_ACTIVE_SLOT,
    score: scoreOf(match),
    step: 'score',
  }
}

/**
 * Edit screen save: the stored match with the draft's teams, target and score. Keeps id, seq, createdAt and
 * playedAt (the date is not editable in v1) and stamps updatedAt. Throws on an incomplete or unscored draft:
 * callers gate the save button with `isDraftChanged`.
 */
export function draftToMatch(draft: Draft, base: Match, nowIso: string): Match {
  const fields = matchFieldsOf(draft)
  if (fields === null) throw new Error('draftToMatch: the draft has no complete roster or no score')
  return {
    id: base.id,
    seq: base.seq,
    createdAt: base.createdAt,
    playedAt: base.playedAt,
    updatedAt: nowIso,
    ...fields,
  }
}

/** New-match save: playedAt = createdAt = updatedAt = now (spec §11); the store assigns `seq`. Throws like draftToMatch. */
export function newMatchFromDraft(draft: Draft, id: MatchId, nowIso: string): Omit<Match, 'seq'> {
  const fields = matchFieldsOf(draft)
  if (fields === null) throw new Error('newMatchFromDraft: the draft has no complete roster or no score')
  return { id, playedAt: nowIso, createdAt: nowIso, updatedAt: nowIso, ...fields }
}

/** True when the draft is complete, scored and describes something else than the stored match (§3.5 save gate). */
export function isDraftChanged(draft: Draft, base: Match): boolean {
  const fields = matchFieldsOf(draft)
  if (fields === null) return false
  if (fields.target !== base.target) return true
  if (fields.scoreA !== base.scoreA || fields.scoreB !== base.scoreB) return true
  return !sameIds(fields.teamA, base.teamA) || !sameIds(fields.teamB, base.teamB)
}

/** Helper caption of step A (§9): « 0 joueur sur 4 » / « 2 joueurs sur 4 » / « Il manque 1 joueur » / « 1 joueur sur 2 ». */
export function rosterCaption(filled: number, total: number): string {
  if (total === 4 && filled === 3) return 'Il manque 1 joueur'
  return `${plural(filled, 'joueur')} sur ${total}`
}

/** The step A caption for a draft; with a single player in the store it reads « Encore 1 joueur à ajouter » (§3.2). */
export function entryCaption(draft: Pick<Draft, 'slots' | 'format'>, playerCount: number): string {
  if (playerCount === 1) return 'Encore 1 joueur à ajouter'
  const visible = visibleSlots(draft.format)
  return rosterCaption(draftPlayerIds(draft).length, visible.length)
}

/** Primary button of step B: « Enregistrer » until a score exists, then « Enregistrer 10 – 8 » (winner first). */
export function saveLabel(target: Target, score: Score | null): string {
  if (score === null) return 'Enregistrer'
  return `Enregistrer ${fmtScore(target, score.loserGoals)}`
}

/** Chip state of a player: the team of the visible slot that holds them, else default. Hidden 1v1 slots do not count. */
export function chipStateOf(draft: Pick<Draft, 'slots' | 'format'>, playerId: PlayerId): ChipState {
  const index = visibleSlots(draft.format).find((slot) => draft.slots[slot] === playerId)
  if (index === undefined) return 'default'
  if (index < TEAM_B_FIRST_SLOT) return 'team1'
  return 'team2'
}

/** Result view caption (§9 « Résultat »): « aujourd'hui · 12:42 · en 10 » (« hier · … » if the view outlived the day). */
export function resultDateLine(playedAt: string, target: Target, now: Date): string {
  return `${lowerFirst(fmtDayHeader(playedAt, now))} · ${fmtTime(playedAt)} · en ${target}`
}

/** 1-based ranks of the given players among the ranked list; rookies and inactive players are simply absent. */
export function rankMapOf(ranking: Ranking, ids: PlayerId[]): Map<PlayerId, number> {
  const ranks = new Map<PlayerId, number>()
  for (const id of ids) {
    const rank = rankIndexOf(ranking, id)
    if (rank !== null) ranks.set(id, rank)
  }
  return ranks
}
