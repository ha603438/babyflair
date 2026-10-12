import { useSyncExternalStore } from 'react'
import type { InstallEnv } from './hints'

// Runtime side of the install hint (spec §10): captures Chromium's `beforeinstallprompt` at module load, tracks
// `appinstalled`, and exposes the environment to React through useSyncExternalStore. Decisions live in hints.ts.

/** Chromium's `beforeinstallprompt` event (not in lib.dom). */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean }

// Server / test snapshot: "standalone" with no user agent, so no install hint is ever rendered without a browser.
const SERVER_ENV: InstallEnv = { userAgent: '', standalone: true, promptAvailable: false, pushSupported: false }

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installed = false
let snapshot: InstallEnv | null = null
const listeners = new Set<() => void>()

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.addEventListener === 'function'
}

function isStandalone(): boolean {
  if (installed) return true
  if ((navigator as NavigatorWithStandalone).standalone === true) return true
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(display-mode: standalone)').matches
}

function isPushSupported(): boolean {
  return 'PushManager' in window && 'Notification' in window && 'serviceWorker' in navigator
}

function readEnv(): InstallEnv {
  if (!hasWindow() || typeof navigator === 'undefined') return SERVER_ENV
  return {
    userAgent: navigator.userAgent,
    standalone: isStandalone(),
    promptAvailable: deferredPrompt !== null,
    pushSupported: isPushSupported(),
  }
}

function invalidate(): void {
  snapshot = null
  for (const listener of listeners) listener()
}

// useSyncExternalStore needs a stable reference while nothing changed: the snapshot is cached until an event fires.
function getSnapshot(): InstallEnv {
  if (snapshot === null) snapshot = readEnv()
  return snapshot
}

function getServerSnapshot(): InstallEnv {
  return SERVER_ENV
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function onBeforeInstallPrompt(event: Event): void {
  // Keep the event: Chromium would show its own mini-infobar otherwise, and `prompt()` needs it later.
  event.preventDefault()
  deferredPrompt = event as BeforeInstallPromptEvent
  invalidate()
}

function onAppInstalled(): void {
  installed = true
  deferredPrompt = null
  invalidate()
}

// Registered at module load (App imports the screens before the first render) so an early event is not missed.
if (hasWindow()) {
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
}

/** Install-related environment, refreshed when `beforeinstallprompt` / `appinstalled` fire. */
export function useInstallEnv(): InstallEnv {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Shows the native Chromium install prompt with the captured event (usable once); no-op when none was captured. */
export async function promptInstall(): Promise<void> {
  const event = deferredPrompt
  if (event === null) return
  deferredPrompt = null
  invalidate()
  await event.prompt()
}
