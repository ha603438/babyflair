import { Slot } from '../../components/Slot'
import { visibleSlots } from '../../store'
import type { DraftAction } from '../../store'
import type { Draft, Player, PlayerId } from '../../types'
import { TEAM_A_FIRST_SLOT, TEAM_B_FIRST_SLOT } from './draftMatch'

export type RosterSlotsProps = {
  draft: Draft
  dispatch: (action: DraftAction) => void
  playersById: Map<PlayerId, Player>
  /** Adds `.is-shaking` (entry.css, 200 ms) after a chip tap with no slot to fill. */
  shaking?: boolean
}

const TEAMS = [
  { team: 1, caption: 'BLANCS', first: TEAM_A_FIRST_SLOT },
  { team: 2, caption: 'NOIRS', first: TEAM_B_FIRST_SLOT },
] as const

type TeamColumnProps = (typeof TEAMS)[number] & Omit<RosterSlotsProps, 'shaking'>

function playerAt(draft: Draft, index: number, playersById: Map<PlayerId, Player>): Player | undefined {
  const id = draft.slots[index]
  if (id === null || id === undefined) return undefined
  return playersById.get(id)
}

function slotsClassOf(shaking: boolean): string {
  if (shaking) return 'match-slots entry-slots is-shaking'
  return 'match-slots entry-slots'
}

function TeamColumn({ team, caption, first, draft, dispatch, playersById }: TeamColumnProps) {
  // 2v2 shows both slots of the column, 1v1 only the top one (slots 1 and 3 are kept in memory, hidden).
  const indices = visibleSlots(draft.format).filter((index) => index >= first && index < first + 2)
  return (
    <div className="match-team">
      <p className={`entry-slots__caption entry-slots__caption--team${team}`}>{caption}</p>
      <div className="match-team__slots">
        {indices.map((index) => (
          <Slot
            key={index}
            team={team}
            player={playerAt(draft, index, playersById)}
            active={draft.activeSlot === index}
            onActivate={() => dispatch({ type: 'setActiveSlot', index })}
            onClear={() => dispatch({ type: 'clearSlot', index })}
          />
        ))}
      </div>
    </div>
  )
}

/** The two team columns of slots (spec §4 step A, 2): captions « ÉQUIPE 1 » / « ÉQUIPE 2 », 1 or 2 rows per format. */
export function RosterSlots({ draft, dispatch, playersById, shaking = false }: RosterSlotsProps) {
  return (
    <div className={slotsClassOf(shaking)}>
      {TEAMS.map((column) => (
        <TeamColumn key={column.team} {...column} draft={draft} dispatch={dispatch} playersById={playersById} />
      ))}
    </div>
  )
}
