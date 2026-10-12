import { useEffect, useMemo, useState } from 'react'
import { profileId } from '../profile/profile'
import { useChooseProfile, useProfile, useWriteGuard } from '../profile/useWriteGuard'
import { navigate } from '../router'
import type { Route } from '../router'
import { useAppState } from '../store'
import type { Player, PlayerId } from '../types'
import { CallDialog } from './CallDialog'
import { rosterOf } from './calls'
import { seenCalls } from './seen'
import { clearRequestedCall, requestCall, useRequestedCall } from './signal'
import { useCalls } from './useCalls'
import { callToShow } from './watch'

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

/**
 * Mounted once in the shell: opens « Chaud pour prendre une branlée ? » for the office's open call (once per call
 * per phone), for `#/appel/:id` (notification click) and for « Proposer un baby » while a call is already open.
 */
export function CallWatcher({ route }: { route: Route }) {
  const { store, sync } = useAppState()
  const calls = useCalls()
  const requested = useRequestedCall()
  const now = useNow()
  const guard = useWriteGuard()
  const chooseProfile = useChooseProfile()
  const viewerId = profileId(useProfile())
  const playersById = useMemo(() => new Map<PlayerId, Player>(store.players.map((p) => [p.id, p])), [store.players])
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
  const { id, call } = shown
  const roster = call === null ? null : rosterOf(call, store.callPlayers, playersById)

  function formTeams(): void {
    if (call === null) return
    dismiss()
    calls.formTeams(call)
  }

  // The call is asked for again so it reopens once the profile is chosen (it was already marked as seen).
  function answerWithProfile(): void {
    requestCall(id)
    chooseProfile()
  }

  return (
    <CallDialog
      key={id}
      open
      roster={roster}
      viewerId={viewerId}
      busy={calls.busy}
      onJoin={() => guard("répondre à l'appel", () => calls.join(id))}
      onFormTeams={() => guard('former les équipes', formTeams)}
      onDismiss={dismiss}
      onChooseProfile={answerWithProfile}
    />
  )
}
