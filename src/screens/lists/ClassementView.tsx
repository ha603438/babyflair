import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import type { EmptyStateAction } from '../../components/EmptyState'
import { HintCard } from '../../components/HintCard'
import { SectionHeader } from '../../components/SectionHeader'
import { RankRow } from '../../components/rows'
import type { RankRowVariant } from '../../components/rows'
import { plural } from '../../format'
import { hrefOf, navigate } from '../../router'
import type { Action } from '../../store'
import type { PlayerId, Ranking } from '../../types'
import type { ReplayData, ScreenContext } from './context'
import { pickHint } from './hints'
import type { Hint, InstallEnv } from './hints'
import { promptInstall } from './install'
import { contextStripText, latestMatch } from './labels'

// Classement screen body (spec §3.1): context strip, one HintCard, observation card, ranked list, rookie and
// inactive sections, empty states and the post-match highlight. Engine data arrives through `replay`.

export type ClassementViewProps = { app: ScreenContext; replay: ReplayData; installEnv: InstallEnv }

const INSTALL_TITLE = "Installe BabyFlair sur l'écran d'accueil"
const INSTALL_BODY_IOS =
  "Dans Safari : Partager, puis « Sur l'écran d'accueil ». " +
  "L'app s'ouvre en plein écran, même hors ligne, et tes données restent."
const INSTALL_BODY_CHROMIUM = "Ouvre l'app en plein écran, même sans réseau."
const OBSERVATION_TEXT = 'Tout le monde est encore en observation : 10 matchs chacun pour entrer au classement.'
const MIN_PLAYERS_FOR_MATCH = 2

type Dispatch = (action: Action) => void
type Highlight = ReadonlySet<PlayerId>

// ---------------------------------------------------------------------------
// Context strip
// ---------------------------------------------------------------------------

function ContextStrip({ app, replay }: { app: ScreenContext; replay: ReplayData }) {
  const { matches } = app.store
  const latest = latestMatch(matches)
  if (latest === undefined) return null
  return (
    <a className="ctx-strip" href={hrefOf({ name: 'historique' })}>
      {contextStripText(matches.length, replay.ranking.ranked.length, latest.playedAt, replay.now)}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Hint card (one at a time; decision in hints.ts)
// ---------------------------------------------------------------------------

function dismissInstall(dispatch: Dispatch): void {
  dispatch({ type: 'setSetting', patch: { installHintDismissedAt: new Date().toISOString() } })
}

function dismissExport(dispatch: Dispatch): void {
  dispatch({ type: 'setSetting', patch: { exportHintDismissedAt: new Date().toISOString() } })
}

function install(): void {
  void promptInstall()
}

function hintCard(hint: Hint, dispatch: Dispatch): ReactNode {
  if (hint.kind === 'install-ios') {
    return <HintCard title={INSTALL_TITLE} body={INSTALL_BODY_IOS} onDismiss={() => dismissInstall(dispatch)} />
  }
  if (hint.kind === 'install-chromium') {
    return (
      <HintCard
        title={INSTALL_TITLE}
        body={INSTALL_BODY_CHROMIUM}
        primary={{ label: 'Installer', onClick: install }}
        onDismiss={() => dismissInstall(dispatch)}
      />
    )
  }
  return (
    <HintCard
      title={`${plural(hint.count, 'match')} depuis le dernier export.`}
      body="Pense à sauvegarder."
      primary={{ label: 'Exporter', onClick: () => navigate({ name: 'reglages' }) }}
      onDismiss={() => dismissExport(dispatch)}
    />
  )
}

function HintSlot({ hint, dispatch }: { hint: Hint | null; dispatch: Dispatch }) {
  if (hint === null) return null
  return <div className="content lists-block">{hintCard(hint, dispatch)}</div>
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

function ObservationCard({ ranking }: { ranking: Ranking }) {
  if (ranking.ranked.length > 0 || ranking.rookies.length === 0) return null
  return (
    <div className="content lists-block">
      <Card>
        <p className="obs-text">{OBSERVATION_TEXT}</p>
      </Card>
    </div>
  )
}

function rankOf(variant: RankRowVariant, index: number): number | undefined {
  if (variant !== 'ranked') return undefined
  return index + 1
}

type RowsProps = { ids: PlayerId[]; variant: RankRowVariant; replay: ReplayData; highlight: Highlight }

function rankRow(id: PlayerId, index: number, { variant, replay, highlight }: RowsProps): ReactNode {
  const player = replay.players.get(id)
  const stats = replay.result.byPlayer.get(id)
  if (player === undefined || stats === undefined) return null
  return (
    <RankRow
      key={id}
      player={player}
      stats={stats}
      variant={variant}
      rank={rankOf(variant, index)}
      now={replay.now}
      href={hrefOf({ name: 'joueur', id })}
      highlight={highlight.has(id)}
    />
  )
}

function RankRows(props: RowsProps) {
  if (props.ids.length === 0) return null
  return <div className="rows">{props.ids.map((id, index) => rankRow(id, index, props))}</div>
}

type SectionProps = RowsProps & { title: string; subtitle: string }

function RankSection({ title, subtitle, ...rows }: SectionProps) {
  if (rows.ids.length === 0) return null
  return (
    <section>
      <SectionHeader title={title} subtitle={subtitle} />
      <RankRows {...rows} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function newMatchAction(playerCount: number): EmptyStateAction {
  const action: EmptyStateAction = { label: 'Nouveau match', onClick: () => navigate({ name: 'match' }) }
  if (playerCount >= MIN_PLAYERS_FOR_MATCH) return action
  return { ...action, disabled: true, caption: 'Il faut au moins 2 joueurs' }
}

function NoMatchesYet({ playerCount }: { playerCount: number }) {
  return (
    <EmptyState
      compact
      title="Pas encore de classement"
      body="Enregistre un match pour commencer."
      action={newMatchAction(playerCount)}
    />
  )
}

function NoPlayersYet() {
  return (
    <EmptyState
      title="Pas encore de joueurs"
      body="Ajoute les collègues, puis enregistre le premier match."
      action={{ label: 'Ajouter des joueurs', onClick: () => navigate({ name: 'joueurs', add: true }) }}
    />
  )
}

function Body({ app, replay, highlight }: { app: ScreenContext; replay: ReplayData; highlight: Highlight }) {
  const { players, matches } = app.store
  if (players.length === 0) return <NoPlayersYet />
  const { ranking } = replay
  return (
    <>
      {matches.length === 0 && <NoMatchesYet playerCount={players.length} />}
      <ObservationCard ranking={ranking} />
      <RankRows ids={ranking.ranked} variant="ranked" replay={replay} highlight={highlight} />
      <RankSection
        title="Pas encore classés"
        subtitle="classés après 10 matchs"
        ids={ranking.rookies}
        variant="rookie"
        replay={replay}
        highlight={highlight}
      />
      <RankSection
        title="Inactifs"
        subtitle="sans match depuis 30 jours"
        ids={ranking.inactive}
        variant="inactive"
        replay={replay}
        highlight={highlight}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Highlight after a match (navigation payload `highlightIds`)
// ---------------------------------------------------------------------------

// Rows render as <a href="#/joueurs/:id">; the first match in DOM order is the highest-ranked highlighted player.
function scrollToFirstHighlighted(root: HTMLElement | null, highlight: Highlight): void {
  if (root === null) return
  const hrefs = new Set([...highlight].map((id) => hrefOf({ name: 'joueur', id })))
  const rows = Array.from(root.querySelectorAll<HTMLAnchorElement>('a.row'))
  const first = rows.find((row) => hrefs.has(row.getAttribute('href') ?? ''))
  if (first === undefined || typeof first.scrollIntoView !== 'function') return
  first.scrollIntoView({ block: 'nearest' })
}

/** Reads the navigation payload once on mount: those rows get `.row--flash` and the first one is scrolled to. */
function useHighlight(nav: ScreenContext['nav'], rootRef: RefObject<HTMLDivElement | null>): Highlight {
  const [highlight] = useState<Highlight>(() => new Set(nav.get().highlightIds ?? []))
  useEffect(() => {
    const payload = nav.take()
    // Only highlightIds is ours; rankBefore belongs to the Match result view and goes back untouched.
    if (payload.rankBefore !== undefined) nav.set({ rankBefore: payload.rankBefore })
    if (highlight.size === 0) return
    scrollToFirstHighlighted(rootRef.current, highlight)
  }, [nav, rootRef, highlight])
  return highlight
}

export function ClassementView({ app, replay, installEnv }: ClassementViewProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const highlight = useHighlight(app.nav, rootRef)
  const hint = pickHint(installEnv, app.store.matches, app.store.settings, replay.now)
  return (
    <div ref={rootRef} className="lists-screen classement">
      <ContextStrip app={app} replay={replay} />
      <HintSlot hint={hint} dispatch={app.dispatch} />
      <Body app={app} replay={replay} highlight={highlight} />
    </div>
  )
}
