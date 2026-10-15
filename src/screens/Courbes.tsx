import { useMemo } from 'react'
import type { ModeReplay } from '../rating/modes'
import { useModeReplay } from '../rating/useModeReplay'
import { useReplay } from '../rating/useReplay'
import { useAppState } from '../store'
import type { ReplayData } from './lists/context'
import { CourbesView } from './lists/CourbesView'
import { CURVE_WORDING, formatOfTab, tabOf } from './lists/modeLabels'

// The 2V2 / 1V1 ranking as the chart reads it: its entities stand for the players (a duo's name is « A & B »).
function curvesData(replay: ReplayData, mode: ModeReplay | null): ReplayData {
  if (mode === null) return replay
  return { ...replay, result: mode.result, ranking: mode.ranking, players: mode.entities }
}

/**
 * Courbes du classement (`#/courbes`, from Classement): hooks only; the body lives in lists/CourbesView.tsx. The
 * curves follow the Classement tab remembered on this phone (Mixte, 2V2 duos or 1V1).
 */
export function Courbes() {
  const app = useAppState()
  const replay: ReplayData = useReplay()
  const tab = tabOf(app.store.settings)
  const mode = useModeReplay(formatOfTab(tab), replay.now)
  const data = useMemo(() => curvesData(replay, mode), [replay, mode])
  // Keyed by tab: the chosen curves of one ranking mean nothing in another.
  return <CourbesView key={tab} app={app} replay={data} wording={CURVE_WORDING[tab]} />
}
