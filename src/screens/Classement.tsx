import { useReplay } from '../rating/useReplay'
import { useAppState } from '../store'
import { ClassementView } from './lists/ClassementView'
import type { ReplayData } from './lists/context'
import { useInstallEnv } from './lists/install'

/** Classement (`#/`, spec §3.1): hooks only; the body lives in lists/ClassementView.tsx. */
export function Classement() {
  const app = useAppState()
  const replay: ReplayData = useReplay()
  const installEnv = useInstallEnv()
  return <ClassementView app={app} replay={replay} installEnv={installEnv} />
}
