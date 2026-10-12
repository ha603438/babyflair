import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { Store } from '../types'
import { AppStateProvider, useAppState } from './provider'
import type { AppState } from './provider'
import { STORAGE_KEY } from './persistence'
import { initialStore } from './reducer'

function Probe(props: { onState: (state: AppState) => void }): null {
  props.onState(useAppState())
  return null
}

function renderWithProvider(): AppState {
  let captured: AppState | null = null
  const probe = createElement(Probe, {
    onState: (state) => {
      captured = state
    },
  })
  renderToString(createElement(AppStateProvider, null, probe))
  if (captured === null) throw new Error('Probe did not render')
  return captured
}

const stored: Store = {
  version: 1,
  players: [{ id: 'a', name: 'Alice', isGuest: false, createdAt: '2025-10-01T10:00:00.000Z' }],
  matches: [],
  settings: { lastFormat: '1v1', lastTarget: 5 },
  nextSeq: 1,
  calls: [],
  callPlayers: [],
}

describe('AppStateProvider', () => {
  beforeEach(() => {
    const data = new Map<string, string>([[STORAGE_KEY, JSON.stringify(stored)]])
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: () => undefined })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the store from localStorage and initialises the draft from its settings', () => {
    const state = renderWithProvider()
    expect(state.store).toEqual(stored)
    expect(state.storageBlocked).toBe(false)
    expect(state.draft).toEqual({
      format: '1v1',
      target: 5,
      slots: [null, null, null, null],
      activeSlot: 0,
      score: null,
      step: 'players',
    })
    expect(state.toast.current).toBeNull()
    expect(typeof state.dispatch).toBe('function')
    expect(typeof state.draftDispatch).toBe('function')
  })

  it('falls back to the initial store without storage', () => {
    vi.stubGlobal('localStorage', undefined)
    const state = renderWithProvider()
    expect(state.store).toBe(initialStore)
    expect(state.draft.format).toBe('2v2')
    expect(state.draft.target).toBe(5)
  })

  it('keeps the navigation payload in memory: set, get, take clears', () => {
    const { nav } = renderWithProvider()
    expect(nav.get()).toEqual({})
    const rankBefore = new Map([['a', 1]])
    nav.set({ rankBefore, highlightIds: ['a'] })
    expect(nav.get()).toEqual({ rankBefore, highlightIds: ['a'] })
    expect(nav.get().rankBefore).toBe(rankBefore)
    expect(nav.take()).toEqual({ rankBefore, highlightIds: ['a'] })
    expect(nav.get()).toEqual({})
    expect(nav.take()).toEqual({})
  })

  it('dispatch rejects deleting a player who has matches before reaching the reducer', () => {
    const data = new Map<string, string>([
      [
        STORAGE_KEY,
        JSON.stringify({
          ...stored,
          players: [...stored.players, { id: 'b', name: 'Bob', isGuest: false, createdAt: '2025-10-01T10:00:00.000Z' }],
          matches: [
            {
              id: 'm1',
              seq: 1,
              playedAt: 'p',
              createdAt: 'p',
              updatedAt: 'p',
              target: 10,
              teamA: ['a'],
              teamB: ['b'],
              scoreA: 10,
              scoreB: 2,
            },
          ],
          nextSeq: 2,
        }),
      ],
    ])
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: () => undefined })
    const { dispatch } = renderWithProvider()
    expect(() => dispatch({ type: 'deletePlayer', id: 'a' })).toThrow(/has recorded matches/)
  })
})

describe('useAppState', () => {
  it('throws outside the provider', () => {
    function Orphan(): null {
      useAppState()
      return null
    }
    expect(() => renderToString(createElement(Orphan))).toThrow(/AppStateProvider/)
  })
})
