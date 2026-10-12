import type {
  ExportFile,
  Format,
  Match,
  MatchId,
  Player,
  PlayerId,
  PlayerStats,
  Ranking,
  Settings,
  Store,
  Target,
} from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * DAY_MS
const INACTIVE_AFTER_MS = 30 * DAY_MS
const MIN_SHARED_FOR_PARTNER = 2
const DEFAULT_SETTINGS: Settings = { lastFormat: '2v2', lastTarget: 5 }

type Outcome = 'win' | 'loss'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { sensitivity: 'base' })
}

function parseTime(iso: string): number | null {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  return time
}

function teamOf(playerId: PlayerId, match: Match): PlayerId[] | null {
  if (match.teamA.includes(playerId)) return match.teamA
  if (match.teamB.includes(playerId)) return match.teamB
  return null
}

function winnersOf(match: Match): PlayerId[] {
  if (match.scoreA === match.target) return match.teamA
  return match.teamB
}

function outcomeFor(playerId: PlayerId, match: Match): Outcome | null {
  if (teamOf(playerId, match) === null) return null
  if (winnersOf(match).includes(playerId)) return 'win'
  return 'loss'
}

// ---------------------------------------------------------------------------
// Ranking-row and player-page derivations
// ---------------------------------------------------------------------------

export function sevenDayDelta(stats: PlayerStats, now: Date): number | null {
  const since = now.getTime() - SEVEN_DAYS_MS
  let total = 0
  let count = 0
  for (const point of stats.history) {
    const time = parseTime(point.playedAt)
    if (time === null || time < since) continue
    total += point.delta
    count += 1
  }
  if (count === 0) return null
  return total
}

export function currentStreak(
  stats: PlayerStats,
  matches: Map<MatchId, Match>,
): { kind: 'win' | 'loss'; length: number } | null {
  let kind: Outcome | null = null
  let length = 0
  for (let i = stats.history.length - 1; i >= 0; i -= 1) {
    const match = matches.get(stats.history[i].matchId)
    // A history point without its match is a data inconsistency: stop rather than guess.
    if (match === undefined) break
    const outcome = outcomeFor(stats.playerId, match)
    if (outcome === null) break
    if (kind === null) kind = outcome
    if (outcome !== kind) break
    length += 1
  }
  if (kind === null || length < 2) return null
  return { kind, length }
}

type PartnerTally = { partnerId: PlayerId; shared: number; wins: number }

function partnerIn(playerId: PlayerId, match: Match): PlayerId | null {
  const team = teamOf(playerId, match)
  if (team === null || team.length !== 2) return null
  const partner = team.find((id) => id !== playerId)
  if (partner === undefined) return null
  return partner
}

export function favouritePartner(
  playerId: PlayerId,
  matches: Match[],
  players: Map<PlayerId, Player>,
): { partnerId: PlayerId; shared: number; winRate: number } | null {
  const tallies = new Map<PlayerId, PartnerTally>()
  for (const match of matches) {
    const partnerId = partnerIn(playerId, match)
    if (partnerId === null) continue
    const tally = tallies.get(partnerId) ?? { partnerId, shared: 0, wins: 0 }
    tally.shared += 1
    if (outcomeFor(playerId, match) === 'win') tally.wins += 1
    tallies.set(partnerId, tally)
  }
  const candidates = [...tallies.values()].filter((t) => t.shared >= MIN_SHARED_FOR_PARTNER)
  if (candidates.length === 0) return null
  const nameOf = (id: PlayerId): string => players.get(id)?.name ?? ''
  candidates.sort(
    (a, b) =>
      b.shared - a.shared ||
      // Cross-multiplied win rates: exact integer comparison, no float noise.
      b.wins * a.shared - a.wins * b.shared ||
      compareNames(nameOf(a.partnerId), nameOf(b.partnerId)),
  )
  const best = candidates[0]
  return { partnerId: best.partnerId, shared: best.shared, winRate: best.wins / best.shared }
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

export function chipOrder(players: Player[], byPlayer: Map<PlayerId, PlayerStats>): Player[] {
  const played: Array<{ player: Player; at: number }> = []
  const neverPlayed: Player[] = []
  for (const player of players) {
    const last = byPlayer.get(player.id)?.lastPlayedAt
    const at = last === undefined ? null : parseTime(last)
    if (at === null) {
      neverPlayed.push(player)
      continue
    }
    played.push({ player, at })
  }
  played.sort((a, b) => b.at - a.at || compareNames(a.player.name, b.player.name))
  neverPlayed.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || compareNames(a.name, b.name))
  return [...played.map((entry) => entry.player), ...neverPlayed]
}

export function sortByName(players: Player[]): Player[] {
  return [...players].sort((a, b) => compareNames(a.name, b.name))
}

export function isInactive(stats: PlayerStats | undefined, now: Date): boolean {
  if (stats === undefined || stats.played < 1 || stats.lastPlayedAt === undefined) return false
  const last = parseTime(stats.lastPlayedAt)
  if (last === null) return false
  return now.getTime() - last >= INACTIVE_AFTER_MS
}

export function rankIndexOf(ranking: Ranking, id: PlayerId): number | null {
  const index = ranking.ranked.indexOf(id)
  if (index === -1) return null
  return index + 1
}

export function teamLabel(ids: PlayerId[], players: Map<PlayerId, Player>): string {
  return ids.map((id) => players.get(id)?.name ?? '?').join(' & ')
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export function buildExport(store: Store, now: Date): ExportFile {
  return {
    app: 'babyflair',
    version: 1,
    exportedAt: now.toISOString(),
    players: store.players.map((player) => ({ ...player })),
    matches: store.matches.map((match) => ({ ...match, teamA: [...match.teamA], teamB: [...match.teamB] })),
    settings: { ...store.settings },
  }
}

type ImportOk = { ok: true; players: Player[]; matches: Match[]; settings: Settings }
type ImportKo = { ok: false; reason: string }
export type ImportResult = ImportOk | ImportKo

type ParsedMatch = Omit<Match, 'seq'> & { seq?: number }

function ko(reason: string): ImportKo {
  return { ok: false, reason }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parseTime(value) !== null
}

function isTarget(value: unknown): value is Target {
  return value === 5 || value === 10
}

export function validateImport(json: unknown): ImportResult {
  if (!isRecord(json)) return ko('Le fichier ne contient pas un objet JSON.')
  if (json.app !== 'babyflair') return ko("Ce n'est pas un export BabyFlair (champ « app » absent ou différent).")
  if (json.version !== 1) return ko(`Version d'export non prise en charge : ${String(json.version)}.`)
  const players = readPlayers(json.players)
  if (!players.ok) return players
  const matches = readMatches(json.matches, players.ids)
  if (!matches.ok) return matches
  return { ok: true, players: players.players, matches: matches.matches, settings: readSettings(json.settings) }
}

type PlayersResult = { ok: true; players: Player[]; ids: Set<PlayerId> } | ImportKo

function readPlayers(raw: unknown): PlayersResult {
  if (!Array.isArray(raw)) return ko("Le champ « players » n'est pas une liste.")
  const items: unknown[] = raw
  const players: Player[] = []
  const ids = new Set<PlayerId>()
  for (const [index, item] of items.entries()) {
    const result = readPlayer(item, index + 1)
    if (!result.ok) return result
    if (ids.has(result.player.id)) return ko(`Identifiant de joueur en double : ${result.player.id}.`)
    ids.add(result.player.id)
    players.push(result.player)
  }
  return { ok: true, players, ids }
}

function readPlayer(raw: unknown, position: number): { ok: true; player: Player } | ImportKo {
  const label = `Joueur n°${position}`
  if (!isRecord(raw)) return ko(`${label} : entrée invalide.`)
  if (!isId(raw.id)) return ko(`${label} : identifiant manquant.`)
  if (typeof raw.name !== 'string' || raw.name.trim() === '') return ko(`${label} : nom manquant.`)
  if (raw.isGuest !== undefined && typeof raw.isGuest !== 'boolean') return ko(`${label} : champ « isGuest » invalide.`)
  if (!isIsoDate(raw.createdAt)) return ko(`${label} : date de création invalide.`)
  return {
    ok: true,
    player: { id: raw.id, name: raw.name.trim(), isGuest: raw.isGuest === true, createdAt: raw.createdAt },
  }
}

type MatchesResult = { ok: true; matches: Match[] } | ImportKo

function readMatches(raw: unknown, playerIds: Set<PlayerId>): MatchesResult {
  if (!Array.isArray(raw)) return ko("Le champ « matches » n'est pas une liste.")
  const items: unknown[] = raw
  const matches: ParsedMatch[] = []
  const ids = new Set<MatchId>()
  for (const [index, item] of items.entries()) {
    const result = readMatch(item, index + 1, playerIds)
    if (!result.ok) return result
    if (ids.has(result.match.id)) return ko(`Identifiant de match en double : ${result.match.id}.`)
    ids.add(result.match.id)
    matches.push(result.match)
  }
  return { ok: true, matches: withSequence(matches) }
}

// `seq` was added after the first persisted shape: when it is missing or not unique, the array order
// (chronological insertion order) is the creation order, so we renumber from it.
function withSequence(matches: ParsedMatch[]): Match[] {
  const seqs = matches.map((match) => match.seq)
  const usable = seqs.every((seq) => seq !== undefined) && new Set(seqs).size === seqs.length
  return matches.map((match, index) => {
    if (usable && match.seq !== undefined) return { ...match, seq: match.seq }
    return { ...match, seq: index + 1 }
  })
}

function readSeq(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isInteger(raw)) return raw
  return undefined
}

function readTeam(raw: unknown): PlayerId[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 2) return null
  const items: unknown[] = raw
  if (!items.every(isId)) return null
  return items.filter(isId)
}

function teamsReason(label: string, teamA: PlayerId[], teamB: PlayerId[], playerIds: Set<PlayerId>): string | null {
  if (teamA.length !== teamB.length) return `${label} : les équipes n'ont pas la même taille.`
  const all = [...teamA, ...teamB]
  if (new Set(all).size !== all.length) return `${label} : un joueur apparaît deux fois.`
  const unknown = all.find((id) => !playerIds.has(id))
  if (unknown !== undefined) return `${label} : joueur inconnu (${unknown}).`
  return null
}

type Scores = { scoreA: number; scoreB: number }

// Exactly one side reaches the target; the other side is in [0, target - 1].
function readScores(rawA: unknown, rawB: unknown, target: Target): Scores | null {
  if (typeof rawA !== 'number' || typeof rawB !== 'number') return null
  if (!Number.isInteger(rawA) || !Number.isInteger(rawB)) return null
  const aWins = rawA === target
  const bWins = rawB === target
  if (aWins === bWins) return null
  const loser = aWins ? rawB : rawA
  if (loser < 0 || loser >= target) return null
  return { scoreA: rawA, scoreB: rawB }
}

function readMatch(raw: unknown, position: number, playerIds: Set<PlayerId>): { ok: true; match: ParsedMatch } | ImportKo {
  const label = `Match n°${position}`
  if (!isRecord(raw)) return ko(`${label} : entrée invalide.`)
  if (!isId(raw.id)) return ko(`${label} : identifiant manquant.`)
  if (!isTarget(raw.target)) return ko(`${label} : cible invalide (${String(raw.target)}).`)
  if (!isIsoDate(raw.playedAt)) return ko(`${label} : date « playedAt » invalide.`)
  if (!isIsoDate(raw.createdAt)) return ko(`${label} : date « createdAt » invalide.`)
  if (!isIsoDate(raw.updatedAt)) return ko(`${label} : date « updatedAt » invalide.`)
  const teamA = readTeam(raw.teamA)
  if (teamA === null) return ko(`${label} : équipe 1 invalide.`)
  const teamB = readTeam(raw.teamB)
  if (teamB === null) return ko(`${label} : équipe 2 invalide.`)
  const teamsProblem = teamsReason(label, teamA, teamB, playerIds)
  if (teamsProblem !== null) return ko(teamsProblem)
  const scores = readScores(raw.scoreA, raw.scoreB, raw.target)
  if (scores === null) {
    return ko(`${label} : score incohérent (${String(raw.scoreA)} – ${String(raw.scoreB)} en ${raw.target}).`)
  }
  return {
    ok: true,
    match: {
      id: raw.id,
      seq: readSeq(raw.seq),
      playedAt: raw.playedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      target: raw.target,
      teamA,
      teamB,
      scoreA: scores.scoreA,
      scoreB: scores.scoreB,
    },
  }
}

function readFormat(raw: unknown): Format {
  if (raw === '1v1' || raw === '2v2') return raw
  return DEFAULT_SETTINGS.lastFormat
}

function readTargetSetting(raw: unknown): Target {
  if (isTarget(raw)) return raw
  return DEFAULT_SETTINGS.lastTarget
}

// Settings are low-stakes preferences: anything unreadable falls back to the defaults instead of failing.
function readSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS }
  const settings: Settings = { lastFormat: readFormat(raw.lastFormat), lastTarget: readTargetSetting(raw.lastTarget) }
  if (isIsoDate(raw.installHintDismissedAt)) settings.installHintDismissedAt = raw.installHintDismissedAt
  if (isIsoDate(raw.exportHintDismissedAt)) settings.exportHintDismissedAt = raw.exportHintDismissedAt
  if (isIsoDate(raw.lastExportAt)) settings.lastExportAt = raw.lastExportAt
  return settings
}

// ---------------------------------------------------------------------------
// Export nudge (shared by the Classement hint and the Réglages caption)
// ---------------------------------------------------------------------------

/** Matches created strictly after `lastExportAt`; every match when never exported (or the date is unreadable). */
export function matchesSinceExport(matches: Match[], lastExportAt: string | undefined): number {
  if (lastExportAt === undefined) return matches.length
  const since = parseTime(lastExportAt)
  if (since === null) return matches.length
  let count = 0
  for (const match of matches) {
    const created = parseTime(match.createdAt)
    if (created !== null && created > since) count += 1
  }
  return count
}

// ---------------------------------------------------------------------------
// Positions (2v2 only): in each team array, index 0 is the arrière (défense), index 1 the avant (attaque)
// ---------------------------------------------------------------------------

export type Position = 'arriere' | 'avant'
export type WinLoss = { wins: number; losses: number }
export const POSITION_LABEL: { [key in Position]: string } = { arriere: 'Arrière', avant: 'Avant' }

/** The player's position in a 2v2 match, null in a 1v1 or when the player did not play it. */
export function positionOf(playerId: PlayerId, match: Match): Position | null {
  const team = teamOf(playerId, match)
  if (team === null || team.length !== 2) return null
  if (team[0] === playerId) return 'arriere'
  return 'avant'
}

/** Wins and losses per position over the player's 2v2 matches. */
export function positionRecord(playerId: PlayerId, matches: Match[]): { [key in Position]: WinLoss } {
  const record = { arriere: { wins: 0, losses: 0 }, avant: { wins: 0, losses: 0 } }
  for (const match of matches) {
    const position = positionOf(playerId, match)
    if (position === null) continue
    if (outcomeFor(playerId, match) === 'win') record[position].wins += 1
    else record[position].losses += 1
  }
  return record
}

/** How often each side of the table won: team A plays Blancs, team B plays Noirs. */
export function sideRecord(matches: Match[]): { blancs: number; noirs: number } {
  let blancs = 0
  let noirs = 0
  for (const match of matches) {
    if (match.scoreA === match.target) blancs += 1
    else noirs += 1
  }
  return { blancs, noirs }
}
