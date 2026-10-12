import { shouldOfferPush } from '../../calls/push'
import { matchesSinceExport } from '../../stats'
import type { Match, Settings } from '../../types'

export { matchesSinceExport }

// Pure decision logic for the single HintCard of the Classement screen (spec §3.1, §9, §10).
// Priority: install hint (iOS Safari not standalone, or a captured Chromium `beforeinstallprompt`) → notifications
// (installed, push available, not enabled) → export nudge.

const DAY_MS = 24 * 60 * 60 * 1000

/** A dismissed hint stays hidden this long (both hints). */
export const HINT_SNOOZE_DAYS = 30
/** Export nudge: this many matches since the last export… */
export const EXPORT_NUDGE_MATCHES = 30
/** …or this many days since the last export with at least one match since. */
export const EXPORT_NUDGE_DAYS = 30

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
  | { kind: 'export'; count: number }

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
  if (isSnoozed(settings.notifHintDismissedAt, now)) return null
  const pushEnv = { userAgent: env.userAgent, standalone: env.standalone, pushManager: env.pushSupported }
  if (!shouldOfferPush(pushEnv, settings.pushEnabled)) return null
  return { kind: 'notifications' }
}

export function exportHint(matches: Match[], settings: Settings, now: Date): Hint | null {
  if (isSnoozed(settings.exportHintDismissedAt, now)) return null
  const count = matchesSinceExport(matches, settings.lastExportAt)
  if (count >= EXPORT_NUDGE_MATCHES) return { kind: 'export', count }
  const lastExport = parseTime(settings.lastExportAt)
  if (lastExport === null || count === 0) return null
  if (now.getTime() - lastExport >= EXPORT_NUDGE_DAYS * DAY_MS) return { kind: 'export', count }
  return null
}

/** The one hint to show on Classement, or null. */
export function pickHint(env: InstallEnv, matches: Match[], settings: Settings, now: Date): Hint | null {
  return installHint(env, settings, now) ?? notificationsHint(env, settings, now) ?? exportHint(matches, settings, now)
}
