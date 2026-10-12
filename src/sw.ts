/// <reference lib="webworker" />
// Service worker (vite-plugin-pwa, injectManifest): precache + navigation fallback as before, plus Web Push.
// Keeps the autoUpdate behaviour (skipWaiting + clients.claim) so the « double-tap sur le blason » flow works.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import type { PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> }

type PushPayload = { title?: string; body?: string; icon?: string; badge?: string; tag?: string; url?: string }

const SCOPE = self.registration.scope
const INDEX_URL = `${SCOPE}index.html`

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL(INDEX_URL)))

self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

function payloadOf(event: PushEvent): PushPayload {
  try {
    const parsed: unknown = event.data?.json()
    if (typeof parsed === 'object' && parsed !== null) return parsed as PushPayload
  } catch {
    // Not JSON: fall through to the text body.
  }
  return { body: event.data?.text() ?? '' }
}

function targetUrl(url: string | undefined): string {
  if (url === undefined) return SCOPE
  return new URL(url, SCOPE).href
}

self.addEventListener('push', (event) => {
  const payload = payloadOf(event)
  const options: NotificationOptions & { badge?: string } = {
    body: payload.body ?? '',
    icon: payload.icon ?? `${SCOPE}pwa-192x192.png`,
    badge: payload.badge ?? `${SCOPE}pwa-64x64.png`,
    tag: payload.tag,
    data: { url: targetUrl(payload.url) },
  }
  event.waitUntil(self.registration.showNotification(payload.title ?? 'BabyFlair', options))
})

async function openOrFocus(url: string): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const existing = clients.find((client) => client.url.startsWith(SCOPE))
  if (existing !== undefined) {
    await existing.focus()
    existing.postMessage({ type: 'navigate', url })
    return
  }
  await self.clients.openWindow(url)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data as { url?: string } | undefined
  event.waitUntil(openOrFocus(targetUrl(data?.url)))
})
