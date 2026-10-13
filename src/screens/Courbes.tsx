import { useReplay } from '../rating/useReplay'
import { useAppState } from '../store'
import type { ReplayData } from './lists/context'
import { CourbesView } from './lists/CourbesView'

/** Courbes du classement (`#/courbes`, from Classement): hooks only; the body lives in lists/CourbesView.tsx. */
export function Courbes() {
  const app = useAppState()
  const replay: ReplayData = useReplay()
  return <CourbesView app={app} replay={replay} />
}
