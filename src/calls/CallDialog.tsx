import { useId } from 'react'
import { Button } from '../components/Button'
import { useDialog } from '../components/useDialog'
import type { PlayerId } from '../types'
import { CALL_COPY, canFormTeams, rosterLine } from './calls'
import type { Roster } from './calls'

export type CallDialogProps = {
  open: boolean
  /** Null once the call is closed or expired: the dialog then reads « Appel terminé ». */
  roster: Roster | null
  /** This phone's player profile; undefined for a visitor, who sees the roster but cannot answer. */
  viewerId: PlayerId | undefined
  busy: boolean
  /** Joins with this phone's profile. */
  onJoin: () => void
  onFormTeams: () => void
  onDismiss: () => void
  /** Visitor: back to « Qui es-tu ? » to be able to answer. */
  onChooseProfile: () => void
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

type BodyProps = Omit<CallDialogProps, 'open' | 'roster'> & { roster: Roster }

function FullActions({ busy, onFormTeams, onDismiss }: Pick<BodyProps, 'busy' | 'onFormTeams' | 'onDismiss'>) {
  return (
    <div className="dialog-actions">
      <Button variant="secondary" size="md" onClick={onDismiss}>
        {CALL_COPY.notThisTime}
      </Button>
      <Button variant="primary" size="md" disabled={busy} onClick={onFormTeams}>
        {CALL_COPY.formTeams}
      </Button>
    </div>
  )
}

function VisitorActions({ onDismiss, onChooseProfile }: Pick<BodyProps, 'onDismiss' | 'onChooseProfile'>) {
  return (
    <div className="dialog-actions dialog-actions-single">
      <Button variant="primary" size="md" onClick={onChooseProfile}>
        {CALL_COPY.chooseToAnswer}
      </Button>
      <Button variant="secondary" size="md" onClick={onDismiss}>
        {CALL_COPY.decline}
      </Button>
    </div>
  )
}

type AnswerProps = Pick<BodyProps, 'roster' | 'busy' | 'onJoin' | 'onDismiss'> & { viewerId: PlayerId }

/** « Chauuud 🔥 » joins with this phone's profile; « Non je fais semblant de bosser » only closes the dialog. */
function AnswerActions({ roster, viewerId, busy, onJoin, onDismiss }: AnswerProps) {
  const inCall = roster.participantIds.includes(viewerId)
  return (
    <>
      <div className="dialog-actions dialog-actions-single">
        <Button variant="primary" size="md" disabled={busy || inCall} onClick={onJoin}>
          {CALL_COPY.join}
        </Button>
        <Button variant="secondary" size="md" onClick={onDismiss}>
          {CALL_COPY.decline}
        </Button>
      </div>
      {inCall && <p className="call-dialog__caption">{CALL_COPY.alreadyIn}</p>}
    </>
  )
}

function Actions(props: BodyProps) {
  if (canFormTeams(props.roster.participantIds.length)) return <FullActions {...props} />
  if (props.viewerId === undefined) return <VisitorActions {...props} />
  return <AnswerActions {...props} viewerId={props.viewerId} />
}

function OpenBody(props: BodyProps) {
  const { roster } = props
  return (
    <>
      <div className="dialog-text">
        <p>{rosterLine(roster.organizer?.name, roster.participantIds.length)}</p>
        <ParticipantList roster={roster} />
      </div>
      <Actions {...props} />
    </>
  )
}

/** « Chaud pour prendre une branlée ? »: organizer, roster x/4, answer as this phone's profile, then form teams. */
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
