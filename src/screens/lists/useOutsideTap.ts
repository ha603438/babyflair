import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Calls `onOutside` on a pointerdown that lands outside `ref` while `active` (the inline add form on Joueurs
 * collapses when tapping elsewhere, spec §3.6). Pointer events rather than focus: Safari does not focus buttons on
 * tap, so a blur-based version would collapse the form before its own « Ajouter » click lands.
 */
export function useOutsideTap(ref: RefObject<HTMLElement | null>, active: boolean, onOutside: () => void): void {
  useEffect(() => {
    if (!active) return
    const handle = (event: PointerEvent): void => {
      const element = ref.current
      if (element === null || !(event.target instanceof Node) || element.contains(event.target)) return
      onOutside()
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  }, [ref, active, onOutside])
}
