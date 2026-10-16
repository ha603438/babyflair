import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '../../components/Badge'
import { EmptyState } from '../../components/EmptyState'
import { SectionHeader } from '../../components/SectionHeader'
import { plural } from '../../format'
import type { TopRecords } from '../../records'
import type { Player, PlayerId } from '../../types'
import { tiePrefix, topStatsSections } from './topStatsCards'
import type { CardView, EntryView, GroupView, SectionView } from './topStatsCards'

// Hall of Flair (`#/top`): all-time records, one card per record under five section headers. Each card states its rule
// and shows a mini podium, one medal per rank: a lone 1st emphasised (larger name, value and detail), a lone 2nd or 3rd
// on a small line; the ex æquo of a rank side by side, all the same size, their shared value shown once. A muted line
// when nobody qualifies yet. Copy and links come from topStatsCards.ts.

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

type SoloProps = { group: GroupView; entry: EntryView }

/** A lone 1st: larger name, then « value · detail » and the « en cours » pill. */
function FirstEntry({ group, entry }: SoloProps) {
  return (
    <li className="podium-item podium-item--first">
      <EntryShell entry={entry} className="podium-entry podium-entry--first">
        <Badge kind="medal" rank={group.rank} />
        <span className="podium-body">
          <Names entry={entry} />
          <span className="podium-meta">
            <span className="podium-value">{group.value}</span>
            <FirstDetail detail={entry.detail} />
            <Ongoing ongoing={entry.ongoing} />
          </span>
        </span>
      </EntryShell>
    </li>
  )
}

/** The detail and « en cours » pill under a name; `className` sets their size (1st or smaller ranks). */
function EntryDetail({ entry, className }: { entry: EntryView; className: string }) {
  if (entry.detail === null && !entry.ongoing) return null
  return (
    <span className={className}>
      {entry.detail !== null && <span className="podium-detail">{entry.detail}</span>}
      <Ongoing ongoing={entry.ongoing} />
    </span>
  )
}

/** A lone 2nd or 3rd: one small line, the detail under the name, the value on the right. */
function LineEntry({ group, entry }: SoloProps) {
  return (
    <li className="podium-item">
      <EntryShell entry={entry} className="podium-entry">
        <Badge kind="medal" rank={group.rank} />
        <span className="podium-body">
          <Names entry={entry} />
          <EntryDetail entry={entry} className="podium-meta podium-meta--line" />
        </span>
        <span className="podium-value">{group.value}</span>
      </EntryShell>
    </li>
  )
}

function tieItemClass(rank: number): string {
  if (rank === 1) return 'podium-item podium-item--first podium-tie'
  return 'podium-item podium-tie'
}

function tieMetaClass(rank: number): string {
  if (rank === 1) return 'podium-meta'
  return 'podium-meta podium-meta--line'
}

/** One ex æquo: its name(s) and detail, the cell being its link (or its names, for two opponents). */
function TieCell({ entry, metaClass }: { entry: EntryView; metaClass: string }) {
  return (
    <EntryShell entry={entry} className="podium-cell">
      <Names entry={entry} />
      <EntryDetail entry={entry} className={metaClass} />
    </EntryShell>
  )
}

/**
 * The ex æquo of a rank: one medal, the cells side by side (2 per row), the shared value once. A 1st's names and value
 * keep the emphasis; the value goes under the cells for a 1st, on their right (or under, when short of room) for a 2nd
 * or 3rd. Screen readers hear « 1er ex æquo : » before the names, the medal itself being hidden.
 */
function TieGroup({ group }: { group: GroupView }) {
  const metaClass = tieMetaClass(group.rank)
  return (
    <li className={tieItemClass(group.rank)}>
      <span className="sr-only">{tiePrefix(group.rank)}</span>
      <span className="podium-medal" aria-hidden="true">
        <Badge kind="medal" rank={group.rank} />
      </span>
      <div className="podium-tie-body">
        <div className="podium-cells">
          {group.entries.map((entry, index) => (
            <TieCell key={index} entry={entry} metaClass={metaClass} />
          ))}
        </div>
        <span className="podium-value">{group.value}</span>
      </div>
    </li>
  )
}

function PodiumGroup({ group }: { group: GroupView }) {
  const [entry, ...others] = group.entries
  if (others.length > 0) return <TieGroup group={group} />
  if (group.rank === 1) return <FirstEntry group={group} entry={entry} />
  return <LineEntry group={group} entry={entry} />
}

function Podium({ card }: { card: CardView }) {
  if (card.groups.length === 0) return <p className="record-empty">{card.empty}</p>
  return (
    <ol className="podium">
      {card.groups.map((group) => (
        <PodiumGroup key={group.rank} group={group} />
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
