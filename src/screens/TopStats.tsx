import { useMemo } from 'react'
import { useReplay } from '../rating/useReplay'
import { topRecords } from '../records'
import { useAppState } from '../store'
import type { ReplayData } from './lists/context'
import { TopStatsView } from './lists/TopStatsView'

/**
 * Hall of Flair (`#/top`, from Classement): hooks only; the body lives in lists/TopStatsView.tsx. The records are
 * recomputed only when the store's players or matches, or the Mixte replay result, change.
 */
export function TopStats() {
  const { store } = useAppState()
  const replay: ReplayData = useReplay()
  const { players, matches } = store
  const records = useMemo(() => topRecords(players, matches, replay.result), [players, matches, replay.result])
  return <TopStatsView records={records} players={replay.players} matchCount={matches.length} now={replay.now} />
}
