import { useReplay } from '../rating/useReplay'
import { useAppState } from '../store'
import type { PlayerId } from '../types'
import type { ReplayData } from './lists/context'
import { JoueurView } from './lists/JoueurView'

/** Joueur (`#/joueurs/:id`, spec §3.7): hooks only; the body lives in lists/JoueurView.tsx. */
export function Joueur({ id }: { id: PlayerId }) {
  const app = useAppState()
  const replay: ReplayData = useReplay()
  return <JoueurView app={app} replay={replay} id={id} />
}
