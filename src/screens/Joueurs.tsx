import { useReplay } from '../rating/useReplay'
import { useAppState } from '../store'
import type { ReplayData } from './lists/context'
import { JoueursView } from './lists/JoueursView'

/** Joueurs (`#/joueurs`, spec §3.6): hooks only; the body lives in lists/JoueursView.tsx. `add` opens the form. */
export function Joueurs({ add }: { add: boolean }) {
  const app = useAppState()
  const replay: ReplayData = useReplay()
  // Keyed by `add`: `#/joueurs?add=1` arriving on an already-mounted screen remounts the view with the form open.
  return <JoueursView key={String(add)} app={app} replay={replay} add={add} />
}
