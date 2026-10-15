// Historique filters: format chips (2V2 / 1V1) and a player selector, combined with AND. Pure helpers only; the
// in-memory state that survives a trip to the match detail lives in useHistoryFilters.ts.
import { fmtInt, plural } from '../../format'
import type { Format, Match, Player, PlayerId } from '../../types'

export type HistoryFilters = {
  /** null = every format. */
  format: Format | null
  /** null = « Tous les joueurs ». */
  playerId: PlayerId | null
}

export type PlayerOption = { id: PlayerId; name: string }

export const NO_FILTERS: HistoryFilters = { format: null, playerId: null }

/** The <select> value of « Tous les joueurs ». */
export const ALL_PLAYERS_VALUE = ''

export const FILTER_COPY = {
  group: 'Filtres',
  playerLabel: 'Filtrer par joueur',
  allPlayers: 'Tous les joueurs',
  clear: 'Effacer',
  clearAll: 'Effacer les filtres',
  empty: 'Aucun match pour ces filtres',
} as const

/** Chip order of the bar: « 2V2 » first, then « 1V1 ». */
export const FORMAT_CHIPS = [
  { format: '2v2', label: '2V2' },
  { format: '1v1', label: '1V1' },
] as const satisfies readonly { format: Format; label: string }[]

/** One player per team is a 1v1, two is a 2v2. */
export function matchFormat(match: Match): Format {
  if (match.teamA.length === 1) return '1v1'
  return '2v2'
}

export function playedIn(match: Match, id: PlayerId): boolean {
  return match.teamA.includes(id) || match.teamB.includes(id)
}

function keeps(match: Match, filters: HistoryFilters): boolean {
  if (filters.format !== null && matchFormat(match) !== filters.format) return false
  if (filters.playerId !== null && !playedIn(match, filters.playerId)) return false
  return true
}

/** Matches passing every active filter, in their input order. */
export function filterMatches(matches: Match[], filters: HistoryFilters): Match[] {
  if (!isFiltered(filters)) return matches
  return matches.filter((match) => keeps(match, filters))
}

function byName(a: PlayerOption, b: PlayerOption): number {
  return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }) || a.id.localeCompare(b.id)
}

/** Every player with at least one match (guests and inactive players included), sorted by name in French order. */
export function playerOptions(players: Player[], matches: Match[]): PlayerOption[] {
  const played = new Set<PlayerId>()
  for (const match of matches) {
    for (const id of [...match.teamA, ...match.teamB]) played.add(id)
  }
  return players
    .filter((player) => played.has(player.id))
    .map((player) => ({ id: player.id, name: player.name }))
    .sort(byName)
}

/** A stored player that is no longer an option (deleted, or without any match left) falls back to every player. */
export function resolveFilters(filters: HistoryFilters, options: PlayerOption[]): HistoryFilters {
  if (filters.playerId === null) return filters
  const id = filters.playerId
  if (options.some((option) => option.id === id)) return filters
  return { ...filters, playerId: null }
}

export function isFiltered(filters: HistoryFilters): boolean {
  return filters.format !== null || filters.playerId !== null
}

/** Single selection: tapping the active chip again clears the format. */
export function toggleFormat(filters: HistoryFilters, format: Format): HistoryFilters {
  if (filters.format === format) return { ...filters, format: null }
  return { ...filters, format }
}

/** The <select> change: « Tous les joueurs » (empty value) clears the player. */
export function withPlayer(filters: HistoryFilters, value: string): HistoryFilters {
  if (value === ALL_PLAYERS_VALUE) return { ...filters, playerId: null }
  return { ...filters, playerId: value }
}

export function playerValue(filters: HistoryFilters): string {
  return filters.playerId ?? ALL_PLAYERS_VALUE
}

/** Footer under the list: the total when nothing is filtered, « n matchs sur N » otherwise. */
export function countLine(shown: number, total: number, filtered: boolean): string {
  const count = plural(shown, 'match')
  if (!filtered) return `${count} au total`
  return `${count} sur ${fmtInt(total)}`
}
