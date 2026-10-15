import { EmptyState } from '../../components/EmptyState'
import type { Recap } from '../../recap'
import type { Player, PlayerId } from '../../types'
import { RECAP_COPY, recapCard } from './recapLines'
import type { RecapCardView, RecapLineView, Tone } from './recapLines'

// Récap (`#/stats`, default segment of the Stats tab): one card per day with matches, most recent first. Each card has
// the day (« Aujourd'hui », « Hier », « lundi 13 octobre »), the « 12 matchs · 9 joueurs · 2 fanny » line, then the
// highlight lines that apply, each a link to its player, duo or match. « Jours précédents » adds older days. Copy and
// links come from recapLines.ts.

export type RecapViewProps = {
  /** src/recap.ts recap(), memoised by the screen shell. */
  recap: Recap
  players: ReadonlyMap<PlayerId, Player>
  now: Date
  /** « Jours précédents »: shows RECAP_DAYS_STEP more days. */
  onMore: () => void
}

function Detail({ detail }: { detail: string | null }) {
  if (detail === null) return null
  return <span className="recap-line__detail">{detail}</span>
}

function valueClass(tone: Tone): string {
  if (tone === null) return 'recap-line__value'
  return `recap-line__value ${tone}`
}

function Value({ line }: { line: RecapLineView }) {
  if (line.value === null) return null
  return <span className={valueClass(line.tone)}>{line.value}</span>
}

function RecapLine({ line }: { line: RecapLineView }) {
  return (
    <li>
      <a className="recap-line" href={line.href}>
        <span className="recap-line__emoji" aria-hidden="true">
          {line.emoji}
        </span>
        <span className="recap-line__body">
          <span className="recap-line__label">{line.label}</span>
          <span className="recap-line__subject">{line.subject}</span>
          <Detail detail={line.detail} />
        </span>
        <Value line={line} />
      </a>
    </li>
  )
}

function Lines({ lines }: { lines: RecapLineView[] }) {
  if (lines.length === 0) return null
  return (
    <ul className="recap-lines">
      {lines.map((line) => (
        <RecapLine key={line.key} line={line} />
      ))}
    </ul>
  )
}

function DayCard({ card }: { card: RecapCardView }) {
  return (
    <section className="card recap-day">
      <h2 className="recap-day__title">{card.title}</h2>
      <p className="recap-day__summary">{card.summary}</p>
      <Lines lines={card.lines} />
    </section>
  )
}

function MoreButton({ hasMore, onMore }: { hasMore: boolean; onMore: () => void }) {
  if (!hasMore) return null
  return (
    <button type="button" className="recap-more" onClick={onMore}>
      {RECAP_COPY.more}
    </button>
  )
}

export function RecapView({ recap, players, now, onMore }: RecapViewProps) {
  if (recap.days.length === 0) return <EmptyState title={RECAP_COPY.emptyTitle} body={RECAP_COPY.emptyBody} />
  return (
    <div className="lists-screen recap">
      <div className="content recap-days">
        {recap.days.map((day) => (
          <DayCard key={day.key} card={recapCard(day, players, now)} />
        ))}
        <MoreButton hasMore={recap.hasMore} onMore={onMore} />
      </div>
    </div>
  )
}
