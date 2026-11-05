import { duoId } from '../../duo'
import { fmtDayHeader, fmtDelta, fmtInt, fmtOrdinal, fmtPercent, plural } from '../../format'
import type { PlayerDayRecap, RankMove, RatingMove } from '../../playerDay'
import { localDayKey } from '../../recap'
import { hrefOf } from '../../router'
import type { Match, Player, PlayerId } from '../../types'
import { recordText } from './labels'
import { matchText, RECAP_COPY } from './recapLines'
import type { RecapLineView, Tone } from './recapLines'

// « Récap du jour » of the player page: the French copy of src/playerDay.ts, laid out by JoueurView (tiles, then the
// Récap's highlight lines, each a link). Days only, never a time of day.

export type DayTile = { label: string; value: string; tone: Tone }
export type PlayerDayView = { title: string; tiles: DayTile[]; lines: RecapLineView[] }

type Players = ReadonlyMap<PlayerId, Player>
type Copy = { emoji: string; label: string }

export const PLAYER_DAY_COPY = {
  today: 'Récap du jour',
  lastDay: 'Dernière journée',
  partner: { emoji: '🤝', label: 'Meilleur partenaire' },
  nemesis: { emoji: '😈', label: 'Bête noire' },
  holdUp: { emoji: '💰', label: 'Plus beau coup' },
  bets: { emoji: '🎯', label: 'Annonces' },
  fannyGiven: { emoji: '🍑', label: 'Fanny mis' },
  fannyTaken: { emoji: '🍑', label: 'Fanny encaissé' },
  comebackDone: { emoji: '🔁', label: 'Comeback réussi' },
  comebackSuffered: { emoji: '🔁', label: 'Comeback subi' },
  leaderSubject: 'Prend la tête du 2V2 mixte',
  hotSubject: 'Le plus de points de la journée',
  coldSubject: 'Le plus de points perdus de la journée',
} as const

function nameOf(players: Players, id: PlayerId): string {
  return players.get(id)?.name ?? '?'
}

function toneOf(net: number): Tone {
  if (Math.round(net) > 0) return 'pos'
  if (Math.round(net) < 0) return 'neg'
  return null
}

/** « Récap du jour » today, « Dernière journée · Hier » / « · lundi 3 novembre » otherwise. */
export function dayTitle(day: Pick<PlayerDayRecap, 'date'>, now: Date): string {
  if (localDayKey(day.date) === localDayKey(now.toISOString())) return PLAYER_DAY_COPY.today
  return `${PLAYER_DAY_COPY.lastDay} · ${fmtDayHeader(day.date, now)}`
}

function moveText(move: RatingMove): string {
  return `${fmtInt(move.before)} → ${fmtInt(move.after)}`
}

/** « 5e → 3e », « 3e » when it did not move, « 8e (entrée) » the day he got ranked; null while not ranked. */
export function rankText(rank: RankMove): string | null {
  if (rank.after === null) return null
  if (rank.before === null) return `${fmtOrdinal(rank.after)} (entrée)`
  if (rank.before === rank.after) return fmtOrdinal(rank.after)
  return `${fmtOrdinal(rank.before)} → ${fmtOrdinal(rank.after)}`
}

function moveTile(label: string, move: RatingMove | null): DayTile[] {
  if (move === null) return []
  return [{ label, value: moveText(move), tone: null }]
}

function rankTile(rank: RankMove | null): DayTile[] {
  if (rank === null) return []
  const value = rankText(rank)
  if (value === null) return []
  return [{ label: 'Classement', value, tone: null }]
}

/** Points and record always; the 2V2 mixte rating and rank, and the 1V1 rating, for the formats he played that day. */
export function dayTiles(day: PlayerDayRecap): DayTile[] {
  return [
    { label: 'Points', value: fmtDelta(day.net), tone: toneOf(day.net) },
    { label: 'Bilan', value: recordText(day), tone: null },
    ...moveTile('2V2 mixte', day.main),
    ...rankTile(day.rank),
    ...moveTile('1V1', day.oneVsOne),
  ]
}

function line(key: string, copy: Copy, parts: Omit<RecapLineView, 'key' | 'emoji' | 'label'>): RecapLineView {
  return { key, emoji: copy.emoji, label: copy.label, ...parts }
}

function plain(subject: string, href: string): Omit<RecapLineView, 'key' | 'emoji' | 'label'> {
  return { subject, detail: null, value: null, tone: null, href }
}

function matchHref(match: Match): string {
  return hrefOf({ name: 'match-detail', id: match.id })
}

function badgeLines(day: PlayerDayRecap): RecapLineView[] {
  const lines: RecapLineView[] = []
  if (day.newLeader) lines.push(line('leader', RECAP_COPY.leader, plain(PLAYER_DAY_COPY.leaderSubject, '#/')))
  const recapHref = hrefOf({ name: 'stats' })
  if (day.hot) lines.push(line('hot', RECAP_COPY.hot, plain(PLAYER_DAY_COPY.hotSubject, recapHref)))
  if (day.cold) lines.push(line('cold', RECAP_COPY.cold, plain(PLAYER_DAY_COPY.coldSubject, recapHref)))
  return lines
}

function partnerLine(playerId: PlayerId, day: PlayerDayRecap, players: Players): RecapLineView[] {
  const { partner } = day
  if (partner === null) return []
  const href = hrefOf({ name: 'duo', id: duoId(playerId, partner.partnerId) })
  const parts = { subject: nameOf(players, partner.partnerId), detail: recordText(partner) }
  return [line('partner', PLAYER_DAY_COPY.partner, { ...parts, value: fmtDelta(partner.net), tone: toneOf(partner.net), href })]
}

function nemesisLine(day: PlayerDayRecap, players: Players): RecapLineView[] {
  const { nemesis } = day
  if (nemesis === null) return []
  const href = hrefOf({ name: 'joueur', id: nemesis.opponentId })
  const parts = { subject: nameOf(players, nemesis.opponentId), detail: recordText(nemesis), value: null, tone: null }
  return [line('nemesis', PLAYER_DAY_COPY.nemesis, { ...parts, href })]
}

function holdUpLine(day: PlayerDayRecap, players: Players): RecapLineView[] {
  const { holdUp } = day
  if (holdUp === null) return []
  const parts = { subject: matchText(holdUp.match, players), detail: `${fmtPercent(holdUp.chance)} de chances` }
  return [line('hold-up', PLAYER_DAY_COPY.holdUp, { ...parts, value: null, tone: null, href: matchHref(holdUp.match) })]
}

/** « 2 annonces · 1 réussie », the points they brought on the right. */
function betsLine(day: PlayerDayRecap): RecapLineView[] {
  const { bets } = day
  if (bets === null) return []
  const subject = `${plural(bets.made, 'annonce')} · ${plural(bets.won, 'réussie', 'réussies')}`
  const parts = { subject, detail: null, value: fmtDelta(bets.points), tone: toneOf(bets.points) }
  return [line('bets', PLAYER_DAY_COPY.bets, { ...parts, href: matchHref(bets.match) })]
}

function matchLines(kind: keyof typeof MATCH_KINDS, matches: Match[], players: Players): RecapLineView[] {
  return matches.map((match) =>
    line(`${kind}-${match.id}`, PLAYER_DAY_COPY[kind], plain(matchText(match, players), matchHref(match))),
  )
}

const MATCH_KINDS = { fannyGiven: true, fannyTaken: true, comebackDone: true, comebackSuffered: true } as const

/** The highlight lines that apply, in the Récap's spirit: badges first, then people, then matches. */
export function dayLines(playerId: PlayerId, day: PlayerDayRecap, players: Players): RecapLineView[] {
  return [
    ...badgeLines(day),
    ...partnerLine(playerId, day, players),
    ...nemesisLine(day, players),
    ...holdUpLine(day, players),
    ...betsLine(day),
    ...matchLines('fannyGiven', day.fannyGiven, players),
    ...matchLines('fannyTaken', day.fannyTaken, players),
    ...matchLines('comebackDone', day.comebackDone, players),
    ...matchLines('comebackSuffered', day.comebackSuffered, players),
  ]
}

export function playerDayView(playerId: PlayerId, day: PlayerDayRecap, players: Players, now: Date): PlayerDayView {
  return { title: dayTitle(day, now), tiles: dayTiles(day), lines: dayLines(playerId, day, players) }
}
