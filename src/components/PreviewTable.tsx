import { Fragment } from 'react'
import type { Player, PlayerId, PreviewExact, PreviewWhatIf, Target, Team } from '../types'
import { fmtDelta, fmtPercent } from '../format'

/** Only the label is needed here, so the `teams` tuple built for ScoreGrid can be passed as is. */
export type PreviewTeam = { label: string }

type PreviewCommon = {
  /** Index 0 is team A (Équipe 1), index 1 is team B (Équipe 2). */
  teams: readonly [PreviewTeam, PreviewTeam]
  /** [expectedA, expectedB], each in 0..1, from the engine preview. */
  expected: readonly [number, number]
  target: Target
  players: Map<PlayerId, Player>
}

export type PreviewTableProps = PreviewCommon &
  ({ mode: 'whatif'; rows: PreviewWhatIf['rows'] } | { mode: 'exact'; rows: PreviewExact['rows'] })

const TEAM_ORDER: Record<Team, number> = { A: 0, B: 1 }

function sortedByTeam<R extends { team: Team }>(rows: readonly R[]): R[] {
  return [...rows].sort((a, b) => TEAM_ORDER[a.team] - TEAM_ORDER[b.team])
}

function nameOf(players: Map<PlayerId, Player>, id: PlayerId): string {
  return players.get(id)?.name ?? '?'
}

function toneOf(delta: number): string {
  if (delta > 0) return 'preview__delta--pos'
  if (delta < 0) return 'preview__delta--neg'
  return 'preview__delta--zero'
}

function deltaAria(delta: number): string {
  if (delta > 0) return `plus ${delta} points`
  if (delta < 0) return `moins ${Math.abs(delta)} points`
  return '0 point'
}

function Delta({ value }: { value: number }) {
  return (
    <span className={`preview__delta ${toneOf(value)}`} aria-label={deltaAria(value)}>
      {fmtDelta(value)}
    </span>
  )
}

type WhatIfProps = PreviewCommon & { rows: PreviewWhatIf['rows'] }

function WhatIfTable({ teams, expected, target, players, rows }: WhatIfProps) {
  const minimal = target - 1
  return (
    <>
      <p className="preview__chance">
        <span className="preview__flair">Flair-o-mètre</span> {teams[0].label} : {fmtPercent(expected[0])} ·{' '}
        {teams[1].label} : {fmtPercent(expected[1])}
      </p>
      <table className="preview__table">
        <colgroup>
          <col className="preview__col-name" />
          <col className="preview__col-value" />
          <col className="preview__col-value" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">
              Si victoire {target}-{minimal}
            </th>
            <th scope="col">
              Si défaite {minimal}-{target}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedByTeam(rows).map((row) => (
            <tr key={row.playerId} className={`preview__row preview__row--${row.team}`}>
              <th scope="row">{nameOf(players, row.playerId)}</th>
              <td>
                <Delta value={row.winDelta} />
              </td>
              <td>
                <Delta value={row.lossDelta} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

type ExactProps = { players: Map<PlayerId, Player>; rows: PreviewExact['rows'] }

function ExactLine({ players, rows }: ExactProps) {
  return (
    <p className="preview__exact">
      {sortedByTeam(rows).map((row, index) => (
        <Fragment key={row.playerId}>
          {index > 0 && (
            <span className="preview__sep" aria-hidden="true">
              {' · '}
            </span>
          )}
          <span className={`preview__item ${toneOf(row.delta)}`}>
            {nameOf(players, row.playerId)} <Delta value={row.delta} />
          </span>
        </Fragment>
      ))}
    </p>
  )
}

function PreviewBody(props: PreviewTableProps) {
  if (props.mode === 'exact') return <ExactLine players={props.players} rows={props.rows} />
  return (
    <WhatIfTable
      teams={props.teams}
      expected={props.expected}
      target={props.target}
      players={props.players}
      rows={props.rows}
    />
  )
}

/**
 * Step B preview under the ScoreGrid. `whatif` (no score yet): chance line + 4 × 3 table at the minimal margin.
 * `exact` (score chosen): one line of the deltas the saved match will produce. Numbers come from the engine.
 */
export function PreviewTable(props: PreviewTableProps) {
  return (
    <div className={`preview preview--${props.mode}`} aria-live="polite">
      <PreviewBody {...props} />
    </div>
  )
}
