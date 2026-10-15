import { useId } from 'react'
import { Button } from '../components/Button'
import { useDialog } from '../components/useDialog'
import type { Player, PlayerId } from '../types'
import { CALL_COPY, canFormTeams, hotListCaption, nameFor, rosterLine } from './calls'
import type { CallResponses, Roster } from './calls'

export type CallDialogProps = {
  open: boolean
  /** Null once the call is closed or expired: the dialog then reads « Appel terminé ». */
  roster: Roster | null
  /** « Chauds » / « Pas chauds » / « Pas encore répondu » (calls.ts callResponses); unused once the call is over. */
  responses: CallResponses
  /** This phone's player profile; undefined for a visitor, who sees the roster but cannot answer. */
  viewerId: PlayerId | undefined
  busy: boolean
  /** « Chauuud 🔥 »: answers 'in' with this phone's profile. */
  onJoin: () => void
  /** « Non je fais semblant de bosser »: answers 'out' with this phone's profile, then closes. */
  onDecline: () => void
  onFormTeams: () => void
  /** Closes without answering (backdrop, « Pas cette fois », a visitor's « Non je fais semblant de bosser »). */
  onDismiss: () => void
  /** Visitor: back to « Qui es-tu ? » to be able to answer. */
  onChooseProfile: () => void
}

type Tone = 'in' | 'out' | 'pending'

type NameListProps = { caption: string; players: Player[]; viewerId: PlayerId | undefined; tone: Tone }

/** A small uppercase caption and the names as pills, wrapped: the dialog stays short on a phone. */
function NameList({ caption, players, viewerId, tone }: NameListProps) {
  return (
    <div className="call-dialog__group">
      <p className="call-dialog__group-caption">{caption}</p>
      {players.length > 0 && (
        <ul className={`call-dialog__names call-dialog__names--${tone}`}>
          {players.map((player) => (
            <li key={player.id} className="call-dialog__name">
              {nameFor(player, viewerId)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type ResponseListsProps = { responses: CallResponses; inCount: number; viewerId: PlayerId | undefined }

/** « Chauds · x/4 » always; « Pas chauds » and « Pas encore répondu » only when someone is in them. */
function ResponseLists({ responses, inCount, viewerId }: ResponseListsProps) {
  return (
    <div className="call-dialog__lists">
      <NameList caption={hotListCaption(inCount)} players={responses.in} viewerId={viewerId} tone="in" />
      {responses.out.length > 0 && (
        <NameList caption={CALL_COPY.notHotList} players={responses.out} viewerId={viewerId} tone="out" />
      )}
      {responses.pending.length > 0 && (
        <NameList caption={CALL_COPY.pendingList} players={responses.pending} viewerId={viewerId} tone="pending" />
      )}
    </div>
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

/** Why « Chauuud 🔥 » is disabled: already in, or the 4 places are taken. Null while it can be tapped. */
function joinBlockedCaption(inCall: boolean, full: boolean): string | null {
  if (inCall) return CALL_COPY.alreadyIn
  if (full) return CALL_COPY.full
  return null
}

type AnswerProps = Pick<BodyProps, 'roster' | 'busy' | 'onJoin' | 'onDecline'> & { viewerId: PlayerId }

/** « Chauuud 🔥 » answers 'in' while there is room; « Non je fais semblant de bosser » answers 'out', always. */
function AnswerActions({ roster, viewerId, busy, onJoin, onDecline }: AnswerProps) {
  const inCall = roster.participantIds.includes(viewerId)
  const blocked = joinBlockedCaption(inCall, canFormTeams(roster.participantIds.length))
  return (
    <>
      <div className="dialog-actions dialog-actions-single">
        <Button variant="primary" size="md" disabled={busy || blocked !== null} onClick={onJoin}>
          {CALL_COPY.join}
        </Button>
        <Button variant="secondary" size="md" onClick={onDecline}>
          {CALL_COPY.decline}
        </Button>
      </div>
      {blocked !== null && <p className="call-dialog__caption">{blocked}</p>}
    </>
  )
}

/** « Former les équipes » is for the 4 players in the call; anyone else answers (or picks a profile first). */
function Actions(props: BodyProps) {
  const { roster, viewerId } = props
  if (viewerId === undefined) return <VisitorActions {...props} />
  const inCall = roster.participantIds.includes(viewerId)
  if (inCall && canFormTeams(roster.participantIds.length)) return <FullActions {...props} />
  return <AnswerActions {...props} viewerId={viewerId} />
}

function OpenBody(props: BodyProps) {
  const { roster, responses, viewerId } = props
  return (
    <>
      <p className="dialog-text">{rosterLine(roster.organizer?.name, roster.participantIds.length)}</p>
      <ResponseLists responses={responses} inCount={roster.participantIds.length} viewerId={viewerId} />
      <Actions {...props} />
    </>
  )
}

/** « Chaud pour prendre une branlée ? »: organizer, who is in / out / yet to answer, the answer, then form teams. */
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
