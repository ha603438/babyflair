// Appels à jouer (« Proposer un baby »): pure decisions over the store's calls / callPlayers. No React, no network,
// so everything here runs in vitest's node environment.
import type { Call, CallPlayer, CallResponse, Player, PlayerId, PlayerStatus } from '../types'

export const CALL_CAPACITY = 4
/** Recruiting window: without 4 players after 5 minutes, the call is over (stored as expires_at). */
export const CALL_RECRUIT_MS = 5 * 60 * 1000
/** A full call stays open this long after its creation, so the 4 players can still « Former les équipes ». */
export const CALL_FULL_MS = 45 * 60 * 1000

export const CALL_COPY = {
  propose: 'Je flaire un baby',
  confirmSend: 'Envoyer la notification à tout le monde ?',
  send: 'Envoyer la notification',
  hot: 'Chaud pour prendre une branlée ?',
  join: 'Chauuud 🔥',
  decline: 'Non je fais semblant de bosser',
  alreadyIn: 'Déjà inscrit',
  chooseToAnswer: 'Choisir mon profil pour répondre',
  notThisTime: 'Pas cette fois',
  formTeams: 'Former les équipes',
  over: 'Appel terminé',
  created: 'Appel créé',
  hotList: 'Chauds',
  notHotList: 'Pas chauds',
  pendingList: 'Pas encore répondu',
  full: 'Complet',
  you: '(toi)',
} as const

export type Roster = { call: Call; organizer: Player | undefined; participants: Player[]; participantIds: PlayerId[] }

/** The three lists of the call dialog. */
export type CallResponses = { in: Player[]; out: Player[]; pending: Player[] }

export const NO_RESPONSES: CallResponses = { in: [], out: [], pending: [] }

function parseTime(iso: string): number {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return 0
  return time
}

export function newCall(id: string, createdBy: PlayerId, now: Date): Call {
  return {
    id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CALL_RECRUIT_MS).toISOString(),
    createdBy,
  }
}

export function newCallPlayer(
  callId: string,
  playerId: PlayerId,
  now: Date,
  response: CallResponse = 'in',
): CallPlayer {
  return { callId, playerId, joinedAt: now.toISOString(), response }
}

/** Stored / server values: anything but 'out' (a row written before the answers existed included) means 'in'. */
export function parseCallResponse(value: unknown): CallResponse {
  if (value === 'out') return 'out'
  return 'in'
}

function answersOf(callId: string, callPlayers: CallPlayer[]): CallPlayer[] {
  return callPlayers
    .filter((cp) => cp.callId === callId)
    .sort((a, b) => parseTime(a.joinedAt) - parseTime(b.joinedAt))
}

/**
 * Not closed, and either still recruiting (before expires_at = 5 min) or full with its 4 players (until 45 min after
 * creation). Expired calls are simply ignored client-side: no server cron.
 */
export function isCallOpen(call: Call, now: Date, callPlayers: CallPlayer[] = []): boolean {
  if (call.closedAt !== undefined) return false
  if (parseTime(call.expiresAt) > now.getTime()) return true
  if (!isCallFull(call.id, callPlayers)) return false
  return parseTime(call.createdAt) + CALL_FULL_MS > now.getTime()
}

/** The players who answered « Chauuud 🔥 », in answer order: only they take one of the 4 places. */
export function participantIdsOf(callId: string, callPlayers: CallPlayer[]): PlayerId[] {
  return answersOf(callId, callPlayers)
    .filter((cp) => cp.response === 'in')
    .map((cp) => cp.playerId)
}

/** This player's current answer to the call, undefined before any. */
export function responseOf(
  callId: string,
  callPlayers: CallPlayer[],
  playerId: PlayerId | undefined,
): CallResponse | undefined {
  if (playerId === undefined) return undefined
  return callPlayers.find((cp) => cp.callId === callId && cp.playerId === playerId)?.response
}

export function isInCall(callId: string, callPlayers: CallPlayer[], viewerId: PlayerId | undefined): boolean {
  return responseOf(callId, callPlayers, viewerId) === 'in'
}

export function isCallFull(callId: string, callPlayers: CallPlayer[]): boolean {
  return participantIdsOf(callId, callPlayers).length >= CALL_CAPACITY
}

/**
 * Whether this answer is worth recording: not the player's current one already, and « Chauuud 🔥 » only while there
 * is a place left. Declining is always possible (it frees a place).
 */
export function canRespond(
  callId: string,
  callPlayers: CallPlayer[],
  playerId: PlayerId,
  response: CallResponse,
): boolean {
  const current = responseOf(callId, callPlayers, playerId)
  if (current === response) return false
  if (response === 'out') return true
  return !isCallFull(callId, callPlayers)
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
    .filter((call) => isCallOpen(call, now, callPlayers))
    .filter((call) => !isCallFull(call.id, callPlayers) || isInCall(call.id, callPlayers, viewerId))
    .sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt))
  return candidates[0] ?? null
}

/** Any open call, full or not: « Proposer un baby » reopens it instead of creating a second one. */
export function anyOpenCall(calls: Call[], now: Date, callPlayers: CallPlayer[] = []): Call | null {
  const open = calls.filter((call) => isCallOpen(call, now, callPlayers)).sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt))
  return open[0] ?? null
}

function playersOf(ids: PlayerId[], players: Map<PlayerId, Player>): Player[] {
  const known: Player[] = []
  for (const id of ids) {
    const player = players.get(id)
    if (player !== undefined) known.push(player)
  }
  return known
}

export function rosterOf(call: Call, callPlayers: CallPlayer[], players: Map<PlayerId, Player>): Roster {
  const participantIds = participantIdsOf(call.id, callPlayers)
  const participants = playersOf(participantIds, players)
  return { call, organizer: players.get(call.createdBy), participants, participantIds }
}

function organizerFirst(ids: PlayerId[], organizerId: PlayerId): PlayerId[] {
  if (!ids.includes(organizerId)) return ids
  return [organizerId, ...ids.filter((id) => id !== organizerId)]
}

/** Who should still answer: not answered yet, not a guest, not inactive in the ranking. */
function isPending(player: Player, answered: Set<PlayerId>, status: PlayerStatus | undefined): boolean {
  if (answered.has(player.id) || player.isGuest) return false
  return status !== 'inactive'
}

/**
 * The call dialog's lists: « Chauds » (organizer first, then by answer time), « Pas chauds » (by answer time) and
 * « Pas encore répondu » (the office's players without an answer, guests and inactive players left out, A→Z).
 * `byPlayer` is the replay's (useReplay().result.byPlayer), for the inactive status; deleted players are skipped.
 */
export function callResponses(
  call: Call,
  callPlayers: CallPlayer[],
  players: Player[],
  byPlayer: ReadonlyMap<PlayerId, { status: PlayerStatus }>,
): CallResponses {
  const answers = answersOf(call.id, callPlayers)
  const byId = new Map<PlayerId, Player>(players.map((player) => [player.id, player]))
  const inIds = answers.filter((cp) => cp.response === 'in').map((cp) => cp.playerId)
  const outIds = answers.filter((cp) => cp.response === 'out').map((cp) => cp.playerId)
  const answered = new Set(answers.map((cp) => cp.playerId))
  const pending = players
    .filter((player) => isPending(player, answered, byPlayer.get(player.id)?.status))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  return { in: playersOf(organizerFirst(inIds, call.createdBy), byId), out: playersOf(outIds, byId), pending }
}

/** « Chauds · 2/4 ». */
export function hotListCaption(count: number): string {
  return `${CALL_COPY.hotList} · ${Math.min(count, CALL_CAPACITY)}/${CALL_CAPACITY}`
}

/** « Bob (toi) » for this phone's profile. */
export function nameFor(player: Player, viewerId: PlayerId | undefined): string {
  if (player.id !== viewerId) return player.name
  return `${player.name} ${CALL_COPY.you}`
}

/** « Alice flaire un baby · 2/4 présents ». */
export function rosterLine(organizerName: string | undefined, count: number): string {
  const name = organizerName ?? 'Quelqu’un'
  return `${name} flaire un baby · ${Math.min(count, CALL_CAPACITY)}/${CALL_CAPACITY} présents`
}

export function canFormTeams(count: number): boolean {
  return count >= CALL_CAPACITY
}

export function notifyToast(sent: number): string {
  if (sent === 1) return 'Notification envoyée à 1 téléphone'
  return `Notification envoyée à ${sent} téléphones`
}
