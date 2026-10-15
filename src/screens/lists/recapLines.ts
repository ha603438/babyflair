import { duoId, duoLabel } from '../../duo'
import { fmtDayHeader, fmtDelta, fmtInt, fmtPercent, plural } from '../../format'
import { winnersFirst } from '../../recap'
import type { HoldUp, PlayerDay, RecapDay } from '../../recap'
import { hrefOf } from '../../router'
import type { Match, Player, PlayerId } from '../../types'
import { recordText } from './labels'

// Récap (`#/stats`): the French copy of one day card and of its highlight lines. Pure: the data comes from
// src/recap.ts, RecapView only lays these out. Days only, never a time of day.

/** Colours the value: points won (--pos) or lost (--neg); null keeps the text colour. */
export type Tone = 'pos' | 'neg' | null

export type RecapLineView = {
  key: string
  emoji: string
  label: string
  /** The player, the duo, « A & B 5–0 C & D » or « Edgar prend la tête ». */
  subject: string
  /** Under the subject: « 4 V · 1 D », « 28 % de chances ». */
  detail: string | null
  /** On the right: « +45 », « 3 V · 0 D », « 9 matchs ». */
  value: string | null
  tone: Tone
  /** Player, duo or match page. */
  href: string
}

export type RecapCardView = { key: string; title: string; summary: string; lines: RecapLineView[] }

type Players = ReadonlyMap<PlayerId, Player>

const EN_DASH = '–'

export const RECAP_COPY = {
  hot: { emoji: '🔥', label: 'Joueur du jour' },
  cold: { emoji: '🧊', label: 'Dans le dur' },
  duo: { emoji: '🤝', label: 'Duo du jour' },
  holdUp: { emoji: '💰', label: 'Hold-up du jour' },
  fanny: { emoji: '🍑', label: 'Fanny' },
  comeback: { emoji: '🔁', label: 'Comeback' },
  leader: { emoji: '👑', label: 'Nouveau n°1' },
  addict: { emoji: '🏃', label: 'Accro du jour' },
  more: 'Jours précédents',
  emptyTitle: 'Pas encore de récap',
  emptyBody: 'Enregistre un match pour voir le récap de la journée.',
} as const

type Copy = { emoji: string; label: string }

function nameOf(players: Players, id: PlayerId): string {
  return players.get(id)?.name ?? '?'
}

function teamText(players: Players, ids: PlayerId[]): string {
  return ids.map((id) => nameOf(players, id)).join(' & ')
}

/** « Arnault & Julien Fritz 5–0 Stéphane & Sacha »: winners first, each team in its recorded order. */
export function matchText(match: Match, players: Players): string {
  const { winners, losers, won, lost } = winnersFirst(match)
  return `${teamText(players, winners)} ${fmtInt(won)}${EN_DASH}${fmtInt(lost)} ${teamText(players, losers)}`
}

/** « 12 matchs · 9 joueurs · 2 fanny » (no fanny part on a day without one). */
export function summaryText(day: RecapDay): string {
  const parts = [plural(day.matches.length, 'match'), plural(day.playerCount, 'joueur')]
  const fannys = day.fannys.length
  if (fannys > 0) parts.push(plural(fannys, 'fanny', 'fanny'))
  return parts.join(' · ')
}

function toneOf(net: number): Tone {
  if (Math.round(net) > 0) return 'pos'
  if (Math.round(net) < 0) return 'neg'
  return null
}

function line(key: string, copy: Copy, parts: Omit<RecapLineView, 'key' | 'emoji' | 'label'>): RecapLineView {
  return { key, emoji: copy.emoji, label: copy.label, ...parts }
}

function playerHref(id: PlayerId): string {
  return hrefOf({ name: 'joueur', id })
}

function matchHref(match: Match): string {
  return hrefOf({ name: 'match-detail', id: match.id })
}

function pointsLine(key: string, copy: Copy, day: PlayerDay | null, players: Players): RecapLineView[] {
  if (day === null) return []
  const parts = { subject: nameOf(players, day.playerId), detail: recordText(day), value: fmtDelta(day.net) }
  return [line(key, copy, { ...parts, tone: toneOf(day.net), href: playerHref(day.playerId) })]
}

function duoLine(day: RecapDay, players: Players): RecapLineView[] {
  const { duo } = day
  if (duo === null) return []
  const href = hrefOf({ name: 'duo', id: duoId(duo.members[0], duo.members[1]) })
  const subject = duoLabel(duo.members, players)
  return [line('duo', RECAP_COPY.duo, { subject, detail: null, value: recordText(duo), tone: null, href })]
}

function holdUpLine(holdUp: HoldUp | null, players: Players): RecapLineView[] {
  if (holdUp === null) return []
  const detail = `${fmtPercent(holdUp.chance)} de chances`
  const parts = { subject: matchText(holdUp.match, players), detail, value: null, tone: null }
  return [line('hold-up', RECAP_COPY.holdUp, { ...parts, href: matchHref(holdUp.match) })]
}

function matchLines(kind: 'fanny' | 'comeback', matches: Match[], players: Players): RecapLineView[] {
  return matches.map((match) =>
    line(`${kind}-${match.id}`, RECAP_COPY[kind], {
      subject: matchText(match, players),
      detail: null,
      value: null,
      tone: null,
      href: matchHref(match),
    }),
  )
}

function leaderLine(id: PlayerId | null, players: Players): RecapLineView[] {
  if (id === null) return []
  const subject = `${nameOf(players, id)} prend la tête`
  return [line('leader', RECAP_COPY.leader, { subject, detail: null, value: null, tone: null, href: playerHref(id) })]
}

function addictLine(day: PlayerDay | null, players: Players): RecapLineView[] {
  if (day === null) return []
  const parts = { subject: nameOf(players, day.playerId), detail: null, tone: null, href: playerHref(day.playerId) }
  return [line('addict', RECAP_COPY.addict, { ...parts, value: plural(day.wins + day.losses, 'match') })]
}

/** The highlight lines of a day, each only when it applies, in the order of the spec. */
export function recapLines(day: RecapDay, players: Players): RecapLineView[] {
  return [
    ...leaderLine(day.newLeader, players),
    ...pointsLine('hot', RECAP_COPY.hot, day.hot, players),
    ...pointsLine('cold', RECAP_COPY.cold, day.cold, players),
    ...duoLine(day, players),
    ...holdUpLine(day.holdUp, players),
    ...matchLines('fanny', day.fannys, players),
    ...matchLines('comeback', day.comebacks, players),
    ...addictLine(day.addict, players),
  ]
}

/** One card per day: « Aujourd'hui », « Hier », « lundi 13 octobre » (fmtDayHeader), never a time of day. */
export function recapCard(day: RecapDay, players: Players, now: Date): RecapCardView {
  return {
    key: day.key,
    title: fmtDayHeader(day.date, now),
    summary: summaryText(day),
    lines: recapLines(day, players),
  }
}
