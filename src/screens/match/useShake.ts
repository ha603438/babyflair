import { useCallback, useEffect, useRef, useState } from 'react'

const SHAKE_MS = 200

/**
 * `.is-shaking` toggle for the slot block (spec §4 step A, §8): 200 ms after a chip tap that has nowhere to go.
 * A tap during the shake is ignored (the feedback is already on screen); the timer is cleared on unmount.
 */
export function useShake(): { shaking: boolean; shake: () => void } {
  const [shaking, setShaking] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const shake = useCallback(() => {
    if (timer.current !== null) return
    setShaking(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setShaking(false)
    }, SHAKE_MS)
  }, [])

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  return { shaking, shake }
}
