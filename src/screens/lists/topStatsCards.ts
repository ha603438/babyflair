import { duoId, duoLabel } from '../../duo'
import type { DuoMembers } from '../../duo'
import { fmtDayOn, fmtDaySpan, fmtDelta, fmtInt, fmtOrdinal, fmtPercent, plural } from '../../format'
import { EXPLOIT_MAX_CHANCE, MIN_BET_RATE, MIN_POSITION_MATCHES, MIN_STREAK } from '../../records'
import type {
  BetRateLine,
  CountLine,
  DuoLine,
  DuoRivalryLine,
  ExploitLine,
  GainLine,
  LongshotLine,
  PeakLine,
  Podium,
  PositionLine,
  RivalryLine,
  StreakLine,
  TopRecords,
} from '../../records'
import { hrefOf } from '../../router'
import type { MatchId, Player, PlayerId } from '../../types'
import { recordText } from './labels'

// Hall of Flair (`#/top`): the French copy of every record card and the display lines of its podium. Pure: the records
// come from src/records.ts, the page (TopStatsView) only lays these out. Days only, never a time of day.

export type NameLink = { label: string; href: string }

export type EntryView = {
  /** The names shown, each with its own page (player, or duo for a duo record). */
  names: NameLink[]
  /** « & » between teammates, « – » between opponents. */
  joiner: string
  /** The whole entry leads here (player, duo or match page); null → each name is its own link (two opponents). */
  href: string | null
  /** « 75 % », « 7 victoires », « 18 % de chances »… */
  value: string
  /** « 6 V · 2 D », « du 3 au 9 oct. », « le 3 oct. »… */
  detail: string | null
  /** Series still running (« en cours »). */
  ongoing: boolean
}

/** One rank of a podium: its entry, or all its ex æquo (shown side by side, the same size). */
export type GroupView = {
  rank: number
  /** The figure of the rank, shown once: every record ties on its displayed figure, so all its entries share it. */
  value: string
  entries: EntryView[]
}

export type CardView = {
  key: string
  title: string
  /** One line stating the rule. */
  rule: string
  /** Muted line shown when nobody qualifies, with the minimum. */
  empty: string
  /** Ranks 1 to 3 in order (competition ranking: 1, 1, 3), each with every ex æquo of that rank. */
  groups: GroupView[]
}

export type SectionView = { title: string; cards: CardView[] }

type Copy = Pick<CardView, 'title' | 'rule' | 'empty'>
type Players = ReadonlyMap<PlayerId, Player>

/** U+202F before « : », like the narrow no-break spaces of src/format.ts. */
const NNBSP = '\u202F'
const EXPLOIT_PERCENT = fmtPercent(EXPLOIT_MAX_CHANCE)

export const TOP_STATS_COPY = {
  avant: {
    title: 'Le Sniper',
    rule: `Meilleur taux de victoire à l’avant, ${MIN_POSITION_MATCHES} matchs minimum`,
    empty: `Pas encore assez de matchs${NNBSP}: ${MIN_POSITION_MATCHES} minimum à ce poste`,
  },
  arriere: {
    title: 'Le Mur',
    rule: `Meilleur taux de victoire à l’arrière, ${MIN_POSITION_MATCHES} matchs minimum`,
    empty: `Pas encore assez de matchs${NNBSP}: ${MIN_POSITION_MATCHES} minimum à ce poste`,
  },
  winStreak: {
    title: 'Inarrêtable',
    rule: 'La plus longue série de victoires, tous matchs confondus',
    empty: `Pas encore de série${NNBSP}: ${MIN_STREAK} victoires d’affilée minimum`,
  },
  lossStreak: {
    title: 'Le Chat noir',
    rule: 'La plus longue série de défaites, tous matchs confondus',
    empty: `Pas encore de série${NNBSP}: ${MIN_STREAK} défaites d’affilée minimum`,
  },
  fannyGiven: {
    title: 'Roi du fanny',
    rule: 'Le plus de victoires sans encaisser un but',
    empty: `Pas encore de fanny${NNBSP}: 1 minimum`,
  },
  fannyTaken: {
    title: 'Abonné au fanny',
    rule: 'Le plus de défaites sans marquer un but',
    empty: `Pas encore de fanny${NNBSP}: 1 minimum`,
  },
  comebacks: {
    title: 'Le Phénix',
    rule: `Le plus de comebacks${NNBSP}: gagner 5-4 après avoir été mené 0-4`,
    empty: `Pas encore de comeback${NNBSP}: 1 minimum`,
  },
  comebacksTaken: {
    title: 'Le Château de cartes',
    rule: `Le plus de comebacks subis${NNBSP}: mené 4-0, perdu 4-5`,
    empty: `Pas encore de comeback${NNBSP}: 1 minimum`,
  },
  peak: {
    title: 'Altitude record',
    rule: 'Le plus haut total de points jamais atteint',
    empty: `Pas encore de match${NNBSP}: 1 minimum`,
  },
  exploit: {
    title: 'Le Hold-up',
    rule: 'La victoire qui avait le moins de chances, d’après les points',
    empty: `Pas encore d’exploit${NNBSP}: il faut gagner avec moins de ${EXPLOIT_PERCENT} de chances`,
  },
  gain: {
    title: 'Le Jackpot',
    rule: 'Le plus de points pris en un seul match',
    empty: `Pas encore de match${NNBSP}: 1 minimum`,
  },
  played: {
    title: 'Accro au baby',
    rule: 'Le plus de matchs joués',
    empty: `Pas encore de match${NNBSP}: 1 minimum`,
  },
  duo: {
    title: 'Un flair de famille',
    rule: 'Le plus de matchs ensemble en 2 contre 2',
    empty: `Pas encore de match en 2 contre 2${NNBSP}: 1 minimum`,
  },
  rivalry: {
    title: 'Meilleurs ennemis',
    rule: 'Le plus de matchs l’un contre l’autre',
    empty: `Pas encore de match${NNBSP}: 1 minimum`,
  },
  duoRivalry: {
    title: 'Le Clasico',
    rule: 'Le plus de matchs duo contre duo',
    empty: `Pas encore de match en 2 contre 2${NNBSP}: 1 minimum`,
  },
  betsMade: {
    title: 'Le Flambeur',
    rule: 'Le plus d’annonces, réussies ou ratées',
    empty: `Pas encore d’annonce${NNBSP}: 1 minimum`,
  },
  betRate: {
    title: 'Nostradamus',
    rule: `Meilleur taux d’annonces réussies, ${MIN_BET_RATE} annonces et 1 réussite minimum`,
    empty: `Pas encore de devin${NNBSP}: ${MIN_BET_RATE} annonces et 1 réussite minimum`,
  },
  betsFailed: {
    title: 'Le Mytho',
    rule: 'Le plus d’annonces ratées',
    empty: `Pas encore d’annonce ratée${NNBSP}: 1 minimum`,
  },
  betLongshot: {
    title: 'Coup de poker',
    rule: 'L’annonce réussie qui avait le moins de chances',
    empty: `Pas encore d’annonce réussie${NNBSP}: 1 minimum`,
  },
  betsBroken: {
    title: 'Le Briseur de rêves',
    rule: 'Le plus d’annonces adverses tombées à l’eau',
    empty: `Pas encore d’annonce ratée${NNBSP}: 1 minimum`,
  },
} as const satisfies Record<keyof TopRecords, Copy>

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

function playerLink(players: Players, id: PlayerId): NameLink {
  return { label: players.get(id)?.name ?? '?', href: hrefOf({ name: 'joueur', id }) }
}

/** « A & B », to the duo page. */
function duoLink(players: Players, members: DuoMembers): NameLink {
  return { label: duoLabel(members, players), href: hrefOf({ name: 'duo', id: duoId(members[0], members[1]) }) }
}

const BLANK: Pick<EntryView, 'joiner' | 'detail' | 'ongoing'> = { joiner: '', detail: null, ongoing: false }

/** One player, the entry linking to the profile. */
function playerEntry(players: Players, id: PlayerId, value: string, detail: string | null = null): EntryView {
  const link = playerLink(players, id)
  return { ...BLANK, names: [link], href: link.href, value, detail }
}

/** The player(s) of one match (names in alphabetical order), the entry linking to the match. */
function matchEntry(players: Players, matchId: MatchId, ids: PlayerId[], value: string, detail: string): EntryView {
  const names = ids.map((id) => playerLink(players, id)).sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  return { ...BLANK, names, joiner: ' & ', href: hrefOf({ name: 'match-detail', id: matchId }), value, detail }
}

function positionEntry(players: Players, line: PositionLine): EntryView {
  return playerEntry(players, line.playerId, fmtPercent(line.wins / (line.wins + line.losses)), recordText(line))
}

function streakNoun(line: StreakLine): string {
  if (line.kind === 'win') return 'victoire'
  return 'défaite'
}

function streakEntry(players: Players, line: StreakLine, now: Date): EntryView {
  const entry = playerEntry(players, line.playerId, plural(line.length, streakNoun(line)))
  return { ...entry, detail: fmtDaySpan(line.from, line.to, now), ongoing: line.ongoing }
}

function countEntry(players: Players, line: CountLine, singular: string, pluralForm?: string): EntryView {
  return playerEntry(players, line.playerId, plural(line.count, singular, pluralForm))
}

/** « points », « point » for 0 or ±1 (French keeps the singular below 2). */
function pointsWord(n: number): string {
  if (Math.abs(Math.round(n)) < 2) return 'point'
  return 'points'
}

function peakEntry(players: Players, line: PeakLine, now: Date): EntryView {
  const value = `${fmtInt(line.rating)} ${pointsWord(line.rating)}`
  return playerEntry(players, line.playerId, value, fmtDayOn(line.playedAt, now))
}

function exploitEntry(players: Players, line: ExploitLine, now: Date): EntryView {
  const value = `${fmtPercent(line.chance)} de chances`
  return matchEntry(players, line.matchId, line.winners, value, fmtDayOn(line.playedAt, now))
}

function gainEntry(players: Players, line: GainLine, now: Date): EntryView {
  const value = `${fmtDelta(line.delta)} ${pointsWord(line.delta)}`
  return matchEntry(players, line.matchId, [line.playerId], value, fmtDayOn(line.playedAt, now))
}

function duoEntry(players: Players, line: DuoLine): EntryView {
  const link = duoLink(players, line.members)
  return { ...BLANK, names: [link], href: link.href, value: plural(line.matches, 'match'), detail: recordText(line) }
}

/** Two opponents (players or duos), each name its own link: « 6 matchs · 4–2 », the leader first. */
function opponentsEntry(names: NameLink[], matches: number, wins: [number, number]): EntryView {
  const detail = `${fmtInt(wins[0])}–${fmtInt(wins[1])}`
  return { ...BLANK, names, joiner: ' – ', href: null, value: plural(matches, 'match'), detail }
}

function rivalryEntry(players: Players, line: RivalryLine): EntryView {
  return opponentsEntry(line.players.map((id) => playerLink(players, id)), line.matches, line.wins)
}

function duoRivalryEntry(players: Players, line: DuoRivalryLine): EntryView {
  return opponentsEntry(line.duos.map((members) => duoLink(players, members)), line.matches, line.wins)
}

/** « 67 % », « 2 réussies sur 3 ». */
function betRateEntry(players: Players, line: BetRateLine): EntryView {
  const detail = `${plural(line.won, 'réussie')} sur ${fmtInt(line.made)}`
  return playerEntry(players, line.playerId, fmtPercent(line.won / line.made), detail)
}

/** The announcing team, to the match: « 18 % de chances », « +4 annoncé · le 3 oct. ». */
function longshotEntry(players: Players, line: LongshotLine, now: Date): EntryView {
  const value = `${fmtPercent(line.chance)} de chances`
  const detail = `+${fmtInt(line.n)} annoncé · ${fmtDayOn(line.playedAt, now)}`
  return matchEntry(players, line.matchId, line.players, value, detail)
}

// ---------------------------------------------------------------------------
// Cards and sections
// ---------------------------------------------------------------------------

/** Consecutive places of the same rank form one group; its value is the first entry's (the same for all of them). */
function groupsOf<T>(podium: Podium<T>, entryOf: (line: T) => EntryView): GroupView[] {
  const groups: GroupView[] = []
  for (const { rank, line } of podium.places) {
    const entry = entryOf(line)
    const last = groups.at(-1)
    if (last?.rank === rank) {
      last.entries.push(entry)
      continue
    }
    groups.push({ rank, value: entry.value, entries: [entry] })
  }
  return groups
}

function cardOf<T>(key: keyof TopRecords, podium: Podium<T>, entryOf: (line: T) => EntryView): CardView {
  return { key, ...TOP_STATS_COPY[key], groups: groupsOf(podium, entryOf) }
}

/** Read before a group of ex æquo (visually hidden): « 1er ex æquo : », « 2e ex æquo : »… */
export function tiePrefix(rank: number): string {
  return `${fmtOrdinal(rank)} ex æquo${NNBSP}: `
}

/** The cards of the page, grouped under their section headers. `now` only decides whether a date shows its year. */
export function topStatsSections(records: TopRecords, players: Players, now: Date): SectionView[] {
  const count = (singular: string, pluralForm?: string) => (line: CountLine) =>
    countEntry(players, line, singular, pluralForm)
  return [
    {
      title: 'Les spécialistes',
      cards: [
        cardOf('avant', records.avant, (line) => positionEntry(players, line)),
        cardOf('arriere', records.arriere, (line) => positionEntry(players, line)),
      ],
    },
    {
      title: 'Séries',
      cards: [
        cardOf('winStreak', records.winStreak, (line) => streakEntry(players, line, now)),
        cardOf('lossStreak', records.lossStreak, (line) => streakEntry(players, line, now)),
      ],
    },
    {
      title: 'Fanny et comebacks',
      cards: [
        cardOf('fannyGiven', records.fannyGiven, count('fanny mis', 'fanny mis')),
        cardOf('fannyTaken', records.fannyTaken, count('fanny encaissé', 'fanny encaissés')),
        cardOf('comebacks', records.comebacks, count('comeback')),
        cardOf('comebacksTaken', records.comebacksTaken, count('comeback subi', 'comebacks subis')),
      ],
    },
    {
      title: 'Coups d’éclat',
      cards: [
        cardOf('peak', records.peak, (line) => peakEntry(players, line, now)),
        cardOf('exploit', records.exploit, (line) => exploitEntry(players, line, now)),
        cardOf('gain', records.gain, (line) => gainEntry(players, line, now)),
      ],
    },
    {
      title: 'Couilles sur la table',
      cards: [
        cardOf('betsMade', records.betsMade, count('annonce')),
        cardOf('betRate', records.betRate, (line) => betRateEntry(players, line)),
        cardOf('betsFailed', records.betsFailed, count('annonce ratée', 'annonces ratées')),
        cardOf('betLongshot', records.betLongshot, (line) => longshotEntry(players, line, now)),
        cardOf('betsBroken', records.betsBroken, count('rêve brisé', 'rêves brisés')),
      ],
    },
    {
      title: 'Fidélités et rivalités',
      cards: [
        cardOf('played', records.played, count('match')),
        cardOf('duo', records.duo, (line) => duoEntry(players, line)),
        cardOf('rivalry', records.rivalry, (line) => rivalryEntry(players, line)),
        cardOf('duoRivalry', records.duoRivalry, (line) => duoRivalryEntry(players, line)),
      ],
    },
  ]
}
