export type AddChipProps = { onClick: () => void }

/** Last cell of the chip grid: opens the inline player form (the screen owns the form). Same box as Chip. */
export function AddChip({ onClick }: AddChipProps) {
  return (
    <button type="button" className="chip chip--add" onClick={onClick}>
      <span className="chip__name">+ Nouveau joueur</span>
    </button>
  )
}
