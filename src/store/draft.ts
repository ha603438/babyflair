import { betFields, clampBet } from '../bets'
import type { Draft, Format, PlayerId, Score, Settings, Target, Team } from '../types'

export type DraftAction =
  | { type: 'setFormat'; format: Format }
  | { type: 'setTarget'; target: Target }
  | { type: 'setActiveSlot'; index: number }
  | { type: 'pick'; playerId: PlayerId }
  | { type: 'clearSlot'; index: number }
  | { type: 'setScore'; score: Score | null }
  | { type: 'goToPlayers' }
  | { type: 'saved'; matchId: string }
  | { type: 'reset' }
  | { type: 'prefill'; teamA: PlayerId[]; teamB: PlayerId[]; target: Target }
  | { type: 'swapTeam'; team: 1 | 2 } /* 2v2: swaps arrière and avant of a team */
  | { type: 'keepWinners'; winner: Team; teamA: PlayerId[]; teamB: PlayerId[]; target: Target } /* winners stay on their side */
  | { type: 'setComeback'; value: boolean } /* « Comeback » box, only kept on a 5-4 in 5 */
  | { type: 'setBet'; team: Team; n: number | null } /* « Annoncer un écart » (1..target), null = « Retirer » */

/** `activeSlot` value meaning "no slot is active" (every required slot is filled). */
export const NO_ACTIVE_SLOT = -1

const SLOTS_1V1: readonly number[] = [0, 2]
const SLOTS_2V2: readonly number[] = [0, 1, 2, 3]

/** Slot indices used by a format, in fill order. 1v1 keeps the ids of slots 1 and 3 in memory but hides them. */
export function visibleSlots(format: Format): readonly number[] {
  if (format === '1v1') return SLOTS_1V1
  return SLOTS_2V2
}

export function initialDraft(settings: Settings): Draft {
  return {
    format: settings.lastFormat,
    target: settings.lastTarget,
    slots: [null, null, null, null],
    activeSlot: 0,
    score: null,
    step: 'players',
    comeback: false,
  }
}

/** The « Comeback » box only applies to a 5-4 in a game to 5 (winners trailing 0-4). */
export function canBeComeback(draft: Pick<Draft, 'target' | 'score'>): boolean {
  return draft.target === 5 && draft.score?.loserGoals === 4
}

function firstEmptySlot(slots: (PlayerId | null)[], format: Format): number {
  const empty = visibleSlots(format).find((index) => slots[index] === null)
  if (empty === undefined) return NO_ACTIVE_SLOT
  return empty
}

export function isDraftComplete(draft: Pick<Draft, 'slots' | 'format'>): boolean {
  return firstEmptySlot(draft.slots, draft.format) === NO_ACTIVE_SLOT
}

function withSlot(slots: (PlayerId | null)[], index: number, value: PlayerId | null): (PlayerId | null)[] {
  const next = slots.slice()
  next[index] = value
  return next
}

/** Recomputes the active slot and the step from the slots: the score panel opens as soon as the roster is complete. */
function settle(draft: Draft): Draft {
  const next = firstEmptySlot(draft.slots, draft.format)
  if (next === NO_ACTIVE_SLOT) return { ...draft, activeSlot: NO_ACTIVE_SLOT, step: 'score' }
  return { ...draft, activeSlot: next, step: 'players' }
}

function setFormat(draft: Draft, format: Format): Draft {
  // On the result view the control only chooses the format of the next match; the result stays on screen.
  if (draft.step === 'done') return { ...draft, format }
  if (format === draft.format) return draft
  const base: Draft = { ...draft, format, score: null, comeback: false }
  if (isDraftComplete(base)) return { ...base, activeSlot: NO_ACTIVE_SLOT, step: 'score' }
  const keepActive = visibleSlots(format).includes(draft.activeSlot)
  const activeSlot = keepActive ? draft.activeSlot : firstEmptySlot(base.slots, format)
  return { ...base, activeSlot, step: 'players' }
}

function setTarget(draft: Draft, target: Target): Draft {
  if (target === draft.target) return draft
  return { ...draft, target, score: null, comeback: false }
}

function setActiveSlot(draft: Draft, index: number): Draft {
  if (draft.step === 'done') return draft
  if (!visibleSlots(draft.format).includes(index)) return draft
  return { ...draft, activeSlot: index, step: 'players' }
}

function pick(draft: Draft, playerId: PlayerId): Draft {
  const visible = visibleSlots(draft.format)
  const occupied = visible.find((index) => draft.slots[index] === playerId)
  if (occupied !== undefined) {
    return {
      ...draft,
      slots: withSlot(draft.slots, occupied, null),
      activeSlot: occupied,
      score: null,
      step: 'players',
      comeback: false,
    }
  }
  if (!visible.includes(draft.activeSlot)) return draft
  // Drop the player from a hidden slot first so switching back to 2v2 never shows him twice.
  const cleared = draft.slots.map((id) => (id === playerId ? null : id))
  return settle({ ...draft, slots: withSlot(cleared, draft.activeSlot, playerId), score: null, comeback: false })
}

function clearSlot(draft: Draft, index: number): Draft {
  if (!visibleSlots(draft.format).includes(index)) return draft
  if (draft.slots[index] === null) return { ...draft, activeSlot: index, step: 'players' }
  const slots = withSlot(draft.slots, index, null)
  return { ...draft, slots, activeSlot: index, score: null, step: 'players', comeback: false }
}

function sameScore(a: Score | null, b: Score | null): boolean {
  if (a === null || b === null) return a === b
  return a.winner === b.winner && a.loserGoals === b.loserGoals
}

/** A new score clears the « Comeback » box; tapping the selected score again keeps it. */
function setScore(draft: Draft, score: Score | null): Draft {
  if (sameScore(draft.score, score)) return { ...draft, score }
  return { ...draft, score, comeback: false }
}

function setComeback(draft: Draft, value: boolean): Draft {
  const comeback = value && canBeComeback(draft)
  if (comeback === (draft.comeback === true)) return draft
  return { ...draft, comeback }
}

function goToPlayers(draft: Draft): Draft {
  const activeSlot = draft.activeSlot === NO_ACTIVE_SLOT ? firstEmptySlot(draft.slots, draft.format) : draft.activeSlot
  return { ...draft, activeSlot, step: 'players' }
}

function slotAt(ids: PlayerId[], index: number): PlayerId | null {
  if (index >= ids.length) return null
  return ids[index]
}

/** The announcements go along (« Continuer » after « Modifier »): keepBets drops them if the teams changed. */
function prefill(draft: Draft, teamA: PlayerId[], teamB: PlayerId[], target: Target): Draft {
  const format: Format = teamA.length > 1 || teamB.length > 1 ? '2v2' : '1v1'
  const slots = [slotAt(teamA, 0), slotAt(teamA, 1), slotAt(teamB, 0), slotAt(teamB, 1)]
  const { activeSlot } = draft
  const next = settle({ format, target, slots, activeSlot, score: null, step: 'players', comeback: false })
  if (draft.step === 'done') return next
  return { ...next, ...betFields(draft.betA, draft.betB) }
}

function swapTeam(draft: Draft, team: 1 | 2): Draft {
  if (draft.format !== '2v2') return draft
  const first = team === 1 ? 0 : 2
  const slots = draft.slots.slice()
  ;[slots[first], slots[first + 1]] = [slots[first + 1], slots[first]]
  return { ...draft, slots }
}

/** « Les gagnants restent » : the winning team keeps its slots (and positions), the losing side is emptied. */
function keepWinners(draft: Draft, winner: Team, teamA: PlayerId[], teamB: PlayerId[], target: Target): Draft {
  const format: Format = teamA.length > 1 || teamB.length > 1 ? '2v2' : '1v1'
  const winners = winner === 'A' ? teamA : teamB
  const first = winner === 'A' ? 0 : 2
  const slots: (PlayerId | null)[] = [null, null, null, null]
  slots[first] = slotAt(winners, 0)
  slots[first + 1] = slotAt(winners, 1)
  return settle({ format, target, slots, activeSlot: draft.activeSlot, score: null, step: 'players', comeback: false })
}

// ---------------------------------------------------------------------------
// Announcements (« Annoncer un écart »): one per team, on a complete roster, before one match
// ---------------------------------------------------------------------------

type BetKey = 'betA' | 'betB'

function betKeyOf(team: Team): BetKey {
  if (team === 'A') return 'betA'
  return 'betB'
}

function hasBets(draft: Draft): boolean {
  return clampBet(draft.betA, draft.target) !== null || clampBet(draft.betB, draft.target) !== null
}

export function withoutBets(draft: Draft): Draft {
  const { betA: _betA, betB: _betB, ...rest } = draft
  return rest
}

function withBet(draft: Draft, key: BetKey, n: number | null): Draft {
  if (n !== null) return { ...draft, [key]: n }
  const { [key]: _removed, ...rest } = draft
  return rest
}

function setBet(draft: Draft, team: Team, n: number | null): Draft {
  if (draft.step === 'done' || !isDraftComplete(draft)) return draft
  const key = betKeyOf(team)
  const value = clampBet(n, draft.target)
  if (value === (draft[key] ?? null)) return draft
  return withBet(draft, key, value)
}

/** Each team's ids, sorted (an arrière / avant swap keeps the same team); null while a visible slot is empty. */
function rosterKey(draft: Draft): string | null {
  const visible = visibleSlots(draft.format)
  if (visible.some((index) => draft.slots[index] === null)) return null
  const team = (first: number): string =>
    visible
      .filter((index) => index >= first && index < first + 2)
      .map((index) => draft.slots[index])
      .sort()
      .join('+')
  return `${draft.format}|${team(0)}|${team(2)}`
}

function clampedBets(draft: Draft): Draft {
  const betA = clampBet(draft.betA, draft.target)
  const betB = clampBet(draft.betB, draft.target)
  if (betA === (draft.betA ?? null) && betB === (draft.betB ?? null)) return draft
  return withBet(withBet(draft, 'betA', betA), 'betB', betB)
}

/**
 * Announcements belong to one roster before one match: a change of team (or of format), an emptied slot or the next
 * match after a save drops them; a new target clamps them to 1..target.
 */
function keepBets(before: Draft, after: Draft): Draft {
  if (after === before || !hasBets(after)) return after
  if (before.step === 'done' && after.step !== 'done') return withoutBets(after)
  const key = rosterKey(after)
  if (key === null || key !== rosterKey(before)) return withoutBets(after)
  return clampedBets(after)
}

function reduceDraft(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case 'setFormat':
      return setFormat(draft, action.format)
    case 'setTarget':
      return setTarget(draft, action.target)
    case 'setActiveSlot':
      return setActiveSlot(draft, action.index)
    case 'pick':
      return pick(draft, action.playerId)
    case 'clearSlot':
      return clearSlot(draft, action.index)
    case 'setScore':
      return setScore(draft, action.score)
    case 'goToPlayers':
      return goToPlayers(draft)
    case 'saved':
      return { ...draft, step: 'done', lastSavedMatchId: action.matchId }
    case 'reset':
      return initialDraft({ lastFormat: draft.format, lastTarget: draft.target })
    case 'prefill':
      return prefill(draft, action.teamA, action.teamB, action.target)
    case 'swapTeam':
      return swapTeam(draft, action.team)
    case 'keepWinners':
      return keepWinners(draft, action.winner, action.teamA, action.teamB, action.target)
    case 'setComeback':
      return setComeback(draft, action.value)
    case 'setBet':
      return setBet(draft, action.team, action.n)
  }
}

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  return keepBets(draft, reduceDraft(draft, action))
}

export type DraftParts = Pick<Draft, 'format' | 'target' | 'slots' | 'betA' | 'betB'>

/**
 * A draft rebuilt from its persisted parts (src/store/draftStorage.ts): no score yet, the active slot and the step
 * recomputed from the slots, announcements kept only on a complete roster and clamped to the target.
 */
export function restoreDraft(parts: DraftParts): Draft {
  const base: Draft = { ...initialDraft({ lastFormat: parts.format, lastTarget: parts.target }), slots: parts.slots }
  const settled = settle(base)
  if (!isDraftComplete(settled)) return settled
  return clampedBets(withBet(withBet(settled, 'betA', parts.betA ?? null), 'betB', parts.betB ?? null))
}
