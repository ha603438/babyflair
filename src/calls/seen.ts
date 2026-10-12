// « Chaud pour prendre une branlée ? » opens once per call per phone: the ids already shown are kept in memory and
// in sessionStorage (so a reload does not nag), never in the persisted settings.
export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void }

export const SEEN_KEY = 'babyflair.calls.seen'
const KEEP_LAST = 20

function read(storage: StorageLike | null): string[] {
  if (storage === null) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SEEN_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function write(storage: StorageLike | null, ids: string[]): void {
  if (storage === null) return
  try {
    storage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-KEEP_LAST)))
  } catch {
    // Storage blocked: the in-memory set still prevents the nag for this page load.
  }
}

export function createSeenCalls(storage: StorageLike | null) {
  const memory = new Set<string>(read(storage))
  return {
    has(id: string): boolean {
      return memory.has(id)
    },
    add(id: string): void {
      if (memory.has(id)) return
      memory.add(id)
      write(storage, [...memory])
    },
  }
}

export type SeenCalls = ReturnType<typeof createSeenCalls>

function sessionStorageOrNull(): StorageLike | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    return sessionStorage
  } catch {
    return null
  }
}

let shared: SeenCalls | null = null

/** The app-wide instance (lazy, so tests and server rendering never touch sessionStorage). */
export function seenCalls(): SeenCalls {
  if (shared === null) shared = createSeenCalls(sessionStorageOrNull())
  return shared
}
