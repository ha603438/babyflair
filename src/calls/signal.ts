// Tiny external store: « Proposer un baby » (Classement) asks the CallWatcher (shell) to show a given call, even
// one this phone already dismissed. useSyncExternalStore keeps it React-friendly without a context.
import { useSyncExternalStore } from 'react'

type Request = { callId: string; nonce: number } | null

let current: Request = null
let nonce = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function requestCall(callId: string): void {
  nonce += 1
  current = { callId, nonce }
  emit()
}

export function clearRequestedCall(): void {
  if (current === null) return
  current = null
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function snapshot(): Request {
  return current
}

function serverSnapshot(): Request {
  return null
}

export function useRequestedCall(): Request {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
