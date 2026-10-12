// Réglages (spec §3.8): export / import, rules link, install row, « Tout effacer », footer.
// Mode partagé: « Code du bureau » row, « Déconnecter cet appareil » instead of « Tout effacer », sync footer.
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { PUSH_COPY, unsupportedCopy } from '../calls/push'
import { usePush } from '../calls/usePush'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { HintCard } from '../components/HintCard'
import { SectionHeader } from '../components/SectionHeader'
import { SettingRow } from '../components/rows'
import type { ImportOk, StandaloneEnv } from '../io'
import {
  buildExportText,
  deliverExport,
  EXPORT_MIME,
  exportCaption,
  exportFileName,
  importSummary,
  isExportOverdue,
  isStandalone,
  parseImport,
  settingsFooter,
} from '../io'
import { hrefOf, navigate } from '../router'
import { useAppState } from '../store'
import { promptInstall, useInstallEnv } from './lists/install'

const IOS_HINT_TITLE = "Installe BabyFlair sur l'écran d'accueil"
const IOS_HINT_BODY =
  "Dans Safari : Partager, puis « Sur l'écran d'accueil ». L'app s'ouvre en plein écran, même hors ligne, " +
  'et tes données restent.'

type Pending = { kind: 'import'; data: ImportOk } | { kind: 'invalid' } | { kind: 'clear' } | null

const CLEAR_COPY = {
  local: {
    row: 'Tout effacer',
    title: 'Tout effacer ?',
    body: 'Joueurs et matchs seront supprimés définitivement. Pense à exporter avant.',
    confirm: 'Tout effacer',
    toast: 'Données effacées',
  },
  shared: {
    row: 'Déconnecter cet appareil',
    title: 'Déconnecter cet appareil ?',
    body: 'Les données restent sur le serveur. Ce téléphone oublie le code du bureau et sa copie locale.',
    confirm: 'Déconnecter',
    toast: 'Appareil déconnecté',
  },
} as const

// Server rendering (tests) has no real window; a bare object reads as « not standalone ».
function browserEnv(): StandaloneEnv {
  if (typeof window === 'undefined') return {}
  return window
}

function PushAction({ push }: { push: ReturnType<typeof usePush> }) {
  if (push.support !== 'ok') return null
  const label = push.enabled ? PUSH_COPY.disable : PUSH_COPY.enable
  const onClick = push.enabled ? push.disable : push.enable
  return (
    <Button variant="secondary" inline disabled={push.busy} onClick={() => void onClick()}>
      {label}
    </Button>
  )
}

export function Reglages() {
  const { store, dispatch, toast, sync } = useAppState()
  const push = usePush()
  const shared = sync.mode === 'shared'
  const clearCopy = CLEAR_COPY[sync.mode]
  const [pending, setPending] = useState<Pending>(null)
  const [iosHint, setIosHint] = useState(false)
  const installEnv = useInstallEnv()
  const fileInput = useRef<HTMLInputElement>(null)
  // Captured once per visit of the screen: render stays pure, the caption is fresh each time Réglages opens.
  const [now] = useState(() => new Date())
  const lastExportAt = store.settings.lastExportAt

  async function exportData(): Promise<void> {
    const at = new Date()
    const file = new File([buildExportText(store, at)], exportFileName(at), { type: EXPORT_MIME })
    const outcome = await deliverExport(file, { navigator, document, url: URL })
    if (outcome === 'cancelled') return
    dispatch({ type: 'setSetting', patch: { lastExportAt: at.toISOString() } })
    toast.show({ text: 'Export prêt' })
  }

  async function readChosenFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Reset before reading so choosing the same file again fires a new change event.
    input.value = ''
    if (!file) return
    const parsed = parseImport(await file.text())
    if (!parsed.ok) {
      setPending({ kind: 'invalid' })
      return
    }
    setPending({ kind: 'import', data: parsed })
  }

  // In shared mode the provider also sends the file to the server (replaceAll) and refetches.
  function confirmImport(data: ImportOk): void {
    dispatch({ type: 'importAll', players: data.players, matches: data.matches, settings: data.settings })
    setPending(null)
    toast.show({ text: 'Données importées' })
  }

  // Shared mode: clearAll only drops the local cache and the office code (the gate shows again), never the server.
  function confirmClear(): void {
    setPending(null)
    dispatch({ type: 'clearAll' })
    navigate({ name: 'classement' })
    toast.show({ text: clearCopy.toast })
  }

  function forgetOfficeCode(): void {
    dispatch({ type: 'setSetting', patch: { officeCode: undefined } })
  }

  function install(): void {
    // Chromium: the beforeinstallprompt captured by lists/install.ts; anywhere else, the iOS instructions.
    if (installEnv.promptAvailable) {
      void promptInstall()
      return
    }
    setIosHint(true)
  }

  const importBody = pending?.kind === 'import' ? importSummary(pending.data, store) : ''
  const footerSync = shared ? { lastSyncAt: sync.lastSyncAt, now } : undefined

  return (
    <div className="settings-col">
      <SectionHeader title="Données" />
      <div className="settings-group">
        <SettingRow
          title="Exporter les données"
          caption={exportCaption(lastExportAt, now)}
          captionWarn={isExportOverdue(store.matches, lastExportAt, now)}
          onClick={() => void exportData()}
        />
        <SettingRow
          title="Importer des données"
          caption="Remplace tout par un fichier JSON BabyFlair"
          onClick={() => fileInput.current?.click()}
        />
      </div>

      <SectionHeader title="Application" />
      <div className="settings-group">
        <SettingRow title="Comment ça marche" chevron href={hrefOf({ name: 'comment-ca-marche' })} />
        {shared && (
          <SettingRow
            title="Code du bureau"
            caption="Modifier le code mémorisé sur ce téléphone"
            onClick={forgetOfficeCode}
          />
        )}
        {!isStandalone(browserEnv()) && <SettingRow title="Installer sur l'écran d'accueil" onClick={install} />}
        <SettingRow
          title={PUSH_COPY.title}
          caption={unsupportedCopy(push.support) ?? PUSH_COPY.caption}
          trailing={<PushAction push={push} />}
        />
        {iosHint && (
          <div className="settings-hint">
            <HintCard title={IOS_HINT_TITLE} body={IOS_HINT_BODY} onDismiss={() => setIosHint(false)} />
          </div>
        )}
      </div>

      <SectionHeader title="Zone dangereuse" />
      <div className="settings-group">
        <SettingRow title={clearCopy.row} danger onClick={() => setPending({ kind: 'clear' })} />
      </div>

      <p className="settings-footer">{settingsFooter(store, footerSync)}</p>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => void readChosenFile(event)}
      />

      <ConfirmDialog
        open={pending?.kind === 'import'}
        title="Importer ce fichier ?"
        body={importBody}
        confirmLabel="Importer"
        onConfirm={() => {
          if (pending?.kind === 'import') confirmImport(pending.data)
        }}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'invalid'}
        title="Fichier invalide"
        body="Ce n'est pas un export BabyFlair."
        confirmLabel="OK"
        single
        onConfirm={() => setPending(null)}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending?.kind === 'clear'}
        title={clearCopy.title}
        body={clearCopy.body}
        confirmLabel={clearCopy.confirm}
        danger
        onConfirm={confirmClear}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
