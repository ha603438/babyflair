export type BadgeKind = 'rookie' | 'guest' | 'medal'

export type BadgeProps = {
  kind: BadgeKind
  /** Medal only: 1, 2 or 3 (gold, silver, bronze). */
  rank?: number
}

function medalClass(rank: number | undefined): string {
  if (rank === 1) return 'badge--gold'
  if (rank === 2) return 'badge--silver'
  return 'badge--bronze'
}

/** « ? » rookie circle, « invité » pill or a 1–3 medal circle (spec §5). */
export function Badge({ kind, rank }: BadgeProps) {
  if (kind === 'guest') return <span className="badge badge--guest">invité</span>
  if (kind === 'rookie') {
    return (
      <span className="badge badge--rookie" role="img" aria-label="Pas encore classé">
        ?
      </span>
    )
  }
  return <span className={`badge badge--medal ${medalClass(rank)}`}>{rank}</span>
}
