// Réglages (spec §3.8): export / import, rules link, install row, « Tout effacer », footer.
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
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

// Server rendering (tests) has no real window; a bare object reads as « not standalone ».
function browserEnv(): StandaloneEnv {
  if (typeof window === 'undefined') return {}
  return window
}

export function Reglages() {
  const { store, dispatch, toast } = useAppState()
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

  function confirmImport(data: ImportOk): void {
    dispatch({ type: 'importAll', players: data.players, matches: data.matches, settings: data.settings })
    setPending(null)
    toast.show({ text: 'Données importées' })
  }

  function confirmClear(): void {
    setPending(null)
    dispatch({ type: 'clearAll' })
    navigate({ name: 'classement' })
    toast.show({ text: 'Données effacées' })
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
        {!isStandalone(browserEnv()) && <SettingRow title="Installer sur l'écran d'accueil" onClick={install} />}
        {iosHint && (
          <div className="settings-hint">
            <HintCard title={IOS_HINT_TITLE} body={IOS_HINT_BODY} onDismiss={() => setIosHint(false)} />
          </div>
        )}
      </div>

      <SectionHeader title="Zone dangereuse" />
      <div className="settings-group">
        <SettingRow title="Tout effacer" danger onClick={() => setPending({ kind: 'clear' })} />
      </div>

      <p className="settings-footer">{settingsFooter(store)}</p>

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
        title="Tout effacer ?"
        body="Joueurs et matchs seront supprimés définitivement. Pense à exporter avant."
        confirmLabel="Tout effacer"
        danger
        onConfirm={confirmClear}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
