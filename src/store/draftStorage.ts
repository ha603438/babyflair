// The match sheet survives the app being closed during the game: format, target, players and announcements are kept
// in localStorage (their own versioned key, never in the store, never exported nor synced) and restored on load. The
// score is not kept: it is entered at the end. Cleared once the match is saved (result view) or the sheet is emptied.
import type { Draft, Format, PlayerId, Settings, Target } from '../types'
import { initialDraft, restoreDraft } from './draft'

export const DRAFT_STORAGE_KEY = 'babyflair.draft.v1'

const DRAFT_VERSION = 1
const SLOT_COUNT = 4

export type StoredDraft = {
  version: 1
  format: Format
  target: Target
  slots: (PlayerId | null)[]
  betA: number | null
  betB: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readSlot(item: unknown): PlayerId | null | undefined {
  if (item === null) return null
  if (typeof item !== 'string' || item.length === 0) return undefined
  return item
}

/** Four slots, each a player id or null, no player twice (the sheet would otherwise save an invalid match). */
function readSlots(value: unknown): (PlayerId | null)[] | null {
  if (!Array.isArray(value) || value.length !== SLOT_COUNT) return null
  const items: unknown[] = value
  const slots: (PlayerId | null)[] = []
  for (const item of items) {
    const slot = readSlot(item)
    if (slot === undefined) return null
    slots.push(slot)
  }
  const ids = slots.filter((slot) => slot !== null)
  if (new Set(ids).size !== ids.length) return null
  return slots
}

function readStoredBet(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return null
  return value
}

/** Nothing worth keeping: the result view (the match is saved) or an empty sheet. */
function isDisposable(draft: Draft): boolean {
  if (draft.step === 'done') return true
  return draft.slots.every((slot) => slot === null)
}

/** The persisted parts of a draft, or null when there is nothing to keep. */
export function draftToStored(draft: Draft): StoredDraft | null {
  if (isDisposable(draft)) return null
  return {
    version: DRAFT_VERSION,
    format: draft.format,
    target: draft.target,
    slots: draft.slots.slice(),
    betA: draft.betA ?? null,
    betB: draft.betB ?? null,
  }
}

/** A draft from a parsed payload, or null for anything that is not a version-1 sheet. */
export function draftFromStored(value: unknown): Draft | null {
  if (!isRecord(value) || value.version !== DRAFT_VERSION) return null
  if (value.format !== '1v1' && value.format !== '2v2') return null
  if (value.target !== 5 && value.target !== 10) return null
  const slots = readSlots(value.slots)
  if (slots === null) return null
  const draft = restoreDraft({
    format: value.format,
    target: value.target,
    slots,
    betA: readStoredBet(value.betA),
    betB: readStoredBet(value.betB),
  })
  if (isDisposable(draft)) return null
  return draft
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (raw === null) return null
    return draftFromStored(parseJson(raw))
  } catch {
    return null
  }
}

/** Writes the sheet, or removes it when there is nothing to keep. Storage errors are ignored (private mode, quota). */
export function saveDraft(draft: Draft): void {
  const stored = draftToStored(draft)
  try {
    if (stored === null) {
      localStorage.removeItem(DRAFT_STORAGE_KEY)
      return
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // The sheet simply does not survive a restart.
  }
}

/** useReducer initialiser: the saved sheet if there is one, else a fresh draft from the settings. */
export function loadOrInitialDraft(settings: Settings): Draft {
  return loadDraft() ?? initialDraft(settings)
}
