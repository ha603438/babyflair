import type { Player } from '../types'

export type ChipState = 'default' | 'team1' | 'team2'

export type ChipProps = {
  player: Player
  state: ChipState
  inactive?: boolean
  /** Not selectable (already in the call); the chip stays visible so the roster reads at a glance. */
  disabled?: boolean
  onClick: () => void
}

const NAME_MAX_CHARS = 12

// Spec §5: names are cut at 12 characters (code points, so a leading emoji is not split). The full name stays in
// the accessible name. Duplicated in Slot.tsx on purpose: a component file may only export components and types.
function truncateName(name: string): string {
  const chars = Array.from(name)
  if (chars.length <= NAME_MAX_CHARS) return name
  return `${chars.slice(0, NAME_MAX_CHARS).join('').trimEnd()}…`
}

function badgeOf(state: ChipState): string | null {
  if (state === 'team1') return '1'
  if (state === 'team2') return '2'
  return null
}

function classNameOf(state: ChipState, inactive: boolean): string {
  const parts = ['chip']
  if (state !== 'default') parts.push(`chip--${state}`)
  if (inactive) parts.push('is-inactive')
  return parts.join(' ')
}

function accessibleName(player: Player): string {
  if (player.isGuest) return `${player.name}, invité`
  return player.name
}

/** One player in the bottom-anchored grid of step A. Pressed = placed in a slot (badge « 1 » / « 2 »). */
export function Chip({ player, state, inactive = false, disabled = false, onClick }: ChipProps) {
  const badge = badgeOf(state)
  return (
    <button
      type="button"
      className={classNameOf(state, inactive)}
      aria-pressed={badge !== null}
      aria-label={accessibleName(player)}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="chip__name">{truncateName(player.name)}</span>
      {player.isGuest && <span className="chip__tag">invité</span>}
      {badge !== null && (
        <span className="chip__badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  )
}
