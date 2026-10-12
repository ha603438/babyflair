// Which call the shell's CallWatcher shows, as a pure decision (tested in node).
import type { Call, CallPlayer, PlayerId } from '../types'
import { isCallOpen, openCallFor } from './calls'

export type WatchInput = {
  calls: Call[]
  callPlayers: CallPlayer[]
  viewerId: PlayerId | undefined
  now: Date
  /** A call explicitly asked for (#/appel/:id or « Proposer un baby » on an open call): shown even if seen. */
  forcedId: string | undefined
  /** Shared mode before the first successful fetch: a forced call may simply not be loaded yet. */
  awaitingFirstSync: boolean
  hasSeen: (id: string) => boolean
}

/** `{ id, call: null }` = « Appel terminé » for a forced call that is closed, expired or unknown. */
export type WatchOutput = { id: string; call: Call | null } | null

export function callToShow(input: WatchInput): WatchOutput {
  if (input.forcedId !== undefined) {
    const forced = input.calls.find((call) => call.id === input.forcedId)
    if (forced === undefined && input.awaitingFirstSync) return null
    if (forced === undefined || !isCallOpen(forced, input.now)) return { id: input.forcedId, call: null }
    return { id: forced.id, call: forced }
  }
  const open = openCallFor(input.calls, input.callPlayers, input.viewerId, input.now)
  if (open === null || input.hasSeen(open.id)) return null
  return { id: open.id, call: open }
}
