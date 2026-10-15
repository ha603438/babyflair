import type { ReactNode } from 'react'
import { Badge } from '../../components/Badge'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { ModeRankRow } from '../../components/ModeRankRow'
import type { RankRowVariant } from '../../components/rows'
import { SectionHeader } from '../../components/SectionHeader'
import { MODE_RANKED_AFTER } from '../../rating/modes'
import type { ModeReplay } from '../../rating/modes'
import { hrefOf } from '../../router'
import type { Route } from '../../router'
import type { Player } from '../../types'
import { MODE_EMPTY, MODE_OBSERVATION, MODE_ROOKIES_SUBTITLE } from './modeLabels'

// Body of the « 2V2 » and « 1V1 » Classement tabs: same sections as « Mixte » (classés, pas encore classés,
// inactifs), ranked after 3 matches. A 2V2 row is a duo « A & B » linking to its page; a 1V1 row links to the player.

export type ModeBodyProps = {
  mode: ModeReplay
  now: Date
  /** Entity ids to flash after a match: player ids, and the duo ids of the two teams. */
  highlight: ReadonlySet<string>
}

function routeOf(mode: ModeReplay, id: string): Route {
  if (mode.format === '2v2') return { name: 'duo', id }
  return { name: 'joueur', id }
}

function rankOf(variant: RankRowVariant, index: number): number | undefined {
  if (variant !== 'ranked') return undefined
  return index + 1
}

/** A duo is never a guest (its synthetic player says so), so the badge only ever shows on a 1V1 player. */
function EntityName({ entity }: { entity: Player }) {
  return (
    <>
      <span className="row-name">{entity.name}</span>
      {entity.isGuest && <Badge kind="guest" />}
    </>
  )
}

type RowsProps = ModeBodyProps & { ids: string[]; variant: RankRowVariant }

function modeRow(id: string, index: number, { mode, now, highlight, variant }: RowsProps): ReactNode {
  const entity = mode.entities.get(id)
  const stats = mode.result.byPlayer.get(id)
  if (entity === undefined || stats === undefined) return null
  return (
    <ModeRankRow
      key={id}
      title={<EntityName entity={entity} />}
      stats={stats}
      variant={variant}
      rank={rankOf(variant, index)}
      rankedAfter={MODE_RANKED_AFTER}
      now={now}
      href={hrefOf(routeOf(mode, id))}
      highlight={highlight.has(id)}
    />
  )
}

function ModeRows(props: RowsProps) {
  if (props.ids.length === 0) return null
  return <div className="rows">{props.ids.map((id, index) => modeRow(id, index, props))}</div>
}

function ModeSection({ title, subtitle, ...rows }: RowsProps & { title: string; subtitle: string }) {
  if (rows.ids.length === 0) return null
  return (
    <section>
      <SectionHeader title={title} subtitle={subtitle} />
      <ModeRows {...rows} />
    </section>
  )
}

function ModeObservation({ mode }: { mode: ModeReplay }) {
  if (mode.ranking.ranked.length > 0 || mode.ranking.rookies.length === 0) return null
  return (
    <div className="content lists-block">
      <Card>
        <p className="obs-text">{MODE_OBSERVATION[mode.format]}</p>
      </Card>
    </div>
  )
}

export function ModeBody(props: ModeBodyProps) {
  const { mode } = props
  if (mode.matches.length === 0) {
    const empty = MODE_EMPTY[mode.format]
    return <EmptyState compact title={empty.title} body={empty.body} />
  }
  return (
    <>
      <ModeObservation mode={mode} />
      <ModeRows {...props} ids={mode.ranking.ranked} variant="ranked" />
      <ModeSection
        {...props}
        title="Pas encore classés"
        subtitle={MODE_ROOKIES_SUBTITLE}
        ids={mode.ranking.rookies}
        variant="rookie"
      />
      <ModeSection
        {...props}
        title="Partis prendre l’flair"
        subtitle="sans match depuis 30 jours"
        ids={mode.ranking.inactive}
        variant="inactive"
      />
    </>
  )
}
