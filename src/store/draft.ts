import type { Draft, Format, PlayerId, Score, Settings, Target } from '../types'

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
  }
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
  const base: Draft = { ...draft, format, score: null }
  if (isDraftComplete(base)) return { ...base, activeSlot: NO_ACTIVE_SLOT, step: 'score' }
  const keepActive = visibleSlots(format).includes(draft.activeSlot)
  const activeSlot = keepActive ? draft.activeSlot : firstEmptySlot(base.slots, format)
  return { ...base, activeSlot, step: 'players' }
}

function setTarget(draft: Draft, target: Target): Draft {
  if (target === draft.target) return draft
  return { ...draft, target, score: null }
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
    }
  }
  if (!visible.includes(draft.activeSlot)) return draft
  // Drop the player from a hidden slot first so switching back to 2v2 never shows him twice.
  const cleared = draft.slots.map((id) => (id === playerId ? null : id))
  return settle({ ...draft, slots: withSlot(cleared, draft.activeSlot, playerId), score: null })
}

function clearSlot(draft: Draft, index: number): Draft {
  if (!visibleSlots(draft.format).includes(index)) return draft
  if (draft.slots[index] === null) return { ...draft, activeSlot: index, step: 'players' }
  return { ...draft, slots: withSlot(draft.slots, index, null), activeSlot: index, score: null, step: 'players' }
}

function goToPlayers(draft: Draft): Draft {
  const activeSlot = draft.activeSlot === NO_ACTIVE_SLOT ? firstEmptySlot(draft.slots, draft.format) : draft.activeSlot
  return { ...draft, activeSlot, step: 'players' }
}

function slotAt(ids: PlayerId[], index: number): PlayerId | null {
  if (index >= ids.length) return null
  return ids[index]
}

function prefill(draft: Draft, teamA: PlayerId[], teamB: PlayerId[], target: Target): Draft {
  const format: Format = teamA.length > 1 || teamB.length > 1 ? '2v2' : '1v1'
  const slots = [slotAt(teamA, 0), slotAt(teamA, 1), slotAt(teamB, 0), slotAt(teamB, 1)]
  return settle({ format, target, slots, activeSlot: draft.activeSlot, score: null, step: 'players' })
}

export function draftReducer(draft: Draft, action: DraftAction): Draft {
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
      return { ...draft, score: action.score }
    case 'goToPlayers':
      return goToPlayers(draft)
    case 'saved':
      return { ...draft, step: 'done', lastSavedMatchId: action.matchId }
    case 'reset':
      return initialDraft({ lastFormat: draft.format, lastTarget: draft.target })
    case 'prefill':
      return prefill(draft, action.teamA, action.teamB, action.target)
  }
}
