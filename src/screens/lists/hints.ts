import { shouldOfferPush } from '../../calls/push'
import type { Settings } from '../../types'


// Pure decision logic for the single HintCard of the Classement screen (spec §3.1, §9, §10).
// Priority: install hint (iOS Safari not standalone, or a captured Chromium `beforeinstallprompt`) → notifications
// (installed, push available, not enabled) → export nudge.

const DAY_MS = 24 * 60 * 60 * 1000

/** A dismissed hint stays hidden this long (both hints). */
export const HINT_SNOOZE_DAYS = 30

export type InstallEnv = {
  /** `navigator.userAgent`. */
  userAgent: string
  /** `navigator.standalone === true`, `(display-mode: standalone)` matches, or `appinstalled` was seen. */
  standalone: boolean
  /** A Chromium `beforeinstallprompt` event is captured and not used yet. */
  promptAvailable: boolean
  /** `PushManager`, `Notification` and `serviceWorker` all exist (Web Push possible). */
  pushSupported: boolean
}

export type Hint =
  | { kind: 'install-ios' }
  | { kind: 'install-chromium' }
  | { kind: 'notifications' }

export function isIosUserAgent(userAgent: string): boolean {
  return /iPhone|iPad|iPod/.test(userAgent)
}

function parseTime(iso: string | undefined): number | null {
  if (iso === undefined) return null
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  return time
}

/** True while `dismissedAt` is less than 30 days before `now`; a missing or unreadable date never snoozes. */
export function isSnoozed(dismissedAt: string | undefined, now: Date): boolean {
  const at = parseTime(dismissedAt)
  if (at === null) return false
  return now.getTime() - at < HINT_SNOOZE_DAYS * DAY_MS
}

export function installHint(env: InstallEnv, settings: Settings, now: Date): Hint | null {
  if (env.standalone) return null
  if (isSnoozed(settings.installHintDismissedAt, now)) return null
  if (env.promptAvailable) return { kind: 'install-chromium' }
  if (isIosUserAgent(env.userAgent)) return { kind: 'install-ios' }
  return null
}

export function notificationsHint(env: InstallEnv, settings: Settings, now: Date): Hint | null {
  // A visitor cannot answer the appels: Réglages hides the activation for them, so the hint would lead nowhere.
  if (settings.visitor === true) return null
  if (isSnoozed(settings.notifHintDismissedAt, now)) return null
  const pushEnv = { userAgent: env.userAgent, standalone: env.standalone, pushManager: env.pushSupported }
  if (!shouldOfferPush(pushEnv, settings.pushEnabled)) return null
  return { kind: 'notifications' }
}

/** The one hint to show on Classement, or null. The export reminder lives in Réglages only (export row caption). */
export function pickHint(env: InstallEnv, settings: Settings, now: Date): Hint | null {
  return installHint(env, settings, now) ?? notificationsHint(env, settings, now)
}
