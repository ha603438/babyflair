// Historique (spec §3.3): every match, newest first, grouped by day under sticky day headers for the owner's profile
// only (like the times of day, profile/times.ts); everyone else gets one continuous list. A filter bar on top (format
// chips, player selector) narrows the list; day headers and the count follow the filtered list.
import { useMemo } from 'react'
import { EmptyState } from '../components/EmptyState'
import { HistoryRow } from '../components/rows'
import { fmtDayHeader } from '../format'
import { useShowsTimes } from '../profile/useShowsTimes'
import { matchResult } from '../rating/rankings'
import type { ReplayView } from '../rating/useReplay'
import { useReplay } from '../rating/useReplay'
import { hrefOf, navigate } from '../router'
import { useAppState } from '../store'
import type { Match } from '../types'
import { countLine, filterMatches, isFiltered, NO_FILTERS, playerOptions, resolveFilters } from './historique/filters'
import { HistoryFilterBar, NoFilteredMatch } from './historique/HistoryFilterBar'
import { useHistoryFilters } from './historique/useHistoryFilters'

type DayGroup = { key: string; label: string; matches: Match[] }

/** playedAt desc, then seq desc: two matches saved within the same second keep their creation order. */
function newestFirst(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt) || b.seq - a.seq)
}

function localDayKey(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/** Consecutive matches of the same local calendar day share one group; the input is already newest first. */
function groupByDay(matches: Match[], now: Date): DayGroup[] {
  const groups: DayGroup[] = []
  for (const match of matches) {
    const key = localDayKey(match.playedAt)
    const last = groups[groups.length - 1]
    if (last !== undefined && last.key === key) {
      last.matches.push(match)
      continue
    }
    groups.push({ key, label: fmtDayHeader(match.playedAt, now), matches: [match] })
  }
  return groups
}

function Rows({ matches, replay }: { matches: Match[]; replay: ReplayView }) {
  return matches.map((match) => (
    <HistoryRow
      key={match.id}
      match={match}
      result={matchResult(replay.rankings, match.id)}
      players={replay.players}
      href={hrefOf({ name: 'match-detail', id: match.id })}
    />
  ))
}

type DayListProps = { matches: Match[]; replay: ReplayView; showsDays: boolean }

/** Day groups for the owner; for everyone else the same rows in one section, without any day. */
function DayList({ matches, replay, showsDays }: DayListProps) {
  if (!showsDays) {
    if (matches.length === 0) return null
    return (
      <section className="hist-group">
        <Rows matches={matches} replay={replay} />
      </section>
    )
  }
  return groupByDay(matches, replay.now).map((group) => (
    <section key={group.key} className="hist-group" aria-label={group.label}>
      <h2 className="hist-day">{group.label}</h2>
      <Rows matches={group.matches} replay={replay} />
    </section>
  ))
}

export function Historique() {
  const { store } = useAppState()
  const replay = useReplay()
  const [stored, setFilters] = useHistoryFilters()
  const options = useMemo(() => playerOptions(store.players, store.matches), [store.players, store.matches])
  const filters = useMemo(() => resolveFilters(stored, options), [stored, options])
  const shown = useMemo(() => filterMatches(store.matches, filters), [store.matches, filters])
  const ordered = useMemo(() => newestFirst(shown), [shown])
  const showsDays = useShowsTimes()
  const filtered = isFiltered(filters)

  if (store.matches.length === 0) {
    return (
      <div className="content">
        <EmptyState
          title="Aucun match pour l'instant."
          body="Enregistre le premier depuis l'onglet Match."
          action={{ label: 'Nouveau match', onClick: () => navigate({ name: 'match' }) }}
        />
      </div>
    )
  }

  return (
    <div className="hist-col">
      <HistoryFilterBar filters={filters} options={options} onChange={setFilters} />
      {shown.length === 0 && <NoFilteredMatch onClear={() => setFilters(NO_FILTERS)} />}
      <DayList matches={ordered} replay={replay} showsDays={showsDays} />
      {shown.length > 0 && <p className="hist-footer">{countLine(shown.length, store.matches.length, filtered)}</p>}
    </div>
  )
}
