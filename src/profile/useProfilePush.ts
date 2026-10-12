// A profile switch on a phone that receives the appels: its push subscription is re-registered so the server ties it
// to the new player (or to nobody for a visitor). Mounted once above the gates (App.tsx Root), so it sees the switch
// even though the shell is unmounted while « Qui es-tu ? » is shown.
import { useEffect, useRef } from 'react'
import { currentSubscription } from '../calls/push'
import type { RemoteApi } from '../remote/api'
import { useAppState } from '../store'
import type { PlayerId } from '../types'
import { headerPlayerId, shouldReregisterPush } from './profile'

async function reRegister(api: RemoteApi, playerId: PlayerId | undefined): Promise<void> {
  const subscription = await currentSubscription(playerId)
  if (subscription === null) return
  // Best effort: the next « Activer » or profile switch tries again.
  await api.upsertPushSubscription(subscription).catch(() => undefined)
}

export function useProfilePush(): void {
  const { store, sync } = useAppState()
  const playerId = headerPlayerId(store.settings)
  const pushEnabled = store.settings.pushEnabled
  const api = sync.api
  const previous = useRef(playerId)

  useEffect(() => {
    const before = previous.current
    previous.current = playerId
    if (api === null || !shouldReregisterPush(before, playerId, pushEnabled)) return
    void reRegister(api, playerId)
  }, [api, playerId, pushEnabled])
}
