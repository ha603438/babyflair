import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { Draft } from '../types'
import { draftReducer, initialDraft, NO_ACTIVE_SLOT } from './draft'
import type { DraftAction } from './draft'
import {
  DRAFT_STORAGE_KEY,
  draftFromStored,
  draftToStored,
  loadDraft,
  loadOrInitialDraft,
  saveDraft,
} from './draftStorage'
import { AppStateProvider, useAppState } from './provider'
import type { AppState } from './provider'

const SETTINGS = { lastFormat: '2v2', lastTarget: 10 } as const

function run(draft: Draft, ...actions: DraftAction[]): Draft {
  return actions.reduce(draftReducer, draft)
}

function sheet(): Draft {
  const picks: DraftAction[] = ['a', 'b', 'c', 'd'].map((playerId) => ({ type: 'pick', playerId }))
  return run(initialDraft(SETTINGS), ...picks, { type: 'setBet', team: 'A', n: 4 }, { type: 'setBet', team: 'B', n: 2 })
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('draftToStored / draftFromStored', () => {
  it('keeps format, target, slots and announcements under version 1, not the score', () => {
    const scored = draftReducer(sheet(), { type: 'setScore', score: { winner: 'A', loserGoals: 5 } })
    expect(draftToStored(scored)).toEqual({
      version: 1,
      format: '2v2',
      target: 10,
      slots: ['a', 'b', 'c', 'd'],
      betA: 4,
      betB: 2,
    })
    expect(draftFromStored(draftToStored(scored))).toEqual(sheet())
  })

  it('stores nothing for an empty sheet or the result view', () => {
    expect(draftToStored(initialDraft(SETTINGS))).toBeNull()
    expect(draftToStored(draftReducer(sheet(), { type: 'saved', matchId: 'm1' }))).toBeNull()
  })

  it('recomputes the step and the active slot, and keeps announcements only on a complete roster', () => {
    const slots = ['a', null, 'c', null]
    const partial = draftFromStored({ version: 1, format: '2v2', target: 5, slots, betA: 3, betB: null })
    expect(partial).toEqual({
      format: '2v2',
      target: 5,
      slots: ['a', null, 'c', null],
      activeSlot: 1,
      score: null,
      step: 'players',
      comeback: false,
    })
    const oneVsOne = draftFromStored({ version: 1, format: '1v1', target: 5, slots: ['a', null, 'c', null], betA: 9 })
    expect(oneVsOne?.step).toBe('score')
    expect(oneVsOne?.activeSlot).toBe(NO_ACTIVE_SLOT)
    expect(oneVsOne?.betA).toBe(5) // clamped to the target
    expect(oneVsOne && 'betB' in oneVsOne).toBe(false)
  })

  it('rejects anything that is not a version-1 sheet', () => {
    const valid = { version: 1, format: '2v2', target: 10, slots: ['a', 'b', 'c', 'd'], betA: null, betB: null }
    expect(draftFromStored(valid)).not.toBeNull()
    for (const bad of [
      null,
      'draft',
      { ...valid, version: 2 },
      { ...valid, format: '3v3' },
      { ...valid, target: 7 },
      { ...valid, slots: ['a', 'b', 'c'] },
      { ...valid, slots: ['a', 'b', 'c', 4] },
      { ...valid, slots: ['a', 'a', 'c', 'd'] },
      { ...valid, slots: [null, null, null, null] },
      // The whole store (what a careless stub hands back for any key) is not a sheet.
      { version: 1, players: [], matches: [], settings: SETTINGS },
    ]) {
      expect(draftFromStored(bad), JSON.stringify(bad)).toBeNull()
    }
    expect(draftFromStored({ ...valid, betA: 2.5, betB: 'x' })).toEqual(draftFromStored(valid))
  })
})

describe('loadDraft / saveDraft', () => {
  it('writes the sheet under its own key, then removes it once saved or emptied', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    saveDraft(sheet())
    expect(JSON.parse(storage.data.get(DRAFT_STORAGE_KEY) ?? 'null')).toMatchObject({ version: 1, betA: 4, betB: 2 })
    expect(loadDraft()).toEqual(sheet())
    saveDraft(draftReducer(sheet(), { type: 'saved', matchId: 'm1' }))
    expect(storage.data.has(DRAFT_STORAGE_KEY)).toBe(false)
    saveDraft(sheet())
    saveDraft(draftReducer(sheet(), { type: 'reset' }))
    expect(storage.data.has(DRAFT_STORAGE_KEY)).toBe(false)
  })

  it('never throws: missing, blocked or corrupt storage falls back to a fresh draft', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(loadDraft()).toBeNull()
    expect(() => saveDraft(sheet())).not.toThrow()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadOrInitialDraft(SETTINGS)).toEqual(initialDraft(SETTINGS))
    expect(() => saveDraft(sheet())).not.toThrow()
    vi.stubGlobal('localStorage', memoryStorage({ [DRAFT_STORAGE_KEY]: '{not json' }))
    expect(loadOrInitialDraft(SETTINGS)).toEqual(initialDraft(SETTINGS))
  })
})

describe('AppStateProvider restores the sheet', () => {
  function Probe(props: { onState: (state: AppState) => void }): null {
    props.onState(useAppState())
    return null
  }

  it('opens on the saved roster and announcements after the app was closed', () => {
    vi.stubGlobal('localStorage', memoryStorage({ [DRAFT_STORAGE_KEY]: JSON.stringify(draftToStored(sheet())) }))
    let captured: AppState | null = null
    const probe = createElement(Probe, {
      onState: (state) => {
        captured = state
      },
    })
    renderToString(createElement(AppStateProvider, null, probe))
    expect((captured as AppState | null)?.draft).toEqual(sheet())
  })
})
