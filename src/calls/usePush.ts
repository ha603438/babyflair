// Réglages › Notifications: permission, PushManager subscription and the server row. Pure helpers are in push.ts.
import { useCallback, useMemo, useState } from 'react'
import { headerPlayerId } from '../profile/profile'
import { useInstallEnv } from '../screens/lists/install'
import { useAppState } from '../store'
import { toastTextFor } from '../store/remote-sync'
import { PUSH_COPY, pushSupport, subscriptionInput, urlBase64ToUint8Array, vapidPublicKey } from './push'
import type { PushSupport } from './push'

export type PushState = {
  support: PushSupport
  enabled: boolean
  busy: boolean
  enable: () => Promise<void>
  disable: () => Promise<void>
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  // Not `ready`: in dev no worker is registered and `ready` would never resolve.
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

async function subscribe(reg: ServiceWorkerRegistration, key: string): Promise<PushSubscription> {
  const existing = await reg.pushManager.getSubscription()
  if (existing !== null) return existing
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
}

export function usePush(): PushState {
  const { store, dispatch, toast, sync } = useAppState()
  const env = useInstallEnv()
  const [busy, setBusy] = useState(false)
  const showToast = toast.show
  const api = sync.api
  // The subscription is tied to this phone's player profile (none for a visitor), like x-player-id.
  const myPlayerId = headerPlayerId(store.settings)
  const enabled = store.settings.pushEnabled === true
  const support = pushSupport({ userAgent: env.userAgent, standalone: env.standalone, pushManager: env.pushSupported })

  const enable = useCallback(async () => {
    const key = vapidPublicKey(import.meta.env)
    if (api === null) {
      showToast({ text: PUSH_COPY.sharedOnly })
      return
    }
    if (key === null) {
      showToast({ text: PUSH_COPY.unsupported })
      return
    }
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        showToast({ text: PUSH_COPY.denied })
        return
      }
      const reg = await registration()
      const input = reg === null ? null : subscriptionInput(await subscribe(reg, key).then((s) => s.toJSON()), myPlayerId)
      if (input === null) {
        showToast({ text: PUSH_COPY.unsupported })
        return
      }
      await api.upsertPushSubscription(input)
      dispatch({ type: 'setSetting', patch: { pushEnabled: true } })
      showToast({ text: PUSH_COPY.enabled })
    } catch (error) {
      showToast({ text: toastTextFor(error) })
    } finally {
      setBusy(false)
    }
  }, [api, dispatch, myPlayerId, showToast])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      const reg = await registration()
      const subscription = reg === null ? null : await reg.pushManager.getSubscription()
      if (subscription !== null) {
        if (api !== null) await api.deletePushSubscription(subscription.endpoint)
        await subscription.unsubscribe()
      }
      dispatch({ type: 'setSetting', patch: { pushEnabled: false } })
      showToast({ text: PUSH_COPY.disabled })
    } catch (error) {
      showToast({ text: toastTextFor(error) })
    } finally {
      setBusy(false)
    }
  }, [api, dispatch, showToast])

  return useMemo(() => ({ support, enabled, busy, enable, disable }), [support, enabled, busy, enable, disable])
}
