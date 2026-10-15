import { useOptionalAppState } from '../store'
import { currentProfile } from './profile'
import { showsTimes } from './times'

/** Whether this phone shows times of day (times.ts). False outside the provider, e.g. a row rendered alone in a test. */
export function useShowsTimes(): boolean {
  const app = useOptionalAppState()
  if (app === null) return false
  return showsTimes(currentProfile(app.store.settings, app.store.players))
}
