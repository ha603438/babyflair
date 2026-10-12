import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../router'
import type { Route } from '../router'
import { useAppState } from '../store'
import type { Player, PlayerId } from '../types'
import { CallDialog } from './CallDialog'
import { rosterOf } from './calls'
import { seenCalls } from './seen'
import { clearRequestedCall, useRequestedCall } from './signal'
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
  const viewerId = store.settings.myPlayerId
  const playersById = useMemo(() => new Map<PlayerId, Player>(store.players.map((p) => [p.id, p])), [store.players])
  const awaitingFirstSync = sync.mode === 'shared' && sync.lastSyncAt === undefined
  const shown = callToShow({
    calls: store.calls,
    callPlayers: store.callPlayers,
    viewerId,
    now,
    forcedId: forcedIdOf(route, requested),
    awaitingFirstSync,
    hasSeen: (id) => seenCalls().has(id),
  })
  const shownId = shown?.id

  useEffect(() => {
    if (shownId === undefined) return
    seenCalls().add(shownId)
  }, [shownId])

  function dismiss(): void {
    if (shownId !== undefined) seenCalls().add(shownId)
    clearRequestedCall()
    if (route.name === 'appel') navigate({ name: 'classement' })
  }

  if (shown === null) return null
  const roster = shown.call === null ? null : rosterOf(shown.call, store.callPlayers, playersById)
  return (
    <CallDialog
      key={shown.id}
      open
      roster={roster}
      players={store.players}
      viewerId={viewerId}
      busy={calls.busy}
      onJoin={(playerId) => calls.join(shown.id, playerId)}
      onFormTeams={() => {
        if (shown.call === null) return
        dismiss()
        calls.formTeams(shown.call)
      }}
      onDismiss={dismiss}
    />
  )
}
