// Mode partagé: the office code gate, shown instead of the shell until this phone holds a code the server accepts.
import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Button } from '../components/Button'
import { createApi } from '../remote/api'
import { remoteConfig } from '../remote/config'
import { PROBE_ERRORS, probeOffice, useAppState } from '../store'
import type { ProbeOutcome } from '../store/remote-sync'

const GATE_BODY = 'Entre le code du bureau pour rejoindre le classement.'

async function probe(code: string): Promise<ProbeOutcome> {
  const config = remoteConfig()
  if (config === null) return 'server'
  return probeOffice(createApi({ fetch: (url, init) => fetch(url, init), config, officeCode: code }))
}

export function CodeGate() {
  const { store, dispatch, sync } = useAppState()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const trimmed = code.trim()

  function onChange(event: ChangeEvent<HTMLInputElement>): void {
    setCode(event.target.value)
    if (error !== null) setError(null)
  }

  function join(accepted: string): void {
    // Same code as the one already stored (it was refused, then fixed server-side): only the refetch is needed.
    if (accepted === store.settings.officeCode) {
      void sync.refresh()
      return
    }
    dispatch({ type: 'setSetting', patch: { officeCode: accepted } })
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (trimmed.length === 0 || busy) return
    setBusy(true)
    setError(null)
    const outcome = await probe(trimmed)
    setBusy(false)
    if (outcome === 'ok') {
      join(trimmed)
      return
    }
    setError(PROBE_ERRORS[outcome])
  }

  return (
    <div className="gate safe-top safe-bottom">
      <form className="gate-card" onSubmit={(event) => void submit(event)} noValidate>
        <img className="gate-logo" src={`${import.meta.env.BASE_URL}logo.png`} alt="" width="240" height="240" />
        <h1 className="gate-title">BabyFlair</h1>
        <p className="gate-body">{GATE_BODY}</p>
        <input
          className="inline-form-input gate-input"
          type="text"
          value={code}
          onChange={onChange}
          placeholder="Code du bureau"
          aria-label="Code du bureau"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'gate-error' : undefined}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          autoFocus
        />
        {error && (
          <p id="gate-error" className="inline-form-error" role="alert">
            {error}
          </p>
        )}
        <Button variant="primary" type="submit" disabled={busy || trimmed.length === 0}>
          Entrer
        </Button>
      </form>
    </div>
  )
}
