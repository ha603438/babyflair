import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { CALL_COPY } from '../../calls/calls'
import { PUSH_COPY } from '../../calls/push'
import { PROFILE_COPY } from '../../profile/profile'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import type { EmptyStateAction } from '../../components/EmptyState'
import { HintCard } from '../../components/HintCard'
import { SectionHeader } from '../../components/SectionHeader'
import { SegmentedControl } from '../../components/SegmentedControl'
import { RankRow } from '../../components/rows'
import type { RankRowVariant } from '../../components/rows'
import { teamDuoId } from '../../duo'
import type { ModeReplay } from '../../rating/modes'
import { hrefOf, navigate } from '../../router'
import type { Action } from '../../store'
import type { Match, PlayerId, Ranking, RankingTab } from '../../types'
import type { ReplayData, ScreenContext } from './context'
import { pickHint } from './hints'
import type { Hint, InstallEnv } from './hints'
import { promptInstall } from './install'
import { contextStripText, latestMatch } from './labels'
import { useShowsTimes } from '../../profile/useShowsTimes'
import { TAB_OPTIONS } from './modeLabels'
import { ModeBody } from './ModeRanking'
import { sideRecord } from '../../stats'

// Classement screen body (spec §3.1): the « Mixte » | « 2V2 » | « 1V1 » tabs, context strip, one HintCard,
// observation card, ranked list, rookie and inactive sections, empty states and the post-match highlight. Engine data
// arrives through `replay` (Mixte) and `mode` (the 2V2 / 1V1 replay of the selected tab).

export type ClassementViewProps = {
  app: ScreenContext
  replay: ReplayData
  installEnv: InstallEnv
  /** « Proposer un baby » (shared mode); absent → no button. */
  onPropose?: () => void
  /** Mode invité: the « Mode invité · Choisir mon profil » badge; absent → no badge. */
  onChooseProfile?: () => void
  /** Selected tab (remembered on the phone); « Mixte » when absent. */
  tab?: RankingTab
  onTabChange?: (tab: RankingTab) => void
  /** Ranking of the selected 2V2 / 1V1 tab; null (or absent) on « Mixte ». */
  mode?: ModeReplay | null
}

const INSTALL_TITLE = "Installe BabyFlair sur l'écran d'accueil"
const INSTALL_BODY_IOS =
  "Dans Safari : Partager, puis « Sur l'écran d'accueil ». " +
  "L'app s'ouvre en plein écran, même hors ligne, et tes données restent."
const INSTALL_BODY_CHROMIUM = "Ouvre l'app en plein écran, même sans réseau."
const OBSERVATION_TEXT = 'Tout le monde est encore en observation : 10 matchs chacun pour entrer au classement.'
const MIN_PLAYERS_FOR_MATCH = 2

type Dispatch = (action: Action) => void
/** Player ids, plus the duo ids of the two teams of a 2v2 (duo ids contain a '+', so they never collide). */
type Highlight = ReadonlySet<string>

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function ClassementTabs({ tab, onChange }: { tab: RankingTab; onChange: ((tab: RankingTab) => void) | undefined }) {
  if (onChange === undefined) return null
  return (
    <div className="content classement-tabs">
      <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={onChange} aria-label="Classement" />
    </div>
  )
}

/** What the strip and the Blancs / Noirs line count: every match, or the selected format's. */
type Scope = { matches: Match[]; rankedCount: number }

function scopeOf(app: ScreenContext, replay: ReplayData, mode: ModeReplay | null): Scope {
  if (mode === null) return { matches: app.store.matches, rankedCount: replay.ranking.ranked.length }
  return { matches: mode.matches, rankedCount: mode.ranking.ranked.length }
}

// ---------------------------------------------------------------------------
// Context strip
// ---------------------------------------------------------------------------

function ContextStrip({ scope, now }: { scope: Scope; now: Date }) {
  const withTime = useShowsTimes()
  const { matches } = scope
  const latest = latestMatch(matches)
  if (latest === undefined) return null
  const sides = sideRecord(matches)
  return (
    <>
      <a className="ctx-strip" href={hrefOf({ name: 'historique' })}>
        {contextStripText(matches.length, scope.rankedCount, latest.playedAt, now, withTime)}
      </a>
      <p className="side-line">
        <span className="side-line__white">Blancs {sides.blancs} V</span> · <span className="side-line__black">Noirs {sides.noirs} V</span>
      </p>
    </>
  )
}

/** Under the context strip, discreet: a visitor is one tap away from « Qui es-tu ? ». */
function VisitorBadge({ onChooseProfile }: { onChooseProfile: (() => void) | undefined }) {
  if (onChooseProfile === undefined) return null
  return (
    <div className="content visitor-badge-row">
      <button type="button" className="visitor-badge" onClick={onChooseProfile}>
        {PROFILE_COPY.visitorBadge}
      </button>
    </div>
  )
}

/** « Proposer un baby » (also with 0 matches): confirms the notification, or shows the open call if there is one. */
function ProposeButton({ onPropose }: { onPropose: () => void }) {
  return (
    <button type="button" className="call-propose__link" onClick={onPropose}>
      🔔 {CALL_COPY.propose}
    </button>
  )
}

// No player yet: nobody to call.
function proposeAction(onPropose: (() => void) | undefined, playerCount: number): (() => void) | undefined {
  if (playerCount === 0) return undefined
  return onPropose
}

/** Under the context strip, one discreet centred link: « 🔔 Proposer un baby » (the stats live in the Stats tab). */
function ClassementLinks({ onPropose, playerCount }: { onPropose: (() => void) | undefined; playerCount: number }) {
  const propose = proposeAction(onPropose, playerCount)
  if (propose === undefined) return null
  return (
    <div className="content call-propose">
      <ProposeButton onPropose={propose} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hint card (one at a time; decision in hints.ts)
// ---------------------------------------------------------------------------

function dismissInstall(dispatch: Dispatch): void {
  dispatch({ type: 'setSetting', patch: { installHintDismissedAt: new Date().toISOString() } })
}

function dismissNotifications(dispatch: Dispatch): void {
  dispatch({ type: 'setSetting', patch: { notifHintDismissedAt: new Date().toISOString() } })
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
      title={PUSH_COPY.hintTitle}
      body={PUSH_COPY.hintBody}
      primary={{ label: PUSH_COPY.enable, onClick: () => navigate({ name: 'reglages' }) }}
      onDismiss={() => dismissNotifications(dispatch)}
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

type BodyProps = { app: ScreenContext; replay: ReplayData; mode: ModeReplay | null; highlight: Highlight }

function Body({ app, replay, mode, highlight }: BodyProps) {
  const { players, matches } = app.store
  if (players.length === 0) return <NoPlayersYet />
  if (mode !== null) return <ModeBody mode={mode} now={replay.now} highlight={highlight} />
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

// The navigation payload is [...teamA, ...teamB] (src/screens/Match.tsx): in a 2v2, the two duos of the match.
function highlightOf(ids: PlayerId[]): Highlight {
  if (ids.length !== 4) return new Set(ids)
  const duos = [teamDuoId(ids.slice(0, 2)), teamDuoId(ids.slice(2))].filter((id): id is string => id !== null)
  return new Set([...ids, ...duos])
}

function hrefOfEntity(id: string): string {
  if (id.includes('+')) return hrefOf({ name: 'duo', id })
  return hrefOf({ name: 'joueur', id })
}

// Rows render as <a href="#/joueurs/:id"> (or #/duo/:id in 2V2); the first match in DOM order is the highest-ranked
// highlighted row.
function scrollToFirstHighlighted(root: HTMLElement | null, highlight: Highlight): void {
  if (root === null) return
  const hrefs = new Set([...highlight].map(hrefOfEntity))
  const rows = Array.from(root.querySelectorAll<HTMLAnchorElement>('a.row'))
  const first = rows.find((row) => hrefs.has(row.getAttribute('href') ?? ''))
  if (first === undefined || typeof first.scrollIntoView !== 'function') return
  first.scrollIntoView({ block: 'nearest' })
}

/** Reads the navigation payload once on mount: those rows get `.row--flash` and the first one is scrolled to. */
function useHighlight(nav: ScreenContext['nav'], rootRef: RefObject<HTMLDivElement | null>): Highlight {
  const [highlight] = useState<Highlight>(() => highlightOf(nav.get().highlightIds ?? []))
  useEffect(() => {
    const payload = nav.take()
    // Only highlightIds is ours; rankBefore belongs to the Match result view and goes back untouched.
    if (payload.rankBefore !== undefined) nav.set({ rankBefore: payload.rankBefore })
    if (highlight.size === 0) return
    scrollToFirstHighlighted(rootRef.current, highlight)
  }, [nav, rootRef, highlight])
  return highlight
}

/** No player yet: no tabs (and no ranking to switch to). */
function tabsChange(app: ScreenContext, onTabChange: ((tab: RankingTab) => void) | undefined) {
  if (app.store.players.length === 0) return undefined
  return onTabChange
}

export function ClassementView(props: ClassementViewProps) {
  const { app, replay, installEnv, onPropose, onChooseProfile, tab = 'mixte', onTabChange, mode = null } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const highlight = useHighlight(app.nav, rootRef)
  const hint = pickHint(installEnv, app.store.settings, replay.now)
  const scope = scopeOf(app, replay, mode)
  return (
    <div ref={rootRef} className="lists-screen classement">
      <ClassementTabs tab={tab} onChange={tabsChange(app, onTabChange)} />
      <ContextStrip scope={scope} now={replay.now} />
      <VisitorBadge onChooseProfile={onChooseProfile} />
      <ClassementLinks onPropose={onPropose} playerCount={app.store.players.length} />
      <HintSlot hint={hint} dispatch={app.dispatch} />
      <Body app={app} replay={replay} mode={mode} highlight={highlight} />
    </div>
  )
}
