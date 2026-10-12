// Profils déclaratifs (mode partagé): who this phone is, as pure decisions over the settings and the players. No
// React, no network, so everything here runs in vitest's node environment. The React side is useWriteGuard.ts.
import type { Player, PlayerId, Settings, SyncMode } from '../types'

export type Profile = { kind: 'player'; player: Player } | { kind: 'visitor' } | { kind: 'none' }

export const PROFILE_COPY = {
  title: 'Qui es-tu ?',
  body: 'Choisis ton profil : il signe tes matchs et tes réponses aux appels.',
  notListed: 'Je ne suis pas dans la liste',
  confirm: "C'est moi",
  visit: 'Visiter en invité',
  choose: 'Choisir mon profil',
  visitorBadge: 'Mode invité · Choisir mon profil',
  visitorCaption: 'Invité (lecture seule)',
  notificationsVisitor: 'Choisis ton profil pour recevoir les appels',
  mine: 'Mon profil',
  change: 'Changer',
  loading: 'Chargement des joueurs…',
} as const

const VISITOR: Profile = { kind: 'visitor' }
const NONE: Profile = { kind: 'none' }

/** A myPlayerId pointing to a deleted (or not yet synced) player counts as no profile at all. */
export function currentProfile(settings: Settings, players: Player[]): Profile {
  if (settings.visitor === true) return VISITOR
  const id = settings.myPlayerId
  if (id === undefined) return NONE
  const player = players.find((candidate) => candidate.id === id)
  if (player === undefined) return NONE
  return { kind: 'player', player }
}

/**
 * Mode partagé, office code set: the « Qui es-tu ? » screen replaces the shell until the profile is confirmed as an
 * existing player or as a visitor. Local mode never asks.
 */
export function needsProfileChoice(mode: SyncMode, settings: Settings, players: Player[]): boolean {
  if (mode !== 'shared') return false
  if (settings.officeCode === undefined) return false
  if (settings.profileConfirmed !== true) return true
  return currentProfile(settings, players).kind === 'none'
}

export function canWrite(profile: Profile): boolean {
  return profile.kind === 'player'
}

/** The write guard: local mode has no profiles and always writes; shared mode needs a player profile. */
export function isWriteAllowed(mode: SyncMode, profile: Profile): boolean {
  if (mode === 'local') return true
  return canWrite(profile)
}

/** « Mode invité : choisis ton profil pour enregistrer ce match ». */
export function guardMessage(actionLabel: string): string {
  return `Mode invité : choisis ton profil pour ${actionLabel}`
}

export function profileId(profile: Profile): PlayerId | undefined {
  if (profile.kind !== 'player') return undefined
  return profile.player.id
}

/** The x-player-id this phone sends: its player profile, never for a visitor. */
export function headerPlayerId(settings: Settings): PlayerId | undefined {
  if (settings.visitor === true) return undefined
  return settings.myPlayerId
}

/** Réglages › Mon profil caption: the player's name, or the read-only mention. */
export function profileCaption(profile: Profile): string {
  if (profile.kind === 'player') return profile.player.name
  return PROFILE_COPY.visitorCaption
}

/** A profile switch re-ties this phone's push subscription to the new player (or to nobody for a visitor). */
export function shouldReregisterPush(
  previousId: PlayerId | undefined,
  nextId: PlayerId | undefined,
  pushEnabled: boolean | undefined,
): boolean {
  if (previousId === nextId) return false
  return pushEnabled === true
}

/** The patches of the « Qui es-tu ? » screen and of « Changer » / « Choisir mon profil ». */
export function playerProfilePatch(id: PlayerId): Partial<Settings> {
  return { myPlayerId: id, profileConfirmed: true, visitor: false }
}

export const VISITOR_PATCH: Partial<Settings> = { visitor: true, profileConfirmed: true, myPlayerId: undefined }
export const CHOOSE_PROFILE_PATCH: Partial<Settings> = { profileConfirmed: false }
