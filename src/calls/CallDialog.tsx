import { useId, useState } from 'react'
import { Button } from '../components/Button'
import { useDialog } from '../components/useDialog'
import type { Player, PlayerId } from '../types'
import { CALL_COPY, canFormTeams, rosterLine } from './calls'
import type { Roster } from './calls'
import { PlayerPicker } from './PlayerPicker'

export type CallDialogProps = {
  open: boolean
  /** Null once the call is closed or expired: the dialog then reads « Appel terminé ». */
  roster: Roster | null
  players: Player[]
  viewerId: PlayerId | undefined
  busy: boolean
  onJoin: (playerId: PlayerId) => void
  onFormTeams: () => void
  onDismiss: () => void
}

function ParticipantList({ roster }: { roster: Roster }) {
  if (roster.participants.length === 0) return null
  return (
    <ul className="call-dialog__list">
      {roster.participants.map((player) => (
        <li key={player.id}>{player.name}</li>
      ))}
    </ul>
  )
}

function OverBody({ onDismiss }: { onDismiss: () => void }) {
  return (
    <>
      <p className="dialog-text">Il est trop tard pour celui-là : propose-en un autre depuis le classement.</p>
      <div className="dialog-actions dialog-actions-single">
        <Button variant="primary" size="md" onClick={onDismiss}>
          OK
        </Button>
      </div>
    </>
  )
}

type OpenBodyProps = Omit<CallDialogProps, 'open' | 'roster'> & { roster: Roster }

function OpenBody({ roster, players, viewerId, busy, onJoin, onFormTeams, onDismiss }: OpenBodyProps) {
  const [picked, setPicked] = useState<PlayerId | undefined>(viewerId)
  const taken = new Set(roster.participantIds)
  const value = picked !== undefined && !taken.has(picked) ? picked : undefined
  const full = canFormTeams(roster.participantIds.length)
  const inCall = viewerId !== undefined && taken.has(viewerId)
  return (
    <>
      <div className="dialog-text">
        <p>{rosterLine(roster.organizer?.name, roster.participantIds.length)}</p>
        <ParticipantList roster={roster} />
        {!full && (
          <div className="call-dialog__picker">
            <PlayerPicker players={players} value={value} taken={taken} onChange={setPicked} />
          </div>
        )}
      </div>
      <div className="dialog-actions">
        <Button variant="secondary" size="md" onClick={onDismiss}>
          {CALL_COPY.notThisTime}
        </Button>
        {full && (
          <Button variant="primary" size="md" disabled={busy} onClick={onFormTeams}>
            {CALL_COPY.formTeams}
          </Button>
        )}
        {!full && (
          <Button
            variant="primary"
            size="md"
            disabled={value === undefined || busy || inCall}
            onClick={() => {
              if (value !== undefined) onJoin(value)
            }}
          >
            {CALL_COPY.join}
          </Button>
        )}
      </div>
    </>
  )
}

/** « Chaud pour prendre une branlée ? »: organizer, roster x/4, name picker, join / pass, « Former les équipes ». */
export function CallDialog(props: CallDialogProps) {
  const { open, roster, onDismiss } = props
  const { ref, onClose, onClick } = useDialog(open, onDismiss)
  const titleId = useId()
  const title = roster === null ? CALL_COPY.over : CALL_COPY.hot
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose} onClick={onClick}>
      <div className="dialog-body">
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        {roster === null && <OverBody onDismiss={onDismiss} />}
        {roster !== null && <OpenBody {...props} roster={roster} />}
      </div>
    </dialog>
  )
}
