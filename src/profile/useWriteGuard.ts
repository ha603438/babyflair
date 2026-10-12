// React side of the profiles: the current profile, « Choisir mon profil » and the write guard used by every screen
// action that changes shared data. Decisions live in profile.ts.
import { useCallback, useMemo } from 'react'
import { useAppState } from '../store'
import type { Profile } from './profile'
import { CHOOSE_PROFILE_PATCH, currentProfile, guardMessage, isWriteAllowed, PROFILE_COPY } from './profile'

/** `guard('enregistrer ce match', save)`: runs `save`, or explains that a visitor has to choose a profile first. */
export type Guard = (actionLabel: string, fn: () => void) => void

export function useProfile(): Profile {
  const { store } = useAppState()
  const { settings, players } = store
  return useMemo(() => currentProfile(settings, players), [settings, players])
}

/** Clears the confirmation: the shell gives way to the « Qui es-tu ? » screen. */
export function useChooseProfile(): () => void {
  const { dispatch } = useAppState()
  return useCallback(() => dispatch({ type: 'setSetting', patch: CHOOSE_PROFILE_PATCH }), [dispatch])
}

export function useWriteGuard(): Guard {
  const { sync, toast } = useAppState()
  const profile = useProfile()
  const chooseProfile = useChooseProfile()
  const allowed = isWriteAllowed(sync.mode, profile)
  const showToast = toast.show
  return useCallback(
    (actionLabel: string, fn: () => void) => {
      if (allowed) {
        fn()
        return
      }
      showToast({ text: guardMessage(actionLabel), action: { label: PROFILE_COPY.choose, onClick: chooseProfile } })
    },
    [allowed, chooseProfile, showToast],
  )
}
