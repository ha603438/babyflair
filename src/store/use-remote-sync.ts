// Mode partagé: React wiring around remote-sync.ts. Optimistic local dispatch, then the mirrored server call, then a
// refetch so the server's version (seq included) wins. Nothing here runs when the env lacks the Supabase config.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RemoteApi } from '../remote/api'
import { createApi } from '../remote/api'
import { remoteConfig } from '../remote/config'
import { headerPlayerId } from '../profile/profile'
import type { Store, SyncMode, SyncStatus } from '../types'
import type { Action } from './reducer'
import {
  fetchVerified,
  REFETCH_INTERVAL_MS,
  remoteCallFor,
  shouldReconcileAfter,
  statusAfterError,
  subscribeRefetch,
  toastTextFor,
} from './remote-sync'

export type SyncState = {
  mode: SyncMode
  status: SyncStatus
  lastSyncAt?: string
  /** Fetches the server's data into the local cache (no-op in local mode). */
  refresh: () => Promise<void>
  /** The PostgREST client of this phone's office code and profile, for flows that sequence several calls. */
  api: RemoteApi | null
}

type Dispatch = (action: Action) => void

/** Rebuilt when the office code or the profile changes: every request carries both (x-office-code, x-player-id). */
function apiFor(officeCode: string | undefined, playerId: string | undefined): RemoteApi | null {
  const config = remoteConfig()
  if (config === null || officeCode === undefined) return null
  return createApi({ fetch: (url, init) => fetch(url, init), config, officeCode, playerId })
}

function useSyncStatus(): {
  status: SyncStatus
  lastSyncAt: string | undefined
  setStatus: (s: SyncStatus) => void
  markSynced: () => void
} {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>(undefined)
  const markSynced = useCallback(() => {
    setStatus('idle')
    setLastSyncAt(new Date().toISOString())
  }, [])
  return { status, lastSyncAt, setStatus, markSynced }
}

export function useRemoteSync(
  store: Store,
  localDispatch: Dispatch,
  showToast: (text: string) => void,
): { dispatch: Dispatch; sync: SyncState } {
  const mode: SyncMode = remoteConfig() === null ? 'local' : 'shared'
  const officeCode = store.settings.officeCode
  const playerId = headerPlayerId(store.settings)
  const api = useMemo(() => apiFor(officeCode, playerId), [officeCode, playerId])
  const { status, lastSyncAt, setStatus, markSynced } = useSyncStatus()
  // Polls are skipped while a write is in flight: its own refetch follows, and an interleaved poll would briefly
  // undo the optimistic change.
  const writesInFlight = useRef(0)

  const refresh = useCallback(async () => {
    if (api === null || writesInFlight.current > 0) return
    setStatus('syncing')
    try {
      const data = await fetchVerified(api)
      localDispatch({
        type: 'replaceData',
        players: data.players,
        matches: data.matches,
        calls: data.calls,
        callPlayers: data.callPlayers,
      })
      markSynced()
    } catch (error) {
      setStatus(statusAfterError(error))
    }
  }, [api, localDispatch, setStatus, markSynced])

  useEffect(() => {
    if (api === null) return
    void refresh()
    return subscribeRefetch(window, document, () => void refresh(), REFETCH_INTERVAL_MS, globalThis)
  }, [api, refresh])

  const runWrite = useCallback(
    async (call: Promise<unknown>) => {
      writesInFlight.current += 1
      setStatus('syncing')
      let failure: { error: unknown } | null = null
      try {
        await call
      } catch (error) {
        failure = { error }
      } finally {
        writesInFlight.current -= 1
      }
      if (failure === null) {
        await refresh()
        return
      }
      showToast(toastTextFor(failure.error))
      setStatus(statusAfterError(failure.error))
      if (shouldReconcileAfter(failure.error)) await refresh()
    },
    [refresh, setStatus, showToast],
  )

  const dispatch = useCallback(
    (action: Action) => {
      localDispatch(action)
      if (api === null) return
      const call = remoteCallFor(action, api)
      if (call === null) return
      void runWrite(call)
    },
    [api, localDispatch, runWrite],
  )

  const sync = useMemo<SyncState>(
    () => ({ mode, status, lastSyncAt, refresh, api }),
    [mode, status, lastSyncAt, refresh, api],
  )

  return { dispatch, sync }
}
