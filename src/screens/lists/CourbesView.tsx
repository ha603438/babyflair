import { useMemo, useState } from 'react'
import { RatingChart } from '../../charts/RatingChart'
import {
  assignSlot,
  buildChartData,
  chipOrder,
  defaultVisible,
  releaseSlot,
  summarize,
  visibleCurves,
} from '../../charts/curves'
import type { Curve, Slots } from '../../charts/curves'
import { EmptyState } from '../../components/EmptyState'
import { SegmentedControl } from '../../components/SegmentedControl'
import { fmtInt } from '../../format'
import type { PlayerId, RankingTab } from '../../types'
import type { ReplayData, ScreenContext } from './context'
import { CURVE_WORDING, TAB_OPTIONS } from './modeLabels'
import type { CurveWording } from './modeLabels'

// Courbes du classement (`#/courbes`, Stats tab): a compact « Mixte » | « 2V2 » | « 1V1 » selector, name chips
// (legend + toggles), the rating chart and its table view. The visible set lives in component state only; until the
// user touches it, it follows the current top 3. The selector shares the Classement tab (Settings.classementTab):
// `replay` is then the 2V2 / 1V1 ranking, whose « players » are the duos (« A & B ») or the players with a 1v1 match.

export type CourbesViewProps = {
  app: Pick<ScreenContext, 'toast'>
  replay: ReplayData
  /** Player or duo copy (chart label, table column, 8-curve cap, empty state); the Mixte wording when absent. */
  wording?: CurveWording
  /** Selected ranking (« Mixte » when absent); the selector shows only with `onTabChange`. */
  tab?: RankingTab
  onTabChange?: (tab: RankingTab) => void
}

type ModeProps = { tab: RankingTab; onChange: ((tab: RankingTab) => void) | undefined }

/** Kept above the empty state too, so a ranking without matches can be left. */
function ModeSelector({ tab, onChange }: ModeProps) {
  if (onChange === undefined) return null
  return (
    <div className="content courbes-mode">
      <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={onChange} aria-label="Classement" />
    </div>
  )
}

type ChipProps = { name: string; slot: number | undefined; onToggle: () => void }

function CurveChip({ name, slot, onToggle }: ChipProps) {
  if (slot === undefined) {
    return (
      <button type="button" className="curve-chip" aria-pressed={false} onClick={onToggle}>
        <span className="curve-chip__name">{name}</span>
      </button>
    )
  }
  return (
    <button type="button" className={`curve-chip is-on series-${slot}`} aria-pressed onClick={onToggle}>
      <span className="curve-chip__dot" aria-hidden="true" />
      <span className="curve-chip__name">{name}</span>
    </button>
  )
}

type ChipsProps = {
  order: PlayerId[]
  visible: Slots
  nameOf: (id: PlayerId) => string
  onToggle: (id: PlayerId) => void
  onTop: () => void
  onNone: () => void
}

function Chips({ order, visible, nameOf, onToggle, onTop, onNone }: ChipsProps) {
  return (
    <div className="content curve-chips" role="group" aria-label="Courbes affichées">
      {order.map((id) => (
        <CurveChip key={id} name={nameOf(id)} slot={visible.get(id)} onToggle={() => onToggle(id)} />
      ))}
      <button type="button" className="curve-chips__action" onClick={onTop}>
        Top 3
      </button>
      <button type="button" className="curve-chips__action" onClick={onNone}>
        Aucun
      </button>
    </div>
  )
}

function TableRow({ curve }: { curve: Curve }) {
  const summary = summarize(curve.series)
  return (
    <tr>
      <th scope="row">
        <span className="curve-table__name">
          <span className={`series-dot series-${curve.slot}`} aria-hidden="true" />
          {curve.name}
        </span>
      </th>
      <td>{fmtInt(summary.current)}</td>
      <td>{fmtInt(summary.high)}</td>
      <td>{fmtInt(summary.low)}</td>
      <td>{fmtInt(summary.played)}</td>
    </tr>
  )
}

function CurveTable({ curves, column }: { curves: Curve[]; column: string }) {
  if (curves.length === 0) return <p className="curve-table__empty">Aucune courbe affichée.</p>
  const rows = [...curves].sort((a, b) => summarize(b.series).current - summarize(a.series).current)
  return (
    <table className="curve-table">
      <thead>
        <tr>
          <th scope="col">{column}</th>
          <th scope="col">Classement actuel</th>
          <th scope="col">Plus haut</th>
          <th scope="col">Plus bas</th>
          <th scope="col">Matchs</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((curve) => (
          <TableRow key={curve.playerId} curve={curve} />
        ))}
      </tbody>
    </table>
  )
}

function tableLabel(open: boolean): string {
  if (open) return 'Masquer le tableau'
  return 'Voir en tableau'
}

function TableSection({ curves, column }: { curves: Curve[]; column: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="content curve-table-block">
      <button type="button" className="curve-table-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {tableLabel(open)}
      </button>
      {open && <CurveTable curves={curves} column={column} />}
    </div>
  )
}

type BodyProps = Pick<CourbesViewProps, 'app' | 'replay'> & { wording: CurveWording }

function CurvesBody({ app, replay, wording }: BodyProps) {
  const data = useMemo(() => buildChartData(replay.result.byPlayer, replay.matches), [replay.result, replay.matches])
  const order = useMemo(() => chipOrder(replay.ranking, data.series), [replay.ranking, data.series])
  const top = useMemo(() => defaultVisible(replay.ranking, data.series), [replay.ranking, data.series])
  // null = untouched: follow the top 3 (it may still change while the shared store loads).
  const [chosen, setChosen] = useState<Slots | null>(null)
  const visible = chosen ?? top
  const nameOf = (id: PlayerId): string => replay.players.get(id)?.name ?? '?'
  const curves = visibleCurves(visible, data, nameOf)

  function toggle(id: PlayerId): void {
    if (visible.has(id)) {
      setChosen(releaseSlot(visible, id))
      return
    }
    const next = assignSlot(visible, id)
    if (next === null) {
      app.toast.show({ text: wording.cap })
      return
    }
    setChosen(next)
  }

  if (data.matches.length === 0) {
    return <EmptyState title="Pas encore de courbe" body={wording.emptyBody} />
  }
  return (
    <>
      <Chips
        order={order}
        visible={visible}
        nameOf={nameOf}
        onToggle={toggle}
        onTop={() => setChosen(null)}
        onNone={() => setChosen(new Map())}
      />
      <div className="content curve-chart">
        <div className="card">
          <RatingChart
            curves={curves}
            matches={data.matches}
            onHide={(id) => setChosen(releaseSlot(visible, id))}
            noun={wording.noun}
          />
        </div>
      </div>
      <TableSection curves={curves} column={wording.column} />
    </>
  )
}

export function CourbesView(props: CourbesViewProps) {
  const { app, replay, wording = CURVE_WORDING.mixte, tab = 'mixte', onTabChange } = props
  // Keyed by tab: the chosen curves of one ranking mean nothing in another (the selector itself stays mounted).
  return (
    <div className="lists-screen courbes">
      <ModeSelector tab={tab} onChange={onTabChange} />
      <CurvesBody key={tab} app={app} replay={replay} wording={wording} />
    </div>
  )
}
