import type { Player } from '../types'

export type SlotProps = {
  team: 1 | 2
  player?: Player
  active: boolean
  onActivate: () => void
  onClear: () => void
}

const NAME_MAX_CHARS = 12

// Same rule as Chip.tsx (12 code points, full name in the accessible name); duplicated because a component file
// may only export components and types.
function truncateName(name: string): string {
  const chars = Array.from(name)
  if (chars.length <= NAME_MAX_CHARS) return name
  return `${chars.slice(0, NAME_MAX_CHARS).join('').trimEnd()}…`
}

function classNameOf(team: 1 | 2, filled: boolean, active: boolean): string {
  const parts = ['slot', `slot--team${team}`, filled ? 'is-filled' : 'is-empty']
  if (active) parts.push('is-active')
  return parts.join(' ')
}

function PlusIcon() {
  return (
    <svg className="slot__plus" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SlotContent({ player, active }: { player?: Player; active: boolean }) {
  if (player !== undefined) return <span className="slot__name">{truncateName(player.name)}</span>
  if (active) return <span className="slot__placeholder">Choisis un joueur</span>
  return <PlusIcon />
}

/**
 * One roster position of step A. Empty = dashed « + »; active = accent border (pulse while empty);
 * filled = team bar + name + « × ». Tapping the name activates the slot without clearing it (next chip replaces).
 */
export function Slot({ team, player, active, onActivate, onClear }: SlotProps) {
  const filled = player !== undefined
  // The empty, non-active slot only shows « + »: give it the same accessible name as the active placeholder.
  const mainLabel = filled ? player.name : 'Choisis un joueur'
  return (
    <div className={classNameOf(team, filled, active)}>
      <button type="button" className="slot__main" aria-label={mainLabel} aria-pressed={active} onClick={onActivate}>
        <SlotContent player={player} active={active} />
      </button>
      {filled && (
        <button type="button" className="slot__clear" aria-label={`Retirer ${player.name}`} onClick={onClear}>
          <CloseIcon />
        </button>
      )}
    </div>
  )
}
