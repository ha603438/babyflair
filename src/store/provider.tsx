import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import type { Draft, PlayerId, Store } from '../types'
import type { Action } from './reducer'
import { playerHasMatches, reducer } from './reducer'
import { loadStore, saveStore } from './persistence'
import type { DraftAction } from './draft'
import { draftReducer, initialDraft } from './draft'

export type ToastInput = { text: string; action?: { label: string; onClick: () => void }; ttlMs?: number }
export type ToastState = (ToastInput & { id: number }) | null
export type NavPayload = { rankBefore?: Map<PlayerId, number>; highlightIds?: PlayerId[] }

export type AppState = {
  store: Store
  dispatch: (a: Action) => void
  storageBlocked: boolean
  draft: Draft
  draftDispatch: (a: DraftAction) => void
  toast: { current: ToastState; show: (t: ToastInput) => void; dismiss: () => void }
  nav: { get: () => NavPayload; set: (p: NavPayload) => void; take: () => NavPayload }
}

const TOAST_TTL_WITH_ACTION_MS = 6000
const TOAST_TTL_MS = 4000

const AppStateContext = createContext<AppState | null>(null)

function toastTtl(input: ToastInput): number {
  if (input.ttlMs !== undefined) return input.ttlMs
  if (input.action) return TOAST_TTL_WITH_ACTION_MS
  return TOAST_TTL_MS
}

function useStoreWithPersistence(): { store: Store; dispatch: (a: Action) => void; storageBlocked: boolean } {
  const [store, reactDispatch] = useReducer(reducer, undefined, loadStore)
  const [storageBlocked, setStorageBlocked] = useState(false)
  const storeRef = useRef(store)
  const loadedRef = useRef(store)

  useEffect(() => {
    storeRef.current = store
    // The loaded store is never written back: a corrupt but recoverable payload must not be overwritten.
    if (store === loadedRef.current) return
    setStorageBlocked(!saveStore(store))
  }, [store])

  const dispatch = useCallback((action: Action) => {
    // Checked here so the guard surfaces at the call site instead of throwing inside React's render.
    if (action.type === 'deletePlayer' && playerHasMatches(storeRef.current.matches, action.id)) {
      throw new Error(`Cannot delete player ${action.id}: the player has recorded matches`)
    }
    reactDispatch(action)
  }, [])

  return { store, dispatch, storageBlocked }
}

function useToast(): AppState['toast'] {
  const [current, setCurrent] = useState<ToastState>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextId = useRef(0)

  const clearTimer = useCallback(() => {
    if (timer.current === null) return
    clearTimeout(timer.current)
    timer.current = null
  }, [])

  const dismiss = useCallback(() => {
    clearTimer()
    setCurrent(null)
  }, [clearTimer])

  const show = useCallback(
    (input: ToastInput) => {
      // One toast at a time: a new one replaces the previous (its pending undo is simply dropped).
      clearTimer()
      nextId.current += 1
      const id = nextId.current
      setCurrent({ ...input, id })
      timer.current = setTimeout(() => {
        timer.current = null
        setCurrent((active) => (active?.id === id ? null : active))
      }, toastTtl(input))
    },
    [clearTimer],
  )

  useEffect(() => clearTimer, [clearTimer])

  return useMemo(() => ({ current, show, dismiss }), [current, show, dismiss])
}

function useNavPayload(): AppState['nav'] {
  const payload = useRef<NavPayload>({})
  return useMemo(
    () => ({
      get: () => payload.current,
      set: (next: NavPayload) => {
        payload.current = next
      },
      take: () => {
        const taken = payload.current
        payload.current = {}
        return taken
      },
    }),
    [],
  )
}

export function AppStateProvider(props: { children: ReactNode }): JSX.Element {
  const { store, dispatch, storageBlocked } = useStoreWithPersistence()
  const [draft, draftDispatch] = useReducer(draftReducer, store.settings, initialDraft)
  const toast = useToast()
  const nav = useNavPayload()

  const value = useMemo<AppState>(
    () => ({ store, dispatch, storageBlocked, draft, draftDispatch, toast, nav }),
    [store, dispatch, storageBlocked, draft, draftDispatch, toast, nav],
  )

  return <AppStateContext.Provider value={value}>{props.children}</AppStateContext.Provider>
}

// The provider and its hook are one unit by contract (src/store/index.ts re-exports both); editing this
// file reloads the page instead of hot-refreshing, which is fine for the root state provider.
// oxlint-disable-next-line react/only-export-components
export function useAppState(): AppState {
  const value = useContext(AppStateContext)
  if (value === null) throw new Error('useAppState must be used inside <AppStateProvider>')
  return value
}
