import { useState } from 'react'
import { anyOpenCall } from '../calls/calls'
import { ProposeDialog } from '../calls/ProposeDialog'
import { requestCall } from '../calls/signal'
import { useCalls } from '../calls/useCalls'
import { useChooseProfile, useProfile, useWriteGuard } from '../profile/useWriteGuard'
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
  const calls = useCalls()
  const guard = useWriteGuard()
  const chooseProfile = useChooseProfile()
  const visitor = useProfile().kind === 'visitor'
  const shared = app.sync.mode === 'shared'
  const [proposing, setProposing] = useState(false)

  // A call already open (full or not) is simply shown again instead of creating a second one.
  function onPropose(): void {
    const open = anyOpenCall(app.store.calls, new Date(), app.store.callPlayers)
    if (open !== null) {
      requestCall(open.id)
      return
    }
    guard('proposer un baby', () => setProposing(true))
  }

  async function onSend(): Promise<void> {
    const callId = await calls.propose()
    setProposing(false)
    if (callId !== null) requestCall(callId)
  }

  // « Proposer un baby » needs a profile to sign the call: shared mode only (local mode has no profiles).
  return (
    <>
      <ClassementView
        app={app}
        replay={replay}
        installEnv={installEnv}
        onPropose={shared ? onPropose : undefined}
        onChooseProfile={visitor ? chooseProfile : undefined}
      />
      {proposing && (
        <ProposeDialog open busy={calls.busy} onSend={() => void onSend()} onCancel={() => setProposing(false)} />
      )}
    </>
  )
}
