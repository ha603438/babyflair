import { MODE_RANKED_AFTER } from '../../rating/modes'
import type { Format, RankingTab } from '../../types'

// French copy of the three Classement tabs (« Mixte » | « 2V2 » | « 1V1 ») and of the screens that follow the
// selected tab (Courbes). The 2V2 and 1V1 rankings come from src/rating/modes.ts.

export const DEFAULT_TAB: RankingTab = 'mixte'

export const TAB_OPTIONS = [
  { value: 'mixte', label: 'Mixte' },
  { value: '2v2', label: '2V2' },
  { value: '1v1', label: '1V1' },
] as const satisfies readonly { value: RankingTab; label: string }[]

/** The format a tab replays, null for « Mixte » (the main ranking, every match). */
export function formatOfTab(tab: RankingTab): Format | null {
  if (tab === 'mixte') return null
  return tab
}

/** The tab remembered on this phone (Settings.classementTab), « Mixte » by default. */
export function tabOf(settings: { classementTab?: RankingTab }): RankingTab {
  return settings.classementTab ?? DEFAULT_TAB
}

export const MODE_EMPTY: Record<Format, { title: string; body: string }> = {
  '2v2': {
    title: "Aucun match en 2 contre 2 pour l'instant",
    body: 'Le classement 2V2 note chaque duo comme une seule équipe.',
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

/** Pushed header of `#/courbes`, which follows the selected Classement tab. */
export const COURBES_TITLE: Record<RankingTab, string> = {
  mixte: 'Évolution du classement',
  '2v2': 'Évolution des duos',
  '1v1': 'Évolution en 1V1',
}

/** What one curve stands for: a player, or a duo in the 2V2 tab. */
export type CurveWording = { noun: string; column: string; cap: string; emptyBody: string }

const PLAYER_WORDING: CurveWording = {
  noun: 'joueur',
  column: 'Joueur',
  cap: "8 courbes maximum : masque un joueur d'abord",
  emptyBody: "Enregistre un match pour voir l'évolution du classement.",
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
