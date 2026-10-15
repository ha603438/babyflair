// Module-level, in-memory Historique filters: Historique unmounts when a match detail opens, the filters must be there
// on the way back. Not in the URL and not persisted: a reload starts again from « every match ».
import { useState } from 'react'
import { NO_FILTERS } from './filters'
import type { HistoryFilters } from './filters'

let saved: HistoryFilters = NO_FILTERS

export function savedHistoryFilters(): HistoryFilters {
  return saved
}

export function saveHistoryFilters(filters: HistoryFilters): void {
  saved = filters
}

/** Like useState, seeded from and written through to the module-level filters. */
export function useHistoryFilters(): [HistoryFilters, (next: HistoryFilters) => void] {
  const [filters, setFilters] = useState(savedHistoryFilters)
  function update(next: HistoryFilters) {
    saveHistoryFilters(next)
    setFilters(next)
  }
  return [filters, update]
}
