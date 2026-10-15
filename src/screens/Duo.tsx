import { useModeReplay } from '../rating/useModeReplay'
import { useReplay } from '../rating/useReplay'
import type { ReplayData } from './lists/context'
import { DuoView } from './lists/DuoView'

/** Duo (`#/duo/<idA>+<idB>`, 2V2 ranking): hooks only; the body lives in lists/DuoView.tsx. */
export function Duo({ id }: { id: string }) {
  const replay: ReplayData = useReplay()
  const duos = useModeReplay('2v2', replay.now)
  if (duos === null) return null
  return <DuoView replay={replay} duos={duos} id={id} />
}
