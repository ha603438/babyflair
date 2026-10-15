// Web Push: pure helpers (support detection, copy, key decoding, row mapping). The browser calls live in usePush.ts.
import type { PushSubscriptionInput } from '../remote/api'
import type { PlayerId } from '../types'

export type PushSupport = 'ok' | 'ios-not-installed' | 'unsupported'

export type PushEnv = {
  userAgent: string
  /** Installed on the home screen (standalone display mode). */
  standalone: boolean
  /** `'PushManager' in window && 'serviceWorker' in navigator && 'Notification' in window`. */
  pushManager: boolean
}

export const PUSH_COPY = {
  title: 'Notifications',
  caption: 'Recevoir les appels à jouer',
  enable: 'Activer',
  disable: 'Désactiver',
  iosNotInstalled: "Installe d'abord l'app sur l'écran d'accueil (iOS 16.4+)",
  unsupported: 'Non pris en charge sur ce navigateur',
  denied: 'Notifications refusées par le navigateur',
  sharedOnly: 'Disponible en mode partagé uniquement',
  enabled: 'Notifications activées',
  disabled: 'Notifications désactivées',
  hintTitle: 'Active les notifications',
  hintBody: 'Pour être prévenu quand quelqu’un flaire un baby.',
} as const

export function isIos(userAgent: string): boolean {
  return /iPhone|iPad|iPod/.test(userAgent)
}

/** iOS only delivers Web Push to installed apps (16.4+); elsewhere the PushManager API decides. */
export function pushSupport(env: PushEnv): PushSupport {
  if (env.pushManager) return 'ok'
  if (isIos(env.userAgent) && !env.standalone) return 'ios-not-installed'
  return 'unsupported'
}

export function unsupportedCopy(support: PushSupport): string | null {
  if (support === 'ios-not-installed') return PUSH_COPY.iosNotInstalled
  if (support === 'unsupported') return PUSH_COPY.unsupported
  return null
}

/** The Classement hint: installed, push available, not enabled yet, not snoozed (snooze handled by the caller). */
export function shouldOfferPush(env: PushEnv, pushEnabled: boolean | undefined): boolean {
  if (pushEnabled === true) return false
  if (!env.standalone) return false
  return pushSupport(env) === 'ok'
}

/** VAPID public key (base64url) → the bytes `pushManager.subscribe` expects. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export type SubscriptionJson = { endpoint?: string; keys?: Record<string, string> }

/** `PushSubscription.toJSON()` → the server row; null when the browser gave no keys. */
export function subscriptionInput(json: SubscriptionJson, playerId: PlayerId | undefined): PushSubscriptionInput | null {
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (typeof json.endpoint !== 'string' || p256dh === undefined || auth === undefined) return null
  return { endpoint: json.endpoint, p256dh, auth, playerId: playerId ?? null }
}

export function vapidPublicKey(env: { VITE_VAPID_PUBLIC_KEY?: string }): string | null {
  const key = env.VITE_VAPID_PUBLIC_KEY?.trim()
  if (key === undefined || key.length === 0) return null
  return key
}

/** This phone's current push subscription as a server row (or null: no service worker, no subscription, timeout). */
export async function currentSubscription(playerId: PlayerId | undefined, timeoutMs = 1500): Promise<PushSubscriptionInput | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  const lookup = navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  const subscription = await Promise.race([lookup, timeout]).catch(() => null)
  if (subscription === null) return null
  return subscriptionInput(subscription.toJSON() as SubscriptionJson, playerId)
}
