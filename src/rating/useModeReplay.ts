import { useMemo } from 'react'

import { useAppState } from '../store'
import type { Format } from '../types'
import { replayMode } from './modes'
import type { ModeReplay } from './modes'

/**
 * The 2V2 équipes ('2v2') or 1V1 ranking, memoised on the store's players and matches (and the minute clock of
 * useReplay, which only moves the Inactifs section). `format` null = the screen does not need it: nothing is replayed.
 * The 1V1 ranking is also in useReplay().rankings.oneVsOne: the screens read it there.
 */
export function useModeReplay(format: Format | null, now: Date): ModeReplay | null {
  const { store } = useAppState()
  return useMemo(() => {
    if (format === null) return null
    return replayMode(format, store.players, store.matches, now)
  }, [format, store.players, store.matches, now])
}
