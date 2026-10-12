// Mise à jour forcée (double-tap sur le blason) : vérifie le service worker, active la nouvelle version et recharge.
export type UpdateOutcome = 'reloading' | 'latest' | 'unsupported'

type RegistrationLike = {
  update: () => Promise<unknown>
  waiting: { postMessage: (message: unknown) => void } | null
  installing: unknown
}

export const UPDATE_TOASTS: Record<UpdateOutcome, string> = {
  reloading: 'Mise à jour en cours…',
  latest: 'Tu as déjà la dernière version',
  unsupported: 'Rechargement…',
}

/** Pure decision: with a waiting worker the page must be reloaded; nothing waiting means the version is current. */
export function outcomeFor(registration: RegistrationLike | undefined): UpdateOutcome {
  if (registration === undefined) return 'unsupported'
  if (registration.waiting !== null || registration.installing !== null) return 'reloading'
  return 'latest'
}

export async function checkForUpdate(
  getRegistration: () => Promise<RegistrationLike | undefined> = defaultRegistration,
  reload: () => void = () => window.location.reload(),
): Promise<UpdateOutcome> {
  const registration = await getRegistration()
  if (registration !== undefined) await registration.update().catch(() => undefined)
  const outcome = outcomeFor(registration)
  if (outcome === 'latest') return outcome
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
  // Give the new worker a moment to take control, then reload with the fresh assets.
  setTimeout(reload, outcome === 'reloading' ? 800 : 0)
  return outcome
}

async function defaultRegistration(): Promise<RegistrationLike | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined
  const registration = await navigator.serviceWorker.getRegistration()
  return registration ?? undefined
}
