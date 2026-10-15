// Journal des modifications and match authorship lines: pure French formatting over match_events and the players,
// so it is tested in node. The screen is src/screens/Journal.tsx.
import { fmtDayHeader, fmtScore, fmtTime } from '../format'
import { teamLabel } from '../stats'
import type { Match, MatchEvent, MatchEventAction, MatchId, MatchSnapshot, Player, PlayerId } from '../types'

export const JOURNAL_LIMIT = 200

export const JOURNAL_COPY = {
  title: "Journal d'activité",
  row: "Journal d'activité",
  empty: "Aucune activité enregistrée pour l'instant.",
  emptyChanges: "Aucune modification ni suppression pour l'instant.",
  filterChanges: 'Modifs et suppressions',
  filterAll: 'Tout',
  someone: "Quelqu'un",
  loading: 'Chargement…',
} as const

const VERBS: Record<MatchEventAction, string> = {
  created: 'a saisi',
  updated: 'a modifié',
  deleted: 'a supprimé',
  restored: 'a rétabli',
}

export type JournalRow = {
  id: number
  at: string
  time: string
  /** « Arnault a modifié ». */
  title: string
  /** « Alice & Bob 5 – 3 Chloé & Dan », null when the server sent no readable image of the match. */
  summary: string | null
  /** Updates only, when the score moved: « 5 – 3 → 5 – 4 ». */
  change: string | null
  matchId: MatchId
  /** The match still exists here: the row opens its detail. */
  linkable: boolean
}

export type JournalDay = { key: string; label: string; rows: JournalRow[] }

function nameOf(id: PlayerId | null | undefined, players: Map<PlayerId, Player>): string | undefined {
  if (id === null || id === undefined) return undefined
  return players.get(id)?.name
}

/** No actor (no profile on the phone, or a deleted player) reads « Quelqu'un ». */
export function actorName(actorId: PlayerId | null, players: Map<PlayerId, Player>): string {
  return nameOf(actorId, players) ?? JOURNAL_COPY.someone
}

export function eventTitle(event: MatchEvent, players: Map<PlayerId, Player>): string {
  return `${actorName(event.actorId, players)} ${VERBS[event.action]}`
}

/** Blancs first, as entered: « Alice & Bob 5 – 3 Chloé & Dan » (unknown or deleted players read « ? »). */
export function snapshotLine(snapshot: MatchSnapshot, players: Map<PlayerId, Player>): string {
  const teamA = teamLabel(snapshot.teamA, players)
  const teamB = teamLabel(snapshot.teamB, players)
  return `${teamA} ${fmtScore(snapshot.scoreA, snapshot.scoreB)} ${teamB}`
}

/** The match as it is after the event, or as it was for a delete. */
export function eventSnapshot(event: MatchEvent): MatchSnapshot | null {
  if (event.action === 'deleted') return event.before ?? event.after
  return event.after ?? event.before
}

function comebackChange(before: MatchSnapshot, after: MatchSnapshot): string | null {
  const was = before.comeback === true
  const is = after.comeback === true
  if (was === is) return null
  if (is) return 'comeback coché'
  return 'comeback décoché'
}

/** Updates only: « 5 – 3 → 5 – 4 », « comeback coché », or both joined by « · ». */
export function scoreChange(event: MatchEvent): string | null {
  if (event.action !== 'updated' || event.before === null || event.after === null) return null
  const { before, after } = event
  const parts: string[] = []
  if (before.scoreA !== after.scoreA || before.scoreB !== after.scoreB) {
    parts.push(`${fmtScore(before.scoreA, before.scoreB)} → ${fmtScore(after.scoreA, after.scoreB)}`)
  }
  const comeback = comebackChange(before, after)
  if (comeback !== null) parts.push(comeback)
  if (parts.length === 0) return null
  return parts.join(' · ')
}

/** Empty without the time of day (profile/times.ts): the row then has no leading time. */
function timeOf(iso: string, withTime: boolean): string {
  if (!withTime) return ''
  return fmtTime(iso)
}

export function journalRow(
  event: MatchEvent,
  players: Map<PlayerId, Player>,
  existing: ReadonlySet<MatchId>,
  withTime: boolean,
): JournalRow {
  const snapshot = eventSnapshot(event)
  return {
    id: event.id,
    at: event.at,
    time: timeOf(event.at, withTime),
    title: eventTitle(event, players),
    summary: snapshot === null ? null : snapshotLine(snapshot, players),
    change: scoreChange(event),
    matchId: event.matchId,
    linkable: existing.has(event.matchId),
  }
}

function localDayKey(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** Newest first (as the server sends them), consecutive events of one local calendar day under one header. */
export function journalDays(
  events: MatchEvent[],
  players: Map<PlayerId, Player>,
  existing: ReadonlySet<MatchId>,
  now: Date,
  withTime: boolean,
): JournalDay[] {
  const days: JournalDay[] = []
  for (const event of events) {
    const key = localDayKey(event.at)
    const row = journalRow(event, players, existing, withTime)
    const last = days[days.length - 1]
    if (last !== undefined && last.key === key) {
      last.rows.push(row)
      continue
    }
    days.push({ key, label: fmtDayHeader(event.at, now), rows: [row] })
  }
  return days
}

function isEditedBy(match: Match): boolean {
  if (match.updatedBy === undefined) return false
  return Date.parse(match.updatedAt) > Date.parse(match.createdAt)
}

/** Under the date of a match: « Saisi par Arnault · modifié par Julien », or null when nobody is known. */
export function authorshipLine(match: Match, players: Map<PlayerId, Player>): string | null {
  const author = nameOf(match.createdBy, players)
  const editor = isEditedBy(match) ? nameOf(match.updatedBy, players) : undefined
  if (author !== undefined && editor !== undefined) return `Saisi par ${author} · modifié par ${editor}`
  if (author !== undefined) return `Saisi par ${author}`
  if (editor !== undefined) return `Modifié par ${editor}`
  return null
}

export type JournalFilter = 'changes' | 'all'

/** « Modifs et suppressions » keeps updates, deletions and restorations; « Tout » also shows the new matches. */
export function filterEvents(events: MatchEvent[], filter: JournalFilter): MatchEvent[] {
  if (filter === 'all') return events
  return events.filter((event) => event.action !== 'created')
}
