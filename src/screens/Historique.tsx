// Historique (spec §3.3): every match, newest first, grouped by day under sticky day headers.
import { useMemo } from 'react'
import { EmptyState } from '../components/EmptyState'
import { HistoryRow } from '../components/rows'
import { fmtDayHeader, plural } from '../format'
import { useReplay } from '../rating/useReplay'
import { hrefOf, navigate } from '../router'
import { useAppState } from '../store'
import type { Match } from '../types'

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

export function Historique() {
  const { store } = useAppState()
  const { result, players, now } = useReplay()
  const groups = useMemo(() => groupByDay(newestFirst(store.matches), now), [store.matches, now])

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
      {groups.map((group) => (
        <section key={group.key} className="hist-group" aria-label={group.label}>
          <h2 className="hist-day">{group.label}</h2>
          {group.matches.map((match) => (
            <HistoryRow
              key={match.id}
              match={match}
              result={result.byMatch.get(match.id)}
              players={players}
              href={hrefOf({ name: 'match-detail', id: match.id })}
            />
          ))}
        </section>
      ))}
      <p className="hist-footer">{plural(store.matches.length, 'match')} au total</p>
    </div>
  )
}
