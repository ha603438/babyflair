// Journal d'activité (mode partagé, onglet de la cloche): the last 100 match_events written by the server
// trigger, fetched each time the screen opens, grouped by day like Historique. Formatting is in profile/journal.ts.
import { useEffect, useMemo, useState } from 'react'
import { ListRow } from '../components/ListRow'
import { filterEvents, JOURNAL_COPY, JOURNAL_LIMIT, journalDays } from '../profile/journal'
import type { JournalFilter, JournalRow } from '../profile/journal'
import { SegmentedControl } from '../components/SegmentedControl'
import { NotifTabs } from './NotifTabs'
import type { RemoteApi } from '../remote/api'
import { hrefOf } from '../router'
import { useAppState } from '../store'
import { toastTextFor } from '../store/remote-sync'
import type { MatchEvent, MatchId, Player, PlayerId } from '../types'

type Load = { kind: 'loading' } | { kind: 'error'; text: string } | { kind: 'done'; events: MatchEvent[] }

const NO_EVENTS: Load = { kind: 'done', events: [] }

function useMatchEvents(api: RemoteApi | null): Load {
  // Local mode has no journal: nothing to fetch, the empty state shows right away.
  const [load, setLoad] = useState<Load>(() => (api === null ? NO_EVENTS : { kind: 'loading' }))

  useEffect(() => {
    if (api === null) return
    let active = true
    api.fetchMatchEvents(JOURNAL_LIMIT).then(
      (events) => {
        if (active) setLoad({ kind: 'done', events })
      },
      (error: unknown) => {
        if (active) setLoad({ kind: 'error', text: toastTextFor(error) })
      },
    )
    return () => {
      active = false
    }
  }, [api])

  return load
}

function RowDetails({ row }: { row: JournalRow }) {
  return (
    <>
      {row.summary !== null && <div className="jr-summary">{row.summary}</div>}
      {row.change !== null && <div className="jr-change">{row.change}</div>}
    </>
  )
}

function JournalLine({ row }: { row: JournalRow }) {
  const href = row.linkable ? hrefOf({ name: 'match-detail', id: row.matchId }) : undefined
  return (
    <ListRow
      className="row--journal"
      href={href}
      chevron={row.linkable}
      leading={
        <time className="hr-time" dateTime={row.at}>
          {row.time}
        </time>
      }
      title={row.title}
      subtitle={<RowDetails row={row} />}
    />
  )
}

function Message({ text }: { text: string }) {
  return <p className="content lists-empty">{text}</p>
}

type ListProps = { events: MatchEvent[]; players: Player[]; matchIds: MatchId[]; emptyText: string }

function JournalList({ events, players, matchIds, emptyText }: ListProps) {
  // Captured once per visit: render stays pure, the day headers are fresh each time the screen opens.
  const [now] = useState(() => new Date())
  const days = useMemo(() => {
    const byId = new Map<PlayerId, Player>(players.map((player) => [player.id, player]))
    return journalDays(events, byId, new Set(matchIds), now)
  }, [events, players, matchIds, now])
  if (days.length === 0) return <Message text={emptyText} />
  return (
    <>
      {days.map((day) => (
        <section key={day.key} className="hist-group" aria-label={day.label}>
          <h2 className="hist-day">{day.label}</h2>
          {day.rows.map((row) => (
            <JournalLine key={row.id} row={row} />
          ))}
        </section>
      ))}
    </>
  )
}

const FILTERS = [
  { value: 'changes', label: JOURNAL_COPY.filterChanges },
  { value: 'all', label: JOURNAL_COPY.filterAll },
] as const satisfies readonly { value: JournalFilter; label: string }[]

export function Journal() {
  const { store, sync } = useAppState()
  const load = useMatchEvents(sync.api)
  const [filter, setFilter] = useState<JournalFilter>('changes')
  const matchIds = useMemo(() => store.matches.map((match) => match.id), [store.matches])
  const emptyText = filter === 'changes' ? JOURNAL_COPY.emptyChanges : JOURNAL_COPY.empty
  return (
    <>
      <NotifTabs current="journal" />
      <div className="content journal-filter">
        <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} aria-label="Filtre" />
      </div>
      <div className="hist-col">
        {load.kind === 'loading' && <Message text={JOURNAL_COPY.loading} />}
        {load.kind === 'error' && <Message text={load.text} />}
        {load.kind === 'done' && (
          <JournalList
            events={filterEvents(load.events, filter)}
            players={store.players}
            matchIds={matchIds}
            emptyText={emptyText}
          />
        )}
      </div>
    </>
  )
}
