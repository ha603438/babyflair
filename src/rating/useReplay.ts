import { useEffect, useMemo, useState } from 'react'

import { useAppState } from '../store'
import type { Match, MatchId, Player, PlayerId, Ranking, ReplayResult } from '../types'
import { rank, replay } from './index'

// The Inactive section depends on the clock; refreshing it once a minute keeps a long-lived PWA right without
// re-rendering on every tick.
const NOW_REFRESH_MS = 60_000

export type ReplayView = {
  result: ReplayResult
  ranking: Ranking
  players: Map<PlayerId, Player>
  matches: Map<MatchId, Match>
  now: Date
}

export function useReplay(): ReplayView {
  const { store } = useAppState()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), NOW_REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  const players = useMemo(() => new Map<PlayerId, Player>(store.players.map((p) => [p.id, p])), [store.players])
  const matches = useMemo(() => new Map<MatchId, Match>(store.matches.map((m) => [m.id, m])), [store.matches])
  const result = useMemo(() => replay(store.players, store.matches, { now }), [store.players, store.matches, now])
  const ranking = useMemo(() => rank(result, store.players), [result, store.players])

  return useMemo(() => ({ result, ranking, players, matches, now }), [result, ranking, players, matches, now])
}
