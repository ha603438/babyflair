// Heures des matchs: only the owner's profile sees the time of day; everyone else sees days only. Pure, so it runs in
// vitest's node environment; the React side is useShowsTimes.ts.
import type { PlayerId } from '../types'
import type { Profile } from './profile'

export const TIME_VIEWER_IDS: ReadonlySet<PlayerId> = new Set(['061684ac-7047-421b-8a41-c3b053cfbde2'])

export function showsTimes(profile: Profile): boolean {
  if (profile.kind !== 'player') return false
  return TIME_VIEWER_IDS.has(profile.player.id)
}
