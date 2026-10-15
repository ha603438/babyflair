import { useEffect, useState } from 'react'
import { profileId } from '../profile/profile'
import { useChooseProfile, useProfile, useWriteGuard } from '../profile/useWriteGuard'
import { useReplay } from '../rating/useReplay'
import { navigate } from '../router'
import type { Route } from '../router'
import { useAppState } from '../store'
import type { PlayerId } from '../types'
import { CallDialog } from './CallDialog'
import { callResponses, NO_RESPONSES, rosterOf } from './calls'
import { seenCalls } from './seen'
import { clearRequestedCall, requestCall, useRequestedCall } from './signal'
import { useCalls } from './useCalls'
import { callToShow } from './watch'
import type { WatchOutput } from './watch'

// Expiry is noticed within a minute even without a sync (local mode, offline).
const NOW_REFRESH_MS = 60_000

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), NOW_REFRESH_MS)
    return () => clearInterval(timer)
  }, [])
  return now
}

function forcedIdOf(route: Route, requested: { callId: string } | null): string | undefined {
  if (route.name === 'appel') return route.id
  return requested?.callId
}

const ANSWER_LABEL = "répondre à l'appel"

type ShownCallProps = { shown: NonNullable<WatchOutput>; viewerId: PlayerId | undefined; onDismiss: () => void }

/**
 * The dialog of the call on screen, with its lists rebuilt from the store on every sync (20 s poll, own writes). The
 * replay (for the inactive players left out of « Pas encore répondu ») only runs while a call is shown.
 */
function ShownCall({ shown, viewerId, onDismiss }: ShownCallProps) {
  const { store } = useAppState()
  const calls = useCalls()
  const guard = useWriteGuard()
  const chooseProfile = useChooseProfile()
  const { result, players } = useReplay()
  const { id, call } = shown
  const { callPlayers } = store
  const roster = call === null ? null : rosterOf(call, callPlayers, players)
  const responses = call === null ? NO_RESPONSES : callResponses(call, callPlayers, store.players, result.byPlayer)

  function formTeams(): void {
    if (call === null) return
    onDismiss()
    calls.formTeams(call)
  }

  // A visitor never gets here (its « Non » only dismisses): the answer is recorded, then the dialog closes as before.
  function decline(): void {
    guard(ANSWER_LABEL, () => calls.respond(id, 'out'))
    onDismiss()
  }

  // The call is asked for again so it reopens once the profile is chosen (it was already marked as seen).
  function answerWithProfile(): void {
    requestCall(id)
    chooseProfile()
  }

  return (
    <CallDialog
      open
      roster={roster}
      responses={responses}
      viewerId={viewerId}
      busy={calls.busy}
      onJoin={() => guard(ANSWER_LABEL, () => calls.respond(id, 'in'))}
      onDecline={decline}
      onFormTeams={() => guard('former les équipes', formTeams)}
      onDismiss={onDismiss}
      onChooseProfile={answerWithProfile}
    />
  )
}

/**
 * Mounted once in the shell: opens « Chaud pour prendre une branlée ? » for the office's open call (once per call
 * per phone), for `#/appel/:id` (notification click) and for « Proposer un baby » while a call is already open.
 */
export function CallWatcher({ route }: { route: Route }) {
  const { store, sync } = useAppState()
  const requested = useRequestedCall()
  const now = useNow()
  const viewerId = profileId(useProfile())
  const awaitingFirstSync = sync.mode === 'shared' && sync.lastSyncAt === undefined
  // The call on screen stays there until dismissed: being marked as seen only stops it from opening again later
  // (without this, the next render — a poll, the clock — closed the dialog right after it opened).
  const [onScreenId, setOnScreenId] = useState<string | undefined>(undefined)
  const shown = callToShow({
    calls: store.calls,
    callPlayers: store.callPlayers,
    viewerId,
    now,
    forcedId: forcedIdOf(route, requested),
    awaitingFirstSync,
    hasSeen: (id) => id !== onScreenId && seenCalls().has(id),
  })
  const shownId = shown?.id
  // Adjusted during render (React's pattern for state derived from a change), not in an effect.
  if (shownId !== undefined && shownId !== onScreenId) setOnScreenId(shownId)

  useEffect(() => {
    if (shownId === undefined) return
    seenCalls().add(shownId)
  }, [shownId])

  function dismiss(): void {
    setOnScreenId(undefined)
    if (shownId !== undefined) seenCalls().add(shownId)
    clearRequestedCall()
    if (route.name === 'appel') navigate({ name: 'classement' })
  }

  if (shown === null) return null
  return <ShownCall key={shown.id} shown={shown} viewerId={viewerId} onDismiss={dismiss} />
}
