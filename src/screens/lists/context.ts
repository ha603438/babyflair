import type { Rankings } from '../../rating/rankings'
import type { AppState } from '../../store'
import type { Match, MatchId, Player, PlayerId, Ranking, ReplayResult } from '../../types'

/**
 * What `useReplay()` (src/rating/useReplay) returns. Typed here so the list views stay engine-free: the screen shells
 * call the hook and hand the data down, and the views can be rendered in tests with plain fixtures. `result` and
 * `ranking` are the main ranking, « 2V2 mixte » (rankings.main); a match's deltas come from `rankings.byMatch`.
 */
export type ReplayData = {
  result: ReplayResult
  ranking: Ranking
  rankings: Rankings
  players: Map<PlayerId, Player>
  matches: Map<MatchId, Match>
  now: Date
}

/** The slice of the app state the list screens use; the views take it as a prop so tests can fake it. */
export type ScreenContext = Pick<AppState, 'store' | 'dispatch' | 'toast' | 'nav'>
