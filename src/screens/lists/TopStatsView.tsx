import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '../../components/Badge'
import { EmptyState } from '../../components/EmptyState'
import { SectionHeader } from '../../components/SectionHeader'
import { plural } from '../../format'
import type { TopRecords } from '../../records'
import type { Player, PlayerId } from '../../types'
import { topStatsSections } from './topStatsCards'
import type { CardView, EntryView, SectionView } from './topStatsCards'

// Hall of Flair (`#/top`): all-time records, one card per record under five section headers. Each card states its rule
// and shows a mini podium: the first entry emphasised (larger name, value and detail), the others on small lines;
// every ex æquo of ranks 1 to 3 is listed, sharing its medal. A muted line when nobody qualifies yet. Copy and links
// come from topStatsCards.ts.

export type TopStatsViewProps = {
  /** src/records.ts topRecords(), memoised by the screen shell. */
  records: TopRecords
  players: ReadonlyMap<PlayerId, Player>
  matchCount: number
  now: Date
}

const EMPTY_TITLE = 'Pas encore de records'
const EMPTY_BODY = 'Enregistre un match pour voir les meilleurs de tous les temps.'

function introText(matchCount: number): string {
  return `Tous les matchs depuis le début (${plural(matchCount, 'match')}), invités compris.`
}

// ---------------------------------------------------------------------------
// Podium entries
// ---------------------------------------------------------------------------

/** Plain names inside a linked entry; otherwise (two opponents) each name is its own link, free to wrap. */
function Names({ entry }: { entry: EntryView }) {
  if (entry.href !== null) {
    return <span className="podium-name">{entry.names.map((name) => name.label).join(entry.joiner)}</span>
  }
  return (
    <span className="podium-name podium-name--links">
      {entry.names.map((name, index) => (
        <Fragment key={name.href}>
          {index > 0 && entry.joiner}
          <a href={name.href}>{name.label}</a>
        </Fragment>
      ))}
    </span>
  )
}

function Ongoing({ ongoing }: { ongoing: boolean }) {
  if (!ongoing) return null
  return <span className="pill pill--ongoing">en cours</span>
}

type ShellProps = { entry: EntryView; className: string; children: ReactNode }

/** The whole entry is one link (player, duo or match page), or a plain row when its names are the links. */
function EntryShell({ entry, className, children }: ShellProps) {
  if (entry.href === null) return <div className={className}>{children}</div>
  return (
    <a className={`${className} podium-entry--link`} href={entry.href}>
      {children}
    </a>
  )
}

function FirstDetail({ detail }: { detail: string | null }) {
  if (detail === null) return null
  return (
    <>
      <span className="podium-sep" aria-hidden="true">
        ·
      </span>
      <span className="podium-detail">{detail}</span>
    </>
  )
}

/** The first entry: larger name, then « value · detail » and the « en cours » pill. */
function FirstEntry({ entry }: { entry: EntryView }) {
  return (
    <li className="podium-item podium-item--first">
      <EntryShell entry={entry} className="podium-entry podium-entry--first">
        <Badge kind="medal" rank={entry.rank} />
        <span className="podium-body">
          <Names entry={entry} />
          <span className="podium-meta">
            <span className="podium-value">{entry.value}</span>
            <FirstDetail detail={entry.detail} />
            <Ongoing ongoing={entry.ongoing} />
          </span>
        </span>
      </EntryShell>
    </li>
  )
}

function LineDetail({ entry }: { entry: EntryView }) {
  if (entry.detail === null && !entry.ongoing) return null
  return (
    <span className="podium-meta podium-meta--line">
      {entry.detail !== null && <span className="podium-detail">{entry.detail}</span>}
      <Ongoing ongoing={entry.ongoing} />
    </span>
  )
}

/** The other entries (ex æquo of the 1st included): one small line, the detail under the name. */
function LineEntry({ entry }: { entry: EntryView }) {
  return (
    <li className="podium-item">
      <EntryShell entry={entry} className="podium-entry">
        <Badge kind="medal" rank={entry.rank} />
        <span className="podium-body">
          <Names entry={entry} />
          <LineDetail entry={entry} />
        </span>
        <span className="podium-value">{entry.value}</span>
      </EntryShell>
    </li>
  )
}

function Podium({ card }: { card: CardView }) {
  const [first, ...rest] = card.entries
  if (first === undefined) return <p className="record-empty">{card.empty}</p>
  return (
    <ol className="podium">
      <FirstEntry entry={first} />
      {rest.map((entry, index) => (
        <LineEntry key={index} entry={entry} />
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Cards and sections
// ---------------------------------------------------------------------------

function RecordCard({ card }: { card: CardView }) {
  return (
    <section className="card record">
      <h3 className="record-title">{card.title}</h3>
      <p className="record-rule">{card.rule}</p>
      <Podium card={card} />
    </section>
  )
}

function RecordsSection({ section }: { section: SectionView }) {
  return (
    <section>
      <SectionHeader title={section.title} />
      <div className="content records">
        {section.cards.map((card) => (
          <RecordCard key={card.key} card={card} />
        ))}
      </div>
    </section>
  )
}

export function TopStatsView({ records, players, matchCount, now }: TopStatsViewProps) {
  if (matchCount === 0) return <EmptyState title={EMPTY_TITLE} body={EMPTY_BODY} />
  const sections = topStatsSections(records, players, now)
  return (
    <div className="lists-screen top-stats">
      <p className="content top-stats__intro">{introText(matchCount)}</p>
      {sections.map((section) => (
        <RecordsSection key={section.title} section={section} />
      ))}
    </div>
  )
}
