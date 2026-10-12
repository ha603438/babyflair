import { withValidComeback } from '../stats'
import type { Call, CallPlayer, Match, MatchId, Player, PlayerId, Settings, Store } from '../types'

export type Action =
  | { type: 'addPlayer'; player: Player }
  | { type: 'renamePlayer'; id: PlayerId; name: string; isGuest: boolean }
  | { type: 'deletePlayer'; id: PlayerId }
  | { type: 'addMatch'; match: Omit<Match, 'seq'> }
  | { type: 'updateMatch'; match: Match }
  | { type: 'deleteMatch'; id: MatchId }
  | { type: 'restoreMatch'; match: Match; index: number }
  | { type: 'importAll'; players: Player[]; matches: Match[]; settings: Settings }
  /** Mode partagé: the server's data replaces the local cache; settings stay as they are. */
  | { type: 'replaceData'; players: Player[]; matches: Match[]; calls?: Call[]; callPlayers?: CallPlayer[] }
  | { type: 'clearAll' }
  | { type: 'setSetting'; patch: Partial<Settings> }
  /** Appels à jouer: optimistic local versions of the server writes (src/calls/). */
  | { type: 'addCall'; call: Call; organizer: CallPlayer }
  | { type: 'joinCall'; callPlayer: CallPlayer }
  | { type: 'closeCall'; id: string; closedAt: string }

export const DEFAULT_SETTINGS: Settings = { lastFormat: '2v2', lastTarget: 5 }

export const initialStore: Store = {
  version: 1,
  players: [],
  matches: [],
  settings: DEFAULT_SETTINGS,
  nextSeq: 1,
  calls: [],
  callPlayers: [],
}

export function playerHasMatches(matches: Match[], id: PlayerId): boolean {
  return matches.some((match) => match.teamA.includes(id) || match.teamB.includes(id))
}

function hasSeq(match: Match): boolean {
  return Number.isInteger(match.seq)
}

export function nextSeqOf(matches: Match[]): number {
  let max = 0
  for (const match of matches) {
    if (hasSeq(match) && match.seq > max) max = match.seq
  }
  return max + 1
}

/**
 * Gives a seq to matches that lack one (older exports / stored data written before seq existed),
 * after the highest existing seq, in array order (the array is chronological insertion order).
 */
export function backfillSeq(matches: Match[]): Match[] {
  if (matches.every(hasSeq)) return matches
  let next = nextSeqOf(matches)
  return matches.map((match) => {
    if (hasSeq(match)) return match
    const withSeq: Match = { ...match, seq: next }
    next += 1
    return withSeq
  })
}

/** A comeback only stands on a 5-4 in 5: stray flags are dropped to false. The same array when nothing changes. */
function withValidComebacks(matches: Match[]): Match[] {
  if (matches.every((match) => withValidComeback(match) === match)) return matches
  return matches.map(withValidComeback)
}

function renamePlayer(state: Store, id: PlayerId, name: string, isGuest: boolean): Store {
  const players = state.players.map((player) => {
    if (player.id !== id) return player
    return { ...player, name, isGuest }
  })
  return { ...state, players }
}

function deletePlayer(state: Store, id: PlayerId): Store {
  if (playerHasMatches(state.matches, id)) {
    throw new Error(`Cannot delete player ${id}: the player has recorded matches`)
  }
  return { ...state, players: state.players.filter((player) => player.id !== id) }
}

function addMatch(state: Store, match: Omit<Match, 'seq'>): Store {
  const created: Match = withValidComeback({ ...match, seq: state.nextSeq })
  return { ...state, matches: [...state.matches, created], nextSeq: state.nextSeq + 1 }
}

function updateMatch(state: Store, incoming: Match): Store {
  const index = state.matches.findIndex((match) => match.id === incoming.id)
  if (index === -1) return state
  const previous = state.matches[index]
  const updated: Match = {
    ...withValidComeback(incoming),
    id: previous.id,
    seq: previous.seq,
    createdAt: previous.createdAt,
    playedAt: previous.playedAt,
  }
  // The author never changes; the edit flow rebuilds the match from its draft and does not carry it.
  if (previous.createdBy !== undefined) updated.createdBy = previous.createdBy
  const matches = state.matches.slice()
  matches[index] = updated
  return { ...state, matches }
}

function restoreMatch(state: Store, match: Match, index: number): Store {
  if (state.matches.some((existing) => existing.id === match.id)) return state
  const position = Math.max(0, Math.min(index, state.matches.length))
  const matches = state.matches.slice()
  matches.splice(position, 0, withValidComeback(match))
  return { ...state, matches, nextSeq: Math.max(state.nextSeq, match.seq + 1) }
}

/** What belongs to this phone, not to a file: an import must not log the device out nor forget its profile. */
function phoneSettings(settings: Settings): Partial<Settings> {
  const kept: Partial<Settings> = {}
  if (settings.officeCode !== undefined) kept.officeCode = settings.officeCode
  if (settings.myPlayerId !== undefined) kept.myPlayerId = settings.myPlayerId
  if (settings.profileConfirmed !== undefined) kept.profileConfirmed = settings.profileConfirmed
  if (settings.visitor !== undefined) kept.visitor = settings.visitor
  if (settings.pushEnabled !== undefined) kept.pushEnabled = settings.pushEnabled
  return kept
}

function mergeImportedSettings(current: Settings, imported: Settings): Settings {
  const {
    officeCode: _code,
    myPlayerId: _me,
    profileConfirmed: _confirmed,
    visitor: _visitor,
    pushEnabled: _push,
    ...fromFile
  } = imported
  return { ...DEFAULT_SETTINGS, ...fromFile, ...phoneSettings(current) }
}

function importAll(state: Store, players: Player[], incoming: Match[], settings: Settings): Store {
  const matches = withValidComebacks(backfillSeq(incoming))
  return {
    ...state,
    version: 1,
    players: players.slice(),
    matches,
    settings: mergeImportedSettings(state.settings, settings),
    nextSeq: nextSeqOf(matches),
  }
}

function replaceData(state: Store, players: Player[], incoming: Match[], calls: Call[], callPlayers: CallPlayer[]): Store {
  const matches = withValidComebacks(backfillSeq(incoming))
  return { ...state, players: players.slice(), matches, nextSeq: nextSeqOf(matches), calls: calls.slice(), callPlayers: callPlayers.slice() }
}

function addCall(state: Store, call: Call, organizer: CallPlayer): Store {
  if (state.calls.some((existing) => existing.id === call.id)) return state
  return { ...state, calls: [...state.calls, call], callPlayers: [...state.callPlayers, organizer] }
}

function joinCall(state: Store, callPlayer: CallPlayer): Store {
  const already = state.callPlayers.some((cp) => cp.callId === callPlayer.callId && cp.playerId === callPlayer.playerId)
  if (already) return state
  return { ...state, callPlayers: [...state.callPlayers, callPlayer] }
}

function closeCall(state: Store, id: string, closedAt: string): Store {
  const calls = state.calls.map((call) => {
    if (call.id !== id || call.closedAt !== undefined) return call
    return { ...call, closedAt }
  })
  return { ...state, calls }
}

export function reducer(state: Store, action: Action): Store {
  switch (action.type) {
    case 'addPlayer':
      return { ...state, players: [...state.players, action.player] }
    case 'renamePlayer':
      return renamePlayer(state, action.id, action.name, action.isGuest)
    case 'deletePlayer':
      return deletePlayer(state, action.id)
    case 'addMatch':
      return addMatch(state, action.match)
    case 'updateMatch':
      return updateMatch(state, action.match)
    case 'deleteMatch':
      return { ...state, matches: state.matches.filter((match) => match.id !== action.id) }
    case 'restoreMatch':
      return restoreMatch(state, action.match, action.index)
    case 'importAll':
      return importAll(state, action.players, action.matches, action.settings)
    case 'replaceData':
      return replaceData(state, action.players, action.matches, action.calls ?? [], action.callPlayers ?? [])
    case 'clearAll':
      // A fresh object: the persistence effect skips a store identical to the one it loaded, and loadStore
      // returns the shared initialStore when nothing was stored yet.
      return { ...initialStore }
    case 'setSetting':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'addCall':
      return addCall(state, action.call, action.organizer)
    case 'joinCall':
      return joinCall(state, action.callPlayer)
    case 'closeCall':
      return closeCall(state, action.id, action.closedAt)
  }
}
