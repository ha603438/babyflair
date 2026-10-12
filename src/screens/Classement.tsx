import { useState } from 'react'
import { anyOpenCall } from '../calls/calls'
import { ProposeDialog } from '../calls/ProposeDialog'
import { requestCall } from '../calls/signal'
import { useCalls } from '../calls/useCalls'
import { useReplay } from '../rating/useReplay'
import { useAppState } from '../store'
import type { PlayerId } from '../types'
import { ClassementView } from './lists/ClassementView'
import type { ReplayData } from './lists/context'
import { useInstallEnv } from './lists/install'

/** Classement (`#/`, spec §3.1): hooks only; the body lives in lists/ClassementView.tsx. */
export function Classement() {
  const app = useAppState()
  const replay: ReplayData = useReplay()
  const installEnv = useInstallEnv()
  const calls = useCalls()
  const [proposing, setProposing] = useState(false)

  // A call already open (full or not) is simply shown again instead of creating a second one.
  function onPropose(): void {
    const open = anyOpenCall(app.store.calls, new Date())
    if (open !== null) {
      requestCall(open.id)
      return
    }
    setProposing(true)
  }

  async function onSend(playerId: PlayerId): Promise<void> {
    const callId = await calls.propose(playerId)
    setProposing(false)
    if (callId !== null) requestCall(callId)
  }

  return (
    <>
      <ClassementView app={app} replay={replay} installEnv={installEnv} onPropose={onPropose} />
      {proposing && (
        <ProposeDialog
          open
          players={app.store.players}
          initial={app.store.settings.myPlayerId}
          busy={calls.busy}
          onSend={(id) => void onSend(id)}
          onCancel={() => setProposing(false)}
        />
      )}
    </>
  )
}
