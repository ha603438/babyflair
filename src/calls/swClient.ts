// Page side of the service worker's `notificationclick`: the worker focuses an open tab and posts the target URL
// (reloading would drop the in-memory draft); the page only moves the hash.
export type NavigateMessage = { type: 'navigate'; url: string }

export function isNavigateMessage(data: unknown): data is NavigateMessage {
  if (typeof data !== 'object' || data === null) return false
  const record = data as Record<string, unknown>
  return record.type === 'navigate' && typeof record.url === 'string'
}

/** The hash to apply for a notification URL, or null when it carries none. */
export function hashOf(url: string, base: string): string | null {
  try {
    const hash = new URL(url, base).hash
    if (hash.length === 0) return null
    return hash
  } catch {
    return null
  }
}

export function listenForSwNavigation(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!isNavigateMessage(event.data)) return
    const hash = hashOf(event.data.url, window.location.href)
    if (hash === null) return
    window.location.hash = hash
  })
}
