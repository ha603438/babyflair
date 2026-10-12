import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Header } from './components/Header'
import { SegmentedControl } from './components/SegmentedControl'
import { TabBar } from './components/TabBar'
import type { TabName } from './components/TabBar'
import { Toast } from './components/Toast'
import { IconButton } from './components/Button'
import { Help, Settings } from './components/icons'
import { hrefOf, useRoute } from './router'
import { checkForUpdate, UPDATE_TOASTS } from './update'
import type { Route } from './router'
import { AppStateProvider, isGateNeeded, useAppState } from './store'
import type { Format } from './types'
import { Classement } from './screens/Classement'
import { Match } from './screens/Match'
import { MatchEdit } from './screens/MatchEdit'
import { Historique } from './screens/Historique'
import { MatchDetail } from './screens/MatchDetail'
import { Joueurs } from './screens/Joueurs'
import { Joueur } from './screens/Joueur'
import { Reglages } from './screens/Reglages'
import { CommentCaMarche } from './screens/CommentCaMarche'
import { CodeGate } from './screens/CodeGate'

const STORAGE_BLOCKED_TEXT = "Impossible d'enregistrer : le stockage du navigateur est bloqué (navigation privée ?)."

const FORMAT_OPTIONS = [
  { value: '1v1', label: '1v1' },
  { value: '2v2', label: '2v2' },
] as const satisfies readonly { value: Format; label: string }[]

function Screen({ route }: { route: Route }): ReactNode {
  switch (route.name) {
    case 'classement':
      return <Classement />
    case 'match':
      return <Match />
    case 'match-edit':
      return <MatchEdit id={route.id} />
    case 'historique':
      return <Historique />
    case 'match-detail':
      return <MatchDetail id={route.id} />
    case 'joueurs':
      return <Joueurs add={route.add === true} />
    case 'joueur':
      return <Joueur id={route.id} />
    case 'reglages':
      return <Reglages />
    case 'comment-ca-marche':
      return <CommentCaMarche />
  }
}

/** Header per route (spec §2 table). Pushed screens get the back chevron; tab roots get at most one icon button. */
function AppHeader({ route }: { route: Route }) {
  const { store, draft, draftDispatch, toast } = useAppState()
  const showToast = toast.show
  function onBrandDoubleTap(): void {
    void checkForUpdate().then((outcome) => showToast({ text: UPDATE_TOASTS[outcome] }))
  }

  switch (route.name) {
    case 'classement':
      return (
        <Header
          onBrandDoubleTap={onBrandDoubleTap}
          title="Classement"
          right={
            <IconButton label="Comment ça marche" href={hrefOf({ name: 'comment-ca-marche' })}>
              <Help />
            </IconButton>
          }
        />
      )
    case 'match':
      return (
        <Header
          onBrandDoubleTap={onBrandDoubleTap}
          title="BabyFlair"
          compact
          right={
            <SegmentedControl
              options={FORMAT_OPTIONS}
              value={draft.format}
              onChange={(format) => draftDispatch({ type: 'setFormat', format })}
              aria-label="Format"
            />
          }
        />
      )
    case 'match-edit':
      return <Header title="Modifier le match" back />
    case 'historique':
      return <Header title="Historique" onBrandDoubleTap={onBrandDoubleTap} />
    case 'match-detail':
      return <Header title="Match" back />
    case 'joueurs':
      return (
        <Header
          onBrandDoubleTap={onBrandDoubleTap}
          title="Joueurs"
          right={
            <IconButton label="Réglages" href={hrefOf({ name: 'reglages' })}>
              <Settings />
            </IconButton>
          }
        />
      )
    case 'joueur': {
      const player = store.players.find((p) => p.id === route.id)
      return (
        <Header
          title={player?.name ?? 'Joueur'}
          back
        />
      )
    }
    case 'reglages':
      return <Header title="Réglages" back />
    case 'comment-ca-marche':
      return <Header title="Comment ça marche" back />
  }
}

function AppShell() {
  const route = useRoute()
  const { draft, draftDispatch, toast, storageBlocked } = useAppState()
  const showToast = toast.show
  const mainRef = useRef<HTMLElement>(null)

  // Storage error copy (spec §9 « Générique »): shown once each time saving starts failing.
  useEffect(() => {
    if (!storageBlocked) return
    showToast({ text: STORAGE_BLOCKED_TEXT })
  }, [storageBlocked, showToast])

  // Tapping the active tab scrolls to top; on « Match » it also resets an empty draft (spec §2).
  function onReselect(tab: TabName) {
    mainRef.current?.scrollTo({ top: 0 })
    if (tab !== 'match') return
    const isEmpty = draft.slots.every((slot) => slot === null)
    if (isEmpty) draftDispatch({ type: 'reset' })
  }

  return (
    <div className="app">
      <AppHeader route={route} />
      <main ref={mainRef}>
        <Screen route={route} />
      </main>
      <TabBar current={route.name} onReselect={onReselect} />
      <Toast toast={toast.current} onDismiss={toast.dismiss} />
    </div>
  )
}

/** Mode partagé: the office code gate replaces the shell until the server accepts this phone's code. */
function Root() {
  const { store, sync } = useAppState()
  if (isGateNeeded(sync.mode, store.settings.officeCode, sync.status)) return <CodeGate />
  return <AppShell />
}

export default function App() {
  return (
    <AppStateProvider>
      <Root />
    </AppStateProvider>
  )
}
