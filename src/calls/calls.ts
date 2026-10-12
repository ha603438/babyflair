// Appels à jouer (« Proposer un baby »): pure decisions over the store's calls / callPlayers. No React, no network,
// so everything here runs in vitest's node environment.
import type { Call, CallPlayer, Player, PlayerId } from '../types'

export const CALL_CAPACITY = 4
export const CALL_DURATION_MS = 45 * 60 * 1000

export const CALL_COPY = {
  propose: 'Proposer un baby',
  whoAreYou: 'Qui es-tu ?',
  send: 'Envoyer la notification',
  hot: 'Chaud pour prendre une branlée ?',
  join: 'Je suis chaud',
  notThisTime: 'Pas cette fois',
  formTeams: 'Former les équipes',
  over: 'Appel terminé',
  created: 'Appel créé',
} as const

export type Roster = { call: Call; organizer: Player | undefined; participants: Player[]; participantIds: PlayerId[] }

function parseTime(iso: string): number {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return 0
  return time
}

export function newCall(id: string, createdBy: PlayerId, now: Date): Call {
  return {
    id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CALL_DURATION_MS).toISOString(),
    createdBy,
  }
}

export function newCallPlayer(callId: string, playerId: PlayerId, now: Date): CallPlayer {
  return { callId, playerId, joinedAt: now.toISOString() }
}

/** Not closed and not past expires_at (expired calls are simply ignored client-side: no server cron). */
export function isCallOpen(call: Call, now: Date): boolean {
  if (call.closedAt !== undefined) return false
  return parseTime(call.expiresAt) > now.getTime()
}

export function participantIdsOf(callId: string, callPlayers: CallPlayer[]): PlayerId[] {
  return callPlayers
    .filter((cp) => cp.callId === callId)
    .sort((a, b) => parseTime(a.joinedAt) - parseTime(b.joinedAt))
    .map((cp) => cp.playerId)
}

export function isInCall(callId: string, callPlayers: CallPlayer[], viewerId: PlayerId | undefined): boolean {
  if (viewerId === undefined) return false
  return callPlayers.some((cp) => cp.callId === callId && cp.playerId === viewerId)
}

export function isCallFull(callId: string, callPlayers: CallPlayer[]): boolean {
  return participantIdsOf(callId, callPlayers).length >= CALL_CAPACITY
}

/**
 * The call this phone should be looking at: open, and either still has room or already includes the viewer.
 * The newest one wins when several are open.
 */
export function openCallFor(
  calls: Call[],
  callPlayers: CallPlayer[],
  viewerId: PlayerId | undefined,
  now: Date,
): Call | null {
  const candidates = calls
    .filter((call) => isCallOpen(call, now))
    .filter((call) => !isCallFull(call.id, callPlayers) || isInCall(call.id, callPlayers, viewerId))
    .sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt))
  return candidates[0] ?? null
}

/** Any open call, full or not: « Proposer un baby » reopens it instead of creating a second one. */
export function anyOpenCall(calls: Call[], now: Date): Call | null {
  const open = calls.filter((call) => isCallOpen(call, now)).sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt))
  return open[0] ?? null
}

export function rosterOf(call: Call, callPlayers: CallPlayer[], players: Map<PlayerId, Player>): Roster {
  const participantIds = participantIdsOf(call.id, callPlayers)
  const participants: Player[] = []
  for (const id of participantIds) {
    const player = players.get(id)
    if (player !== undefined) participants.push(player)
  }
  return { call, organizer: players.get(call.createdBy), participants, participantIds }
}

/** « Alice propose un baby · 2/4 présents ». */
export function rosterLine(organizerName: string | undefined, count: number): string {
  const name = organizerName ?? 'Quelqu’un'
  return `${name} propose un baby · ${Math.min(count, CALL_CAPACITY)}/${CALL_CAPACITY} présents`
}

export function canFormTeams(count: number): boolean {
  return count >= CALL_CAPACITY
}

export function notifyToast(sent: number): string {
  if (sent === 1) return 'Notification envoyée à 1 téléphone'
  return `Notification envoyée à ${sent} téléphones`
}
