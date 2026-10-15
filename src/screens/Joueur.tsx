import { useWriteGuard } from '../profile/useWriteGuard'
import { useModeReplay } from '../rating/useModeReplay'
import { useReplay } from '../rating/useReplay'
import { useAppState } from '../store'
import type { Format, Match, PlayerId } from '../types'
import type { ReplayData } from './lists/context'
import { JoueurView } from './lists/JoueurView'

/** The 1V1 ranking is replayed only for a player with a 1v1 match (the « 1V1 : … » line of the hero). */
function oneVsOneFormat(matches: Match[], id: PlayerId): Format | null {
  const plays = matches.some((match) => match.teamA.length === 1 && (match.teamA[0] === id || match.teamB[0] === id))
  if (!plays) return null
  return '1v1'
}

/** Joueur (`#/joueurs/:id`, spec §3.7): hooks only; the body lives in lists/JoueurView.tsx. */
export function Joueur({ id }: { id: PlayerId }) {
  const app = useAppState()
  const replay: ReplayData = useReplay()
  const guard = useWriteGuard()
  const oneVsOne = useModeReplay(oneVsOneFormat(app.store.matches, id), replay.now)
  return <JoueurView app={app} replay={replay} id={id} guard={guard} oneVsOne={oneVsOne} />
}
