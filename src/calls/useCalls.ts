// React side of the appels: the organizer flow (insert, then the notification), joining, and « Former les équipes ».
// Decisions are in calls.ts / teams.ts; the server calls go through sync.api so they can be sequenced and awaited.
import { useCallback, useMemo, useState } from 'react'
import { replay } from '../rating'
import { navigate } from '../router'
import { useAppState } from '../store'
import { toastTextFor } from '../store/remote-sync'
import type { Call, PlayerId } from '../types'
import { CALL_CAPACITY, CALL_COPY, newCall, newCallPlayer, notifyToast, participantIdsOf } from './calls'
import { currentSubscription } from './push'
import { balanceTeams } from './teams'

export type CallsApi = {
  busy: boolean
  /** Creates the call and notifies the office; resolves to the call id, or null when the server refused it. */
  propose: (playerId: PlayerId) => Promise<string | null>
  join: (callId: string, playerId: PlayerId) => void
  /** Balanced Blancs / Noirs from the first 4 participants, draft prefilled, call closed, → #/match. */
  formTeams: (call: Call) => void
}

export function useCalls(): CallsApi {
  const { store, dispatch, draftDispatch, toast, sync } = useAppState()
  const [busy, setBusy] = useState(false)
  const showToast = toast.show
  const api = sync.api
  const refresh = sync.refresh

  const rememberMe = useCallback(
    (playerId: PlayerId) => {
      if (store.settings.myPlayerId === playerId) return
      dispatch({ type: 'setSetting', patch: { myPlayerId: playerId } })
    },
    [dispatch, store.settings.myPlayerId],
  )

  const propose = useCallback(
    async (playerId: PlayerId): Promise<string | null> => {
      const now = new Date()
      const call = newCall(crypto.randomUUID(), playerId, now)
      const organizer = newCallPlayer(call.id, playerId, now)
      rememberMe(playerId)
      if (api === null) {
        dispatch({ type: 'addCall', call, organizer })
        showToast({ text: CALL_COPY.created })
        return call.id
      }
      setBusy(true)
      try {
        await api.insertCall(call)
        await api.insertCallPlayer(organizer)
      } catch (error) {
        setBusy(false)
        showToast({ text: toastTextFor(error) })
        return null
      }
      dispatch({ type: 'addCall', call, organizer })
      // The organizer's own phone is skipped; its subscription is also tied to the chosen name for later calls.
      const mine = await currentSubscription(playerId)
      if (mine !== null) await api.upsertPushSubscription(mine).catch(() => undefined)
      try {
        const result = await api.notifyCall(call.id, mine?.endpoint ?? null)
        showToast({ text: notifyToast(result.sent) })
      } catch (error) {
        showToast({ text: `${CALL_COPY.created}, mais notification impossible : ${toastTextFor(error)}` })
      }
      setBusy(false)
      void refresh()
      return call.id
    },
    [api, dispatch, refresh, rememberMe, showToast],
  )

  const join = useCallback(
    (callId: string, playerId: PlayerId) => {
      rememberMe(playerId)
      dispatch({ type: 'joinCall', callPlayer: newCallPlayer(callId, playerId, new Date()) })
    },
    [dispatch, rememberMe],
  )

  const formTeams = useCallback(
    (call: Call) => {
      const ids = participantIdsOf(call.id, store.callPlayers).slice(0, CALL_CAPACITY)
      if (ids.length < CALL_CAPACITY) return
      const now = new Date()
      const { byPlayer } = replay(store.players, store.matches, { now })
      const teams = balanceTeams(ids, (id) => byPlayer.get(id)?.rating ?? 1000, Math.random)
      draftDispatch({ type: 'prefill', teamA: teams.teamA, teamB: teams.teamB, target: store.settings.lastTarget })
      dispatch({ type: 'closeCall', id: call.id, closedAt: now.toISOString() })
      navigate({ name: 'match' })
    },
    [dispatch, draftDispatch, store.callPlayers, store.matches, store.players, store.settings.lastTarget],
  )

  return useMemo(() => ({ busy, propose, join, formTeams }), [busy, propose, join, formTeams])
}
