import type { Call, CallPlayer, Match, Player, Settings, Store } from '../types'
import { backfillSeq, DEFAULT_SETTINGS, initialStore, nextSeqOf } from './reducer'

export const STORAGE_KEY = 'babyflair.v1'

const EPOCH = new Date(0).toISOString()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function optionalIso(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value
}

function normalisePlayer(value: unknown): Player | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : EPOCH
  return { id: value.id, name: value.name, isGuest: value.isGuest === true, createdAt }
}

function normaliseMatch(value: unknown): Match | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || typeof value.playedAt !== 'string') return null
  if (!isStringArray(value.teamA) || !isStringArray(value.teamB)) return null
  if (value.target !== 5 && value.target !== 10) return null
  if (!isFiniteNumber(value.scoreA) || !isFiniteNumber(value.scoreB)) return null
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : value.playedAt
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : createdAt
  // `seq` may be missing in data written before seq existed; backfillSeq assigns it afterwards.
  const seq = Number.isInteger(value.seq) ? (value.seq as number) : (undefined as unknown as number)
  const match: Match = {
    id: value.id,
    seq,
    playedAt: value.playedAt,
    createdAt,
    updatedAt,
    target: value.target,
    teamA: value.teamA,
    teamB: value.teamB,
    scoreA: value.scoreA,
    scoreB: value.scoreB,
  }
  // Mode partagé authorship (server trigger); optional, so older data and exports stay valid without it.
  if (typeof value.createdBy === 'string' && value.createdBy.length > 0) match.createdBy = value.createdBy
  if (typeof value.updatedBy === 'string' && value.updatedBy.length > 0) match.updatedBy = value.updatedBy
  return match
}

function normaliseCall(value: unknown): Call | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || typeof value.expiresAt !== 'string' || typeof value.createdBy !== 'string') return null
  const createdAt = typeof value.createdAt === 'string' ? value.createdAt : EPOCH
  const call: Call = { id: value.id, createdAt, expiresAt: value.expiresAt, createdBy: value.createdBy }
  if (typeof value.closedAt === 'string') call.closedAt = value.closedAt
  return call
}

function normaliseCallPlayer(value: unknown): CallPlayer | null {
  if (!isRecord(value)) return null
  if (typeof value.callId !== 'string' || typeof value.playerId !== 'string') return null
  const joinedAt = typeof value.joinedAt === 'string' ? value.joinedAt : EPOCH
  return { callId: value.callId, playerId: value.playerId, joinedAt }
}

function arrayOf(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value
}

export function normaliseSettings(value: unknown): Settings {
  if (!isRecord(value)) return DEFAULT_SETTINGS
  const lastFormat = value.lastFormat === '1v1' || value.lastFormat === '2v2' ? value.lastFormat : '2v2'
  const lastTarget = value.lastTarget === 5 || value.lastTarget === 10 ? value.lastTarget : 5
  const settings: Settings = { lastFormat, lastTarget }
  const installHintDismissedAt = optionalIso(value.installHintDismissedAt)
  const exportHintDismissedAt = optionalIso(value.exportHintDismissedAt)
  const lastExportAt = optionalIso(value.lastExportAt)
  if (installHintDismissedAt !== undefined) settings.installHintDismissedAt = installHintDismissedAt
  if (exportHintDismissedAt !== undefined) settings.exportHintDismissedAt = exportHintDismissedAt
  if (lastExportAt !== undefined) settings.lastExportAt = lastExportAt
  if (typeof value.officeCode === 'string' && value.officeCode.length > 0) settings.officeCode = value.officeCode
  if (typeof value.seenChangelogId === 'string') settings.seenChangelogId = value.seenChangelogId
  if (typeof value.myPlayerId === 'string' && value.myPlayerId.length > 0) settings.myPlayerId = value.myPlayerId
  if (value.profileConfirmed === true) settings.profileConfirmed = true
  if (value.visitor === true) settings.visitor = true
  if (value.pushEnabled === true) settings.pushEnabled = true
  const notifHintDismissedAt = optionalIso(value.notifHintDismissedAt)
  if (notifHintDismissedAt !== undefined) settings.notifHintDismissedAt = notifHintDismissedAt
  return settings
}

function collect<T>(items: unknown[], normalise: (item: unknown) => T | null): T[] {
  const result: T[] = []
  for (const item of items) {
    const normalised = normalise(item)
    if (normalised !== null) result.push(normalised)
  }
  return result
}

function resolveNextSeq(stored: unknown, minimum: number): number {
  if (!Number.isInteger(stored)) return minimum
  const value = stored as number
  if (value < minimum) return minimum
  return value
}

/** Loose validation of a parsed store: version 1 and the two arrays, items normalised, seq backfilled. */
export function normaliseStore(data: unknown): Store | null {
  if (!isRecord(data)) return null
  if (data.version !== 1) return null
  if (!Array.isArray(data.players) || !Array.isArray(data.matches)) return null
  const matches = backfillSeq(collect(data.matches, normaliseMatch))
  const nextSeq = resolveNextSeq(data.nextSeq, nextSeqOf(matches))
  return {
    version: 1,
    players: collect(data.players, normalisePlayer),
    matches,
    settings: normaliseSettings(data.settings),
    nextSeq,
    // Absent in data written before the appels existed; the next sync fills them in shared mode.
    calls: collect(arrayOf(data.calls), normaliseCall),
    callPlayers: collect(arrayOf(data.callPlayers), normaliseCallPlayer),
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function loadStore(): Store {
  const raw = readRaw()
  if (raw === null) return initialStore
  const store = normaliseStore(parseJson(raw))
  if (store === null) return initialStore
  return store
}

export function saveStore(store: Store): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    return true
  } catch {
    return false
  }
}
