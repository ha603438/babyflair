import type { Player, PlayerId } from './types'

// Duos (2V2 ranking): every unordered pair of teammates is one entity, identified by the two player ids sorted and
// joined with '+' (player ids are uuids, so they never contain a '+'). Pure helpers, no rating math.

const SEPARATOR = '+'
const DUO_FALLBACK_TITLE = 'Duo'

export type DuoId = string
/** The two members of a duo, sorted by id (the order of the id). */
export type DuoMembers = readonly [PlayerId, PlayerId]

function sortedPair(a: PlayerId, b: PlayerId): DuoMembers {
  if (b < a) return [b, a]
  return [a, b]
}

export function duoId(a: PlayerId, b: PlayerId): DuoId {
  return sortedPair(a, b).join(SEPARATOR)
}

/** The members of a duo id typed in any order, or null unless it is two distinct non-empty ids joined with '+'. */
export function duoMembers(id: string): DuoMembers | null {
  const parts = id.split(SEPARATOR)
  if (parts.length !== 2) return null
  const [a, b] = parts
  if (a === '' || b === '' || a === b) return null
  return sortedPair(a, b)
}

/** The canonical (sorted) form of a duo id, or null when it is not one. */
export function canonicalDuoId(id: string): DuoId | null {
  const members = duoMembers(id)
  if (members === null) return null
  return duoId(members[0], members[1])
}

/** The duo of a two-player team; null for a 1v1 side. */
export function teamDuoId(team: PlayerId[]): DuoId | null {
  if (team.length !== 2) return null
  return duoId(team[0], team[1])
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { sensitivity: 'base' })
}

function nameOf(players: ReadonlyMap<PlayerId, Player>, id: PlayerId): string {
  return players.get(id)?.name ?? '?'
}

/** The members in display order: names sorted alphabetically (fr locale), then by id. */
export function membersByName(members: DuoMembers, players: ReadonlyMap<PlayerId, Player>): DuoMembers {
  const [a, b] = members
  if (compareNames(nameOf(players, b), nameOf(players, a)) < 0) return [b, a]
  return [a, b]
}

/** « Arnault & Edgar »: names sorted alphabetically (fr locale), « ? » for an unknown player. */
export function duoLabel(members: DuoMembers, players: ReadonlyMap<PlayerId, Player>): string {
  return membersByName(members, players)
    .map((id) => nameOf(players, id))
    .join(' & ')
}

/** Header title of the duo page: « A & B », or « Duo » when the id is not a duo. */
export function duoTitle(id: string, players: Player[]): string {
  const members = duoMembers(id)
  if (members === null) return DUO_FALLBACK_TITLE
  return duoLabel(members, new Map(players.map((player) => [player.id, player])))
}
