import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Header } from './components/Header'
import { SegmentedControl } from './components/SegmentedControl'
import { TabBar } from './components/TabBar'
import type { TabName } from './components/TabBar'
import { Toast } from './components/Toast'
import { IconButton } from './components/Button'
import { Help, Settings } from './components/icons'
import { hrefOf, navigate, useRoute } from './router'
import { applyUpdate, checkForUpdate, isUpdateAvailable, UPDATE_TOASTS } from './update'
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
import { Nouveautes } from './screens/Nouveautes'
import { unseenEntries } from './changelog'
import { CodeGate } from './screens/CodeGate'
import { Journal } from './screens/Journal'
import { CallWatcher } from './calls/CallWatcher'
import { JOURNAL_COPY } from './profile/journal'
import { needsProfileChoice } from './profile/profile'
import { ProfileGate } from './profile/ProfileGate'
import { useProfilePush } from './profile/useProfilePush'

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
    case 'nouveautes':
      return <Nouveautes />
    case 'journal':
      return <Journal />
    case 'appel':
      return <Classement />
  }
}

/** Header per route (spec §2 table). Pushed screens get the back chevron; tab roots get at most one icon button. */
/** « ＋ Match » in the tab-root headers: the shortest way to record a match from anywhere. */
function NewMatchShortcut() {
  const { draft, draftDispatch } = useAppState()
  function open(): void {
    if (draft.step === 'done') draftDispatch({ type: 'reset' })
    navigate({ name: 'match' })
  }
  return (
    <button type="button" className="header-newmatch" onClick={open} aria-label="Nouveau match">
      <span aria-hidden="true">＋</span> Match
    </button>
  )
}

function AppHeader({ route }: { route: Route }) {
  const { store, draft, draftDispatch, toast } = useAppState()
  const showToast = toast.show
  function onBrandDoubleTap(): void {
    void checkForUpdate().then((outcome) => showToast({ text: UPDATE_TOASTS[outcome] }))
  }

  switch (route.name) {
    case 'classement':
    case 'appel':
      return (
        <Header
          onBrandDoubleTap={onBrandDoubleTap}
          title="Classement"
          left={<NewMatchShortcut />}
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
          title="Nouveau match"
          below={
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
      return <Header title="Historique" onBrandDoubleTap={onBrandDoubleTap} left={<NewMatchShortcut />} />
    case 'match-detail':
      return <Header title="Match" back />
    case 'joueurs':
      return (
        <Header
          onBrandDoubleTap={onBrandDoubleTap}
          title="Joueurs"
          left={<NewMatchShortcut />}
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
    case 'nouveautes':
      return <Header title="Nouveautés" onBrandDoubleTap={onBrandDoubleTap} left={<NewMatchShortcut />} />
    case 'journal':
      return <Header title={JOURNAL_COPY.title} onBrandDoubleTap={onBrandDoubleTap} left={<NewMatchShortcut />} />
  }
}

function AppShell() {
  const route = useRoute()
  const { store, draft, draftDispatch, toast, storageBlocked } = useAppState()
  const newsBadge = unseenEntries(store.settings).length
  const showToast = toast.show
  const mainRef = useRef<HTMLElement>(null)

  // Storage error copy (spec §9 « Générique »): shown once each time saving starts failing.
  useEffect(() => {
    if (!storageBlocked) return
    showToast({ text: STORAGE_BLOCKED_TEXT })
  }, [storageBlocked, showToast])

  // New version deployed: checked at launch and each time the app comes back to the foreground (at most once a minute).
  useEffect(() => {
    if (import.meta.env.DEV) return
    let lastCheck = 0
    let offered = false
    function check(): void {
      if (offered || document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastCheck < 60_000) return
      lastCheck = now
      void isUpdateAvailable().then((available) => {
        if (!available || offered) return
        offered = true
        showToast({
          text: 'Nouvelle version disponible',
          action: { label: 'Mettre à jour', onClick: () => void applyUpdate() },
          ttlMs: 15_000,
        })
      })
    }
    check()
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [showToast])

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
      <TabBar current={route.name} onReselect={onReselect} newsBadge={newsBadge} />
      <Toast toast={toast.current} onDismiss={toast.dismiss} />
      <CallWatcher route={route} />
    </div>
  )
}

/**
 * Mode partagé: the office code gate replaces the shell until the server accepts this phone's code, then
 * « Qui es-tu ? » until this phone has a profile (player or visitor).
 */
function Root() {
  const { store, sync } = useAppState()
  useProfilePush()
  if (isGateNeeded(sync.mode, store.settings.officeCode, sync.status)) return <CodeGate />
  if (needsProfileChoice(sync.mode, store.settings, store.players)) return <ProfileGate />
  return <AppShell />
}

export default function App() {
  return (
    <AppStateProvider>
      <Root />
    </AppStateProvider>
  )
}
