import { announcedBets, betPillText, betPillTitle, betSucceeded } from '../bets'
import type { Announcement } from '../bets'
import { isComeback, isFanny } from '../stats'
import type { Match } from '../types'

export type MatchPillsProps = {
  match: Match
  /** Wraps the pills in a span with this class (MatchSummary); bare pills otherwise (HistoryRow's meta line). */
  className?: string
}

function pillClass(success: boolean): string {
  if (success) return 'pill pill--bet is-won'
  return 'pill pill--bet is-lost'
}

function BetPill({ match, bet }: { match: Match; bet: Announcement }) {
  const success = betSucceeded(match, bet.team) === true
  return (
    <span className={pillClass(success)} title={betPillTitle(bet.team, bet.n, success)}>
      {betPillText(bet.n, success)}
    </span>
  )
}

/**
 * « fanny » when the loser scored 0, « comeback » when the match was flagged as one, « 🎯 +4 ✓ » / « 🎯 +4 ✗ » per
 * announcement (Blancs first); nothing for other matches.
 */
export function MatchPills({ match, className }: MatchPillsProps) {
  const fanny = isFanny(match)
  const comeback = isComeback(match)
  const bets = announcedBets(match)
  if (!fanny && !comeback && bets.length === 0) return null
  const pills = (
    <>
      {fanny && <span className="pill">fanny</span>}
      {comeback && <span className="pill pill--comeback">comeback</span>}
      {bets.map((bet) => (
        <BetPill key={bet.team} match={match} bet={bet} />
      ))}
    </>
  )
  if (className === undefined) return pills
  return <span className={className}>{pills}</span>
}
