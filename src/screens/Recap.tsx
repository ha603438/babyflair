import { useMemo, useState } from 'react'
import { useReplay } from '../rating/useReplay'
import { recap, RECAP_DAYS_STEP } from '../recap'
import { useAppState } from '../store'
import type { ReplayData } from './lists/context'
import { RecapView } from './lists/RecapView'
import { StatsTabs } from './StatsTabs'

/**
 * Récap (`#/stats`, default segment of the Stats tab): hooks only; the body lives in lists/RecapView.tsx. The number
 * of days shown lives in component state (3, then 3 more per « Jours précédents »); the days are recomputed only when
 * the store's players or matches, the Mixte replay result or that number change.
 */
export function Recap() {
  const { store } = useAppState()
  const replay: ReplayData = useReplay()
  const [dayCount, setDayCount] = useState(RECAP_DAYS_STEP)
  const { players, matches } = store
  const { result } = replay
  const days = useMemo(() => recap(players, matches, result, dayCount), [players, matches, result, dayCount])
  return (
    <>
      <StatsTabs current="stats" />
      <RecapView
        recap={days}
        players={replay.players}
        now={replay.now}
        onMore={() => setDayCount((count) => count + RECAP_DAYS_STEP)}
      />
    </>
  )
}
