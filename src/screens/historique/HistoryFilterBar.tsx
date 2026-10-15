// Historique filter bar: « 2V2 » / « 1V1 » toggle chips, a native player <select> and, once a filter is active,
// a small « Effacer ». Styles in src/styles/history-filters.css.
import type { ChangeEvent } from 'react'
import { Button } from '../../components/Button'
import type { Format } from '../../types'
import {
  ALL_PLAYERS_VALUE,
  FILTER_COPY,
  FORMAT_CHIPS,
  isFiltered,
  NO_FILTERS,
  playerValue,
  toggleFormat,
  withPlayer,
} from './filters'
import type { HistoryFilters, PlayerOption } from './filters'

type BarProps = {
  filters: HistoryFilters
  options: PlayerOption[]
  onChange: (next: HistoryFilters) => void
}

function selectClass(filters: HistoryFilters): string {
  if (filters.playerId === null) return 'hf-select'
  return 'hf-select is-on'
}

export function HistoryFilterBar({ filters, options, onChange }: BarProps) {
  const onFormat = (format: Format) => onChange(toggleFormat(filters, format))
  const onPlayer = (event: ChangeEvent<HTMLSelectElement>) => onChange(withPlayer(filters, event.target.value))
  return (
    <div className="content hf-bar" role="group" aria-label={FILTER_COPY.group}>
      {FORMAT_CHIPS.map((chip) => (
        <button
          key={chip.format}
          type="button"
          className="hf-chip"
          aria-pressed={filters.format === chip.format}
          onClick={() => onFormat(chip.format)}
        >
          {chip.label}
        </button>
      ))}
      <label className={selectClass(filters)}>
        <span className="sr-only">{FILTER_COPY.playerLabel}</span>
        <select value={playerValue(filters)} onChange={onPlayer}>
          <option value={ALL_PLAYERS_VALUE}>{FILTER_COPY.allPlayers}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      {isFiltered(filters) && (
        <button
          type="button"
          className="hf-clear"
          aria-label={FILTER_COPY.clearAll}
          onClick={() => onChange(NO_FILTERS)}
        >
          {FILTER_COPY.clear}
        </button>
      )}
    </div>
  )
}

/** The filtered list is empty: a short line and a way out. */
export function NoFilteredMatch({ onClear }: { onClear: () => void }) {
  return (
    <section className="content hf-empty">
      <p className="hf-empty__text">{FILTER_COPY.empty}</p>
      <Button variant="secondary" inline onClick={onClear}>
        {FILTER_COPY.clearAll}
      </Button>
    </section>
  )
}
