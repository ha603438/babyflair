// Mise à jour forcée (double-tap sur le blason). Compare le bundle chargé par la page avec celui de l'index.html en
// ligne (requête hors cache et hors service worker). S'ils diffèrent, désinscrit le service worker et recharge : la
// page repart du réseau, puis registerSW réinstalle le nouveau worker. Le service worker s'activant tout seul
// (skipWaiting), on ne peut pas se fier à un worker « en attente » pour savoir si la page est périmée.
export type UpdateOutcome = 'reloading' | 'latest' | 'offline'

export const UPDATE_TOASTS: Record<UpdateOutcome, string> = {
  reloading: 'Mise à jour en cours…',
  latest: 'Tu as déjà la dernière version',
  offline: 'Impossible de vérifier : pas de connexion',
}

const ENTRY_PATTERN = /assets\/index-[\w-]+\.js/

/** The `assets/index-<hash>.js` path referenced by an HTML document or a script URL, or null. */
export function entryOf(text: string): string | null {
  const match = ENTRY_PATTERN.exec(text)
  if (match === null) return null
  return match[0]
}

export type UpdateDeps = {
  /** The entry script the running page loaded. */
  currentEntry: () => string | null
  /** The entry script of the deployed index.html, or null when it cannot be fetched. */
  latestEntry: () => Promise<string | null>
  unregisterWorkers: () => Promise<void>
  reload: () => void
}

/** Pure decision: offline when the deployed entry is unknown, latest when both entries match. */
export function outcomeFor(current: string | null, latest: string | null): UpdateOutcome {
  if (latest === null) return 'offline'
  if (current !== null && current === latest) return 'latest'
  return 'reloading'
}

export async function checkForUpdate(deps: UpdateDeps = browserDeps()): Promise<UpdateOutcome> {
  const outcome = outcomeFor(deps.currentEntry(), await deps.latestEntry())
  if (outcome !== 'reloading') return outcome
  await deps.unregisterWorkers().catch(() => undefined)
  deps.reload()
  return outcome
}

function browserDeps(): UpdateDeps {
  return {
    currentEntry: () => {
      const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))
      for (const script of scripts) {
        const entry = entryOf(script.src)
        if (entry !== null) return entry
      }
      return null
    },
    latestEntry: async () => {
      // A query string keeps the request out of the precache route, `no-store` out of the HTTP cache.
      const url = `${import.meta.env.BASE_URL}index.html?v=${Date.now()}`
      try {
        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) return null
        return entryOf(await response.text())
      } catch {
        return null
      }
    },
    unregisterWorkers: async () => {
      if (!('serviceWorker' in navigator)) return
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    },
    reload: () => window.location.reload(),
  }
}

/** True when the deployed bundle differs from the running one (false when offline or unknown). */
export async function isUpdateAvailable(deps: UpdateDeps = browserDeps()): Promise<boolean> {
  return outcomeFor(deps.currentEntry(), await deps.latestEntry()) === 'reloading'
}

/** Unregisters the service workers and reloads from the network. */
export async function applyUpdate(deps: UpdateDeps = browserDeps()): Promise<void> {
  await deps.unregisterWorkers().catch(() => undefined)
  deps.reload()
}
