import { isComeback, isFanny } from '../stats'
import type { Match } from '../types'

export type MatchPillsProps = {
  match: Match
  /** Wraps the pills in a span with this class (MatchSummary); bare pills otherwise (HistoryRow's meta line). */
  className?: string
}

/** « fanny » when the loser scored 0, « comeback » when the match was flagged as one; nothing for other matches. */
export function MatchPills({ match, className }: MatchPillsProps) {
  const fanny = isFanny(match)
  const comeback = isComeback(match)
  if (!fanny && !comeback) return null
  const pills = (
    <>
      {fanny && <span className="pill">fanny</span>}
      {comeback && <span className="pill pill--comeback">comeback</span>}
    </>
  )
  if (className === undefined) return pills
  return <span className={className}>{pills}</span>
}
