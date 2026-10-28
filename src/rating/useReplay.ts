import { useEffect, useMemo, useState } from 'react'

import { useAppState } from '../store'
import type { Match, MatchId, Player, PlayerId, Ranking, ReplayResult } from '../types'
import { replayRankings } from './rankings'
import type { Rankings } from './rankings'

// The Inactive section depends on the clock; refreshing it once a minute keeps a long-lived PWA right without
// re-rendering on every tick.
const NOW_REFRESH_MS = 60_000

export type ReplayView = {
  /** « 2V2 mixte », the main ranking (rankings.main): every player, rated on the 2v2 matches only. */
  result: ReplayResult
  ranking: Ranking
  /** 2V2 mixte, 1V1 and every match's result in the ranking of its format (./rankings.ts). */
  rankings: Rankings
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
  const rankings = useMemo(
    () => replayRankings(store.players, store.matches, now),
    [store.players, store.matches, now],
  )

  return useMemo(
    () => ({ result: rankings.main.result, ranking: rankings.main.ranking, rankings, players, matches, now }),
    [rankings, players, matches, now],
  )
}
