import { describe, expect, it } from 'vitest'
import type { Player, Settings } from '../types'
import {
  canWrite,
  CHOOSE_PROFILE_PATCH,
  currentProfile,
  guardMessage,
  headerPlayerId,
  isWriteAllowed,
  needsProfileChoice,
  playerProfilePatch,
  profileCaption,
  profileId,
  shouldReregisterPush,
  VISITOR_PATCH,
} from './profile'

const alice: Player = { id: 'alice', name: 'Alice', isGuest: false, createdAt: '2026-10-01T10:00:00.000Z' }
const bob: Player = { id: 'bob', name: 'Bob', isGuest: false, createdAt: '2026-10-01T10:00:00.000Z' }
const players = [alice, bob]

const settings = (patch: Partial<Settings> = {}): Settings => ({ lastFormat: '2v2', lastTarget: 5, ...patch })
const shared = (patch: Partial<Settings> = {}): Settings => settings({ officeCode: 'secret', ...patch })

describe('currentProfile', () => {
  it('is the player of myPlayerId', () => {
    expect(currentProfile(settings({ myPlayerId: 'bob' }), players)).toEqual({ kind: 'player', player: bob })
  })

  it('is none without myPlayerId, or when it points to a deleted player', () => {
    expect(currentProfile(settings(), players)).toEqual({ kind: 'none' })
    expect(currentProfile(settings({ myPlayerId: 'gone' }), players)).toEqual({ kind: 'none' })
  })

  it('is visitor whenever the visitor flag is set', () => {
    expect(currentProfile(settings({ visitor: true }), players)).toEqual({ kind: 'visitor' })
    expect(currentProfile(settings({ visitor: true, myPlayerId: 'alice' }), players)).toEqual({ kind: 'visitor' })
  })
})

describe('needsProfileChoice', () => {
  it('never in local mode, nor before the office code', () => {
    expect(needsProfileChoice('local', settings(), players)).toBe(false)
    expect(needsProfileChoice('shared', settings(), players)).toBe(false)
  })

  it('until a confirmed existing player or a confirmed visitor', () => {
    expect(needsProfileChoice('shared', shared(), players)).toBe(true)
    // An older « Qui es-tu ? » pick is only a preselection: it still has to be confirmed.
    expect(needsProfileChoice('shared', shared({ myPlayerId: 'alice' }), players)).toBe(true)
    expect(needsProfileChoice('shared', shared({ myPlayerId: 'alice', profileConfirmed: true }), players)).toBe(false)
    expect(needsProfileChoice('shared', shared({ visitor: true, profileConfirmed: true }), players)).toBe(false)
  })

  it('again once the chosen player is deleted, or after « Changer »', () => {
    expect(needsProfileChoice('shared', shared({ myPlayerId: 'gone', profileConfirmed: true }), players)).toBe(true)
    const changed = shared({ visitor: true, ...CHOOSE_PROFILE_PATCH })
    expect(needsProfileChoice('shared', changed, players)).toBe(true)
  })
})

describe('write guard decision', () => {
  const player = currentProfile(settings({ myPlayerId: 'alice' }), players)
  const visitor = currentProfile(settings({ visitor: true }), players)
  const none = currentProfile(settings(), players)

  it('canWrite only with a player profile', () => {
    expect(canWrite(player)).toBe(true)
    expect(canWrite(visitor)).toBe(false)
    expect(canWrite(none)).toBe(false)
  })

  it('local mode always writes; shared mode needs a player', () => {
    expect(isWriteAllowed('local', none)).toBe(true)
    expect(isWriteAllowed('local', visitor)).toBe(true)
    expect(isWriteAllowed('shared', player)).toBe(true)
    expect(isWriteAllowed('shared', visitor)).toBe(false)
    expect(isWriteAllowed('shared', none)).toBe(false)
  })

  it('explains the refusal with the action', () => {
    expect(guardMessage('enregistrer ce match')).toBe('Mode invité : choisis ton profil pour enregistrer ce match')
  })
})

describe('profile helpers', () => {
  it('profileId and the Réglages caption', () => {
    const player = currentProfile(settings({ myPlayerId: 'alice' }), players)
    expect(profileId(player)).toBe('alice')
    expect(profileId({ kind: 'visitor' })).toBeUndefined()
    expect(profileCaption(player)).toBe('Alice')
    expect(profileCaption({ kind: 'visitor' })).toBe('Invité (lecture seule)')
  })

  it('sends x-player-id for a player profile only', () => {
    expect(headerPlayerId(settings({ myPlayerId: 'alice' }))).toBe('alice')
    expect(headerPlayerId(settings({ myPlayerId: 'alice', visitor: true }))).toBeUndefined()
    expect(headerPlayerId(settings())).toBeUndefined()
  })

  it('re-registers push only on a profile switch with notifications on', () => {
    expect(shouldReregisterPush('alice', 'bob', true)).toBe(true)
    expect(shouldReregisterPush('alice', undefined, true)).toBe(true)
    expect(shouldReregisterPush('alice', 'alice', true)).toBe(false)
    expect(shouldReregisterPush('alice', 'bob', undefined)).toBe(false)
  })

  it('patches of « C’est moi » and « Visiter en invité »', () => {
    expect(playerProfilePatch('bob')).toEqual({ myPlayerId: 'bob', profileConfirmed: true, visitor: false })
    expect(VISITOR_PATCH).toEqual({ visitor: true, profileConfirmed: true, myPlayerId: undefined })
  })
})
