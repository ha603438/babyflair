// 2V2 and 1V1 rankings (the Classement tabs next to « Mixte »): the same engine maths as the main ranking (team-mean
// Elo, margin, fanny / comeback bonus, rookie multiplier), replayed over one format only, with a lower section
// threshold: ranked after 3 matches instead of 10. The rookie multiplier does not depend on that threshold (it reads
// rookieK0 / rookieSpan), so it keeps its default values. engine.ts is untouched: this module only adapts the input.
//
// 2V2: every unordered pair of teammates is one entity (a duo), mapped to a synthetic engine player whose id is the
// two player ids sorted and joined with '+'; each 2v2 match reaches the engine as a 1v1 duo vs duo, so there is no
// teammate split.
import { duoLabel, duoMembers, teamDuoId } from '../duo'
import type { DuoId, DuoMembers } from '../duo'
import type { Format, Match, MatchResult, Player, PlayerId, Ranking, ReplayResult, Team } from '../types'
import type { Config } from './engine'
import { DEFAULT_CONFIG } from './engine'
import { rank, replay } from './index'

export const MODE_RANKED_AFTER = 3
export const MODE_CONFIG: Config = { ...DEFAULT_CONFIG, rankedAfter: MODE_RANKED_AFTER }

export type ModeReplay = {
  format: Format
  /** Keyed by entity: a player id (1V1) or a duo id (2V2). byMatch keeps the real match ids. */
  result: ReplayResult
  ranking: Ranking
  /** The rated entities: the players with a 1v1 match, or one synthetic player per duo named « A & B ». */
  entities: Map<string, Player>
  /** 2V2: the members of each duo (empty in 1V1). */
  duos: Map<DuoId, DuoMembers>
  /** The matches of this format, in store order. */
  matches: Match[]
}

export function isFormat(match: Match, format: Format): boolean {
  if (format === '1v1') return match.teamA.length === 1
  return match.teamA.length === 2
}

export function matchesOfFormat(matches: Match[], format: Format): Match[] {
  return matches.filter((match) => isFormat(match, format))
}

function participants(matches: Match[]): Set<PlayerId> {
  const ids = new Set<PlayerId>()
  for (const match of matches) {
    for (const id of [...match.teamA, ...match.teamB]) ids.add(id)
  }
  return ids
}

function rated(format: Format, roster: Player[], engineMatches: Match[], own: Match[], now: Date): ModeReplay {
  const result = replay(roster, engineMatches, { now, config: MODE_CONFIG })
  return {
    format,
    result,
    ranking: rank(result, roster),
    entities: new Map(roster.map((entity) => [entity.id, entity])),
    duos: new Map(),
    matches: own,
  }
}

/** 1V1: the players who played at least one 1v1 match, over the 1v1 matches only. */
function replayOneVsOne(players: Player[], matches: Match[], now: Date): ModeReplay {
  const own = matchesOfFormat(matches, '1v1')
  const ids = participants(own)
  const roster = players.filter((player) => ids.has(player.id))
  return rated('1v1', roster, own, own, now)
}

/** A duo's first match together stands for its creation date (only read for a never-played entity). */
function earliest(known: string | undefined, playedAt: string): string {
  if (known === undefined) return playedAt
  if (Date.parse(playedAt) < Date.parse(known)) return playedAt
  return known
}

function collectDuos(matches: Match[]): Map<DuoId, string> {
  const firstPlayed = new Map<DuoId, string>()
  for (const match of matches) {
    for (const team of [match.teamA, match.teamB]) {
      const id = teamDuoId(team)
      if (id === null) continue
      firstPlayed.set(id, earliest(firstPlayed.get(id), match.playedAt))
    }
  }
  return firstPlayed
}

function duoPlayer(id: DuoId, members: DuoMembers, createdAt: string, names: Map<PlayerId, Player>): Player {
  return { id, name: duoLabel(members, names), isGuest: false, createdAt }
}

/** The same match with each team replaced by its duo (a 1v1 for the engine). */
function asDuoMatch(match: Match): Match | null {
  const a = teamDuoId(match.teamA)
  const b = teamDuoId(match.teamB)
  if (a === null || b === null) return null
  return { ...match, teamA: [a], teamB: [b] }
}

/** 2V2: every duo that played a 2v2 match together, rated as one entity over the 2v2 matches only. */
function replayDuos(players: Player[], matches: Match[], now: Date): ModeReplay {
  const own = matchesOfFormat(matches, '2v2')
  const names = new Map(players.map((player) => [player.id, player]))
  const duos = new Map<DuoId, DuoMembers>()
  const roster: Player[] = []
  for (const [id, createdAt] of collectDuos(own)) {
    const members = duoMembers(id)
    if (members === null) continue
    duos.set(id, members)
    roster.push(duoPlayer(id, members, createdAt, names))
  }
  const duoMatches = own.map(asDuoMatch).filter((match): match is Match => match !== null)
  return { ...rated('2v2', roster, duoMatches, own, now), duos }
}

/** The 2V2 or 1V1 ranking, from the store's players and matches (pure: the screens memoise it). */
export function replayMode(format: Format, players: Player[], matches: Match[], now: Date): ModeReplay {
  if (format === '1v1') return replayOneVsOne(players, matches, now)
  return replayDuos(players, matches, now)
}

function teamIds(team: Team, match: Match): PlayerId[] {
  if (team === 'A') return match.teamA
  return match.teamB
}

/**
 * A 2V2 match result with each duo's line copied onto its two members, so a HistoryRow (which looks deltas up by
 * player id) shows the duo deltas next to every name.
 */
export function expandDuoResult(result: MatchResult | undefined, match: Match): MatchResult | undefined {
  if (result === undefined) return undefined
  const perPlayer = result.perPlayer.flatMap((entry) =>
    teamIds(entry.team, match).map((playerId) => ({ ...entry, playerId })),
  )
  return { ...result, perPlayer }
}
