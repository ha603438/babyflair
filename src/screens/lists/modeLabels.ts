import { MODE_RANKED_AFTER } from '../../rating/modes'
import type { ModeReplay } from '../../rating/modes'
import type { Rankings } from '../../rating/rankings'
import type { Format, RankingTab } from '../../types'

// French copy of the three Classement tabs (« 2V2 mixte » | « Équipes » | « 1V1 », three separate rankings, see
// src/rating/rankings.ts) and of the screens that follow the selected tab (Courbes, which has the same selector).
// « 2V2 équipes » is shortened to « Équipes » so the three labels fit a 375 px wide segmented control.

export const DEFAULT_TAB: RankingTab = 'mixte'

/** The main ranking's name, wherever its rating stands next to another one (the player page). */
export const MAIN_LABEL = '2V2 mixte'

export const TAB_OPTIONS = [
  { value: 'mixte', label: MAIN_LABEL },
  { value: '2v2', label: 'Équipes' },
  { value: '1v1', label: '1V1' },
] as const satisfies readonly { value: RankingTab; label: string }[]

/** The duo ranking is replayed only while « Équipes » is selected (useModeReplay('2v2')). */
export function duoFormatOf(tab: RankingTab): Format | null {
  if (tab === '2v2') return '2v2'
  return null
}

/** The ModeReplay of the selected tab: the duos, the 1V1 ranking of useReplay, or null on « 2V2 mixte ». */
export function modeOfTab(tab: RankingTab, rankings: Rankings, duos: ModeReplay | null): ModeReplay | null {
  if (tab === '1v1') return rankings.oneVsOne
  if (tab === '2v2') return duos
  return null
}

/** The tab remembered on this phone (Settings.classementTab), « 2V2 mixte » by default. */
export function tabOf(settings: { classementTab?: RankingTab }): RankingTab {
  return settings.classementTab ?? DEFAULT_TAB
}

/** « 2V2 mixte » with matches, but none in 2 contre 2 yet. */
export const MAIN_EMPTY = {
  title: "Aucun match en 2 contre 2 pour l'instant",
  body: 'Le classement 2V2 mixte note chaque joueur sur les matchs en 2 contre 2, quel que soit son coéquipier.',
}

export const MAIN_OBSERVATION =
  'Tout le monde est encore en observation : 10 matchs en 2 contre 2 pour entrer au classement.'

export const MODE_EMPTY: Record<Format, { title: string; body: string }> = {
  '2v2': {
    title: "Aucun match en 2 contre 2 pour l'instant",
    body: 'Le classement des équipes note chaque duo comme une seule équipe.',
  },
  '1v1': {
    title: "Aucun match en 1 contre 1 pour l'instant",
    body: 'Le classement 1V1 ne compte que les matchs en 1 contre 1.',
  },
}

/** Shown when nobody is ranked yet in that tab. */
export const MODE_OBSERVATION: Record<Format, string> = {
  '2v2': `Aucun duo classé pour l'instant : ${MODE_RANKED_AFTER} matchs ensemble pour entrer au classement.`,
  '1v1':
    'Tout le monde est encore en observation : ' +
    `${MODE_RANKED_AFTER} matchs en 1 contre 1 pour entrer au classement.`,
}

export const MODE_ROOKIES_SUBTITLE = `classés après ${MODE_RANKED_AFTER} matchs`

/** What one curve stands for: a player, or a duo in the « Équipes » tab. */
export type CurveWording = { noun: string; column: string; cap: string; emptyBody: string }

const PLAYER_WORDING: CurveWording = {
  noun: 'joueur',
  column: 'Joueur',
  cap: "8 courbes maximum : masque un joueur d'abord",
  emptyBody: "Enregistre un match en 2 contre 2 pour voir l'évolution du classement 2V2 mixte.",
}

export const CURVE_WORDING: Record<RankingTab, CurveWording> = {
  mixte: PLAYER_WORDING,
  '2v2': {
    noun: 'duo',
    column: 'Duo',
    cap: "8 courbes maximum : masque un duo d'abord",
    emptyBody: "Enregistre un match en 2 contre 2 pour voir l'évolution des duos.",
  },
  '1v1': {
    ...PLAYER_WORDING,
    emptyBody: "Enregistre un match en 1 contre 1 pour voir l'évolution du classement 1V1.",
  },
}
