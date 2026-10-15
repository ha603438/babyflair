// Mode partagé: the decisions (which action calls which endpoint, what an error means, when to refetch) live here as
// pure functions so they are unit-testable in node; the React wiring is in use-remote-sync.ts.
import type { RemoteApi, RemoteData } from '../remote/api'
import { RemoteError } from '../remote/api'
import type { SyncMode, SyncStatus } from '../types'
import type { Action } from './reducer'
import { backfillSeq } from './reducer'

export const REFETCH_INTERVAL_MS = 20_000

export const SYNC_TOASTS = {
  network: 'Pas de connexion au serveur, réessaie',
  unauthorized: 'Code du bureau refusé',
  server: 'Erreur du serveur',
} as const

export type ProbeOutcome = 'ok' | 'wrong' | 'network' | 'server'

export const PROBE_ERRORS: Record<Exclude<ProbeOutcome, 'ok'>, string> = {
  wrong: 'Code incorrect',
  network: 'Pas de connexion',
  server: 'Erreur du serveur',
}

/** The gate replaces the shell until this phone holds a code the server accepts. */
export function isGateNeeded(mode: SyncMode, officeCode: string | undefined, status: SyncStatus): boolean {
  if (mode !== 'shared') return false
  if (officeCode === undefined) return true
  return status === 'unauthorized'
}

/** The server call mirroring a data action, or null for a local-only action (settings, clearAll). */
export function remoteCallFor(action: Action, api: RemoteApi): Promise<unknown> | null {
  switch (action.type) {
    case 'addPlayer':
      return api.insertPlayer(action.player)
    case 'renamePlayer':
      return api.updatePlayer(action.id, { name: action.name, isGuest: action.isGuest })
    case 'deletePlayer':
      return api.deletePlayer(action.id)
    case 'addMatch':
      return api.insertMatch(action.match)
    case 'updateMatch':
      return api.updateMatch(action.match)
    case 'deleteMatch':
      return api.deleteMatch(action.id)
    case 'restoreMatch':
      return api.restoreMatch(action.match)
    case 'importAll':
      return api.replaceAll(action.players, backfillSeq(action.matches))
    case 'respondCall':
      return api.upsertCallPlayer(action.callPlayer)
    case 'closeCall':
      return api.closeCall(action.id, action.closedAt)
    // addCall: the organizer flow (inserts, then the notification) is sequenced by src/calls/useCalls.ts itself.
    case 'addCall':
    case 'replaceData':
    case 'clearAll':
    case 'setSetting':
      return null
  }
}

/**
 * A wrong office code does not fail a read: RLS silently returns nothing. An empty server is also legitimate
 * (fresh project), so an empty result is confirmed by the office_ok probe before being trusted.
 */
export async function fetchVerified(api: RemoteApi): Promise<RemoteData> {
  const data = await api.fetchAll()
  if (data.players.length > 0 || data.matches.length > 0 || data.calls.length > 0) return data
  const ok = await api.probeCode()
  if (!ok) throw new RemoteError('unauthorized', 'office_ok returned false')
  return data
}

export async function probeOffice(api: RemoteApi): Promise<ProbeOutcome> {
  try {
    if (await api.probeCode()) return 'ok'
    return 'wrong'
  } catch (error) {
    if (error instanceof RemoteError && error.kind === 'network') return 'network'
    return 'server'
  }
}

export function errorKindOf(error: unknown): 'unauthorized' | 'network' | 'server' {
  if (error instanceof RemoteError) return error.kind
  return 'server'
}

/** A failed refetch only changes the status; a server error keeps the cache usable. */
export function statusAfterError(error: unknown): SyncStatus {
  switch (errorKindOf(error)) {
    case 'network':
      return 'offline'
    case 'unauthorized':
      return 'unauthorized'
    case 'server':
      return 'idle'
  }
}

export function toastTextFor(error: unknown): string {
  return SYNC_TOASTS[errorKindOf(error)]
}

/** After a failed write the local cache is reconciled with the server, unless the server is unreachable anyway. */
export function shouldReconcileAfter(error: unknown): boolean {
  return errorKindOf(error) !== 'network'
}

export type ListenerTarget = {
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}
export type VisibilityDocument = ListenerTarget & { visibilityState: string }
export type Timers = {
  setInterval(handler: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

/**
 * Refetch on focus, on coming back online, when the tab becomes visible, and every `intervalMs` while visible.
 * Returns the unsubscribe function.
 */
export function subscribeRefetch(
  win: ListenerTarget,
  doc: VisibilityDocument,
  refetch: () => void,
  intervalMs: number,
  timers: Timers,
): () => void {
  let handle: unknown = null

  function stopTimer(): void {
    if (handle === null) return
    timers.clearInterval(handle)
    handle = null
  }

  function startTimer(): void {
    if (handle !== null) return
    handle = timers.setInterval(refetch, intervalMs)
  }

  function onVisibility(): void {
    if (doc.visibilityState !== 'visible') {
      stopTimer()
      return
    }
    refetch()
    startTimer()
  }

  win.addEventListener('focus', refetch)
  win.addEventListener('online', refetch)
  doc.addEventListener('visibilitychange', onVisibility)
  if (doc.visibilityState === 'visible') startTimer()

  return () => {
    stopTimer()
    win.removeEventListener('focus', refetch)
    win.removeEventListener('online', refetch)
    doc.removeEventListener('visibilitychange', onVisibility)
  }
}
