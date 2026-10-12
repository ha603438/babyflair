import type { Match, MatchId, Player, PlayerId, Settings, Store } from '../types'

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
  | { type: 'replaceData'; players: Player[]; matches: Match[] }
  | { type: 'clearAll' }
  | { type: 'setSetting'; patch: Partial<Settings> }

export const DEFAULT_SETTINGS: Settings = { lastFormat: '2v2', lastTarget: 5 }

export const initialStore: Store = {
  version: 1,
  players: [],
  matches: [],
  settings: DEFAULT_SETTINGS,
  nextSeq: 1,
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
  const created: Match = { ...match, seq: state.nextSeq }
  return { ...state, matches: [...state.matches, created], nextSeq: state.nextSeq + 1 }
}

function updateMatch(state: Store, incoming: Match): Store {
  const index = state.matches.findIndex((match) => match.id === incoming.id)
  if (index === -1) return state
  const previous = state.matches[index]
  const updated: Match = {
    ...incoming,
    id: previous.id,
    seq: previous.seq,
    createdAt: previous.createdAt,
    playedAt: previous.playedAt,
  }
  const matches = state.matches.slice()
  matches[index] = updated
  return { ...state, matches }
}

function restoreMatch(state: Store, match: Match, index: number): Store {
  if (state.matches.some((existing) => existing.id === match.id)) return state
  const position = Math.max(0, Math.min(index, state.matches.length))
  const matches = state.matches.slice()
  matches.splice(position, 0, match)
  return { ...state, matches, nextSeq: Math.max(state.nextSeq, match.seq + 1) }
}

/** The office code belongs to this phone, not to the file: an import must not log the device out. */
function mergeImportedSettings(current: Settings, imported: Settings): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...imported }
  if (current.officeCode !== undefined) settings.officeCode = current.officeCode
  return settings
}

function importAll(state: Store, players: Player[], incoming: Match[], settings: Settings): Store {
  const matches = backfillSeq(incoming)
  return {
    ...state,
    version: 1,
    players: players.slice(),
    matches,
    settings: mergeImportedSettings(state.settings, settings),
    nextSeq: nextSeqOf(matches),
  }
}

function replaceData(state: Store, players: Player[], incoming: Match[]): Store {
  const matches = backfillSeq(incoming)
  return { ...state, players: players.slice(), matches, nextSeq: nextSeqOf(matches) }
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
      return replaceData(state, action.players, action.matches)
    case 'clearAll':
      // A fresh object: the persistence effect skips a store identical to the one it loaded, and loadStore
      // returns the shared initialStore when nothing was stored yet.
      return { ...initialStore }
    case 'setSetting':
      return { ...state, settings: { ...state.settings, ...action.patch } }
  }
}
