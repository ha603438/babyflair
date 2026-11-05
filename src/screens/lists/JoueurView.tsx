import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '../../components/Badge'
import { Button, IconButton } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { InlinePlayerForm } from '../../components/InlinePlayerForm'
import type { PlayerFormValue } from '../../components/InlinePlayerForm'
import { Pencil } from '../../components/icons'
import { SectionHeader } from '../../components/SectionHeader'
import { playerBetRecord } from '../../betStats'
import { playerDayRecap } from '../../playerDay'
import { HistoryRow } from '../../components/rows'
import { duoId } from '../../duo'
import type { Guard } from '../../profile/useWriteGuard'
import { fmtInt, fmtPercent } from '../../format'
import type { ModeReplay } from '../../rating/modes'
import { careerOf, matchResult } from '../../rating/rankings'
import type { Career } from '../../rating/rankings'
import { back, hrefOf, navigate } from '../../router'
import { playerHasMatches } from '../../store'
import { bestAlly, currentStreak, fannyComebackRecord, favouritePartner, nemesis, positionRecord } from '../../stats'
import type { Rivalry } from '../../stats'
import type { Match, MatchId, Player, PlayerId, PlayerStats } from '../../types'
import type { ReplayData, ScreenContext } from './context'
import {
  hasTwoVsTwo,
  heroCaption,
  modeLineText,
  partnerText,
  recentMatchIds,
  recordText,
  streakText,
  winRateText,
} from './labels'
import { MAIN_LABEL } from './modeLabels'
import { playerDayView } from './playerDayLines'
import type { DayTile } from './playerDayLines'
import { BetsCard, SparklineCard, Tile, Trend } from './profileParts'
import { RecapLines } from './RecapView'

// Joueur screen body (spec §3.7): hero card (the 2V2 mixte rating, labelled as such, with the « Renommer » pencil and
// the inline rename form, and the 1V1 rating line when the player has 1v1 matches), « Récap du jour » (his latest day
// with a match), the 2V2 mixte sparkline, stat
// tiles over every match (1v1 and 2v2), « 🎯 Annonces » (once the player announced), favourite partner (a link to the
// duo page), last matches (each with its deltas in its own ranking) and the danger zone. Unknown id → redirect to the
// list.

/** `guard`: renaming and deleting are writes, refused to a visitor (src/profile/useWriteGuard.ts). */
export type JoueurViewProps = {
  app: ScreenContext
  replay: ReplayData
  id: PlayerId
  guard: Guard
}

const NO_MATCH_TEXT = "Aucun match pour l'instant."
const CANNOT_DELETE_TEXT =
  'Ce joueur a des matchs enregistrés et ne peut pas être supprimé. ' +
  'Sans match pendant 30 jours, il part prendre l’flair (inactifs).'
const DELETE_BODY = "Ce joueur n'a aucun match, rien ne sera recalculé."
/** Starting rating, only used as a fallback when the engine has no entry for a player (contract says it always has). */
const START_RATING = 1000

function emptyStats(playerId: PlayerId): PlayerStats {
  return { playerId, rating: START_RATING, played: 0, wins: 0, losses: 0, status: 'rookie', rookieProgress: 0, history: [] }
}

// After a delete the page returns to the list (spec §3.7); a deep link with nothing to go back to navigates instead.
function leaveToList(): void {
  if (window.history.length > 1) {
    back()
    return
  }
  navigate({ name: 'joueurs' })
}

// ---------------------------------------------------------------------------
// Hero card / rename form
// ---------------------------------------------------------------------------

function GuestBadge({ player }: { player: Player }) {
  if (!player.isGuest) return null
  return (
    <div className="hero-badges">
      <Badge kind="guest" />
    </div>
  )
}

/** « 1V1 : 1 032 · 2e », discreet, under the caption; nothing without a 1v1 match. */
function OneVsOneLine({ playerId, oneVsOne }: { playerId: PlayerId; oneVsOne: ModeReplay }) {
  const stats = oneVsOne.result.byPlayer.get(playerId)
  if (stats === undefined || stats.played === 0) return null
  return <p className="hero-mode">{modeLineText('1V1', stats, oneVsOne.ranking)}</p>
}

type HeroProps = {
  player: Player
  stats: PlayerStats
  replay: ReplayData
  onEdit: () => void
}

/** The big number is the main ranking's: « 2V2 mixte » above it, so it is not taken for the 1V1 rating. */
function Hero({ player, stats, replay, onEdit }: HeroProps) {
  return (
    <section className="card card-pad hero">
      <div className="hero-main">
        <p className="hero-kicker">{MAIN_LABEL}</p>
        <div className="hero-rating t-display">{fmtInt(stats.rating)}</div>
        <p className="hero-caption">{heroCaption(stats, replay.ranking, replay.now)}</p>
        <OneVsOneLine playerId={player.id} oneVsOne={replay.rankings.oneVsOne} />
        <GuestBadge player={player} />
      </div>
      <div className="hero-side">
        <IconButton label="Renommer" onClick={onEdit}>
          <Pencil />
        </IconButton>
        <Trend stats={stats} now={replay.now} />
      </div>
    </section>
  )
}

type RenameProps = {
  player: Player
  players: Player[]
  onSubmit: (value: PlayerFormValue) => void
  onCancel: () => void
}

function RenameForm({ player, players, onSubmit, onCancel }: RenameProps) {
  const others = players.filter((other) => other.id !== player.id).map((other) => other.name)
  return (
    <section className="card card-pad">
      <InlinePlayerForm
        mode="edit"
        initial={{ name: player.name, isGuest: player.isGuest }}
        existingNames={others}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Sparkline, stats, partner
// ---------------------------------------------------------------------------

function Streak({ career, matches }: { career: Career; matches: Map<MatchId, Match> }) {
  const text = streakText(currentStreak(career, matches))
  if (text === null) return null
  return <p className="streak">{text}</p>
}

/** Every match the player played, 1v1 and 2v2 (whatever ranking rated it). */
function StatsCard({ career, matches }: { career: Career; matches: Map<MatchId, Match> }) {
  return (
    <section className="card card-pad">
      <div className="tiles">
        <Tile label="Matchs" value={fmtInt(career.played)} />
        <Tile label="Victoires" value={fmtInt(career.wins)} />
        <Tile label="Défaites" value={fmtInt(career.losses)} />
        <Tile label="Victoires" value={winRateText(career)} />
      </div>
      <Streak career={career} matches={matches} />
    </section>
  )
}

function PositionsCard({ playerId, matches }: { playerId: PlayerId; matches: Match[] }) {
  if (!hasTwoVsTwo(playerId, matches)) return null
  const record = positionRecord(playerId, matches)
  return (
    <section className="card card-pad">
      <div className="tiles tiles--2">
        <Tile label="Arrière" value={recordText(record.arriere)} />
        <Tile label="Avant" value={recordText(record.avant)} />
      </div>
    </section>
  )
}

/** Shutouts and comebacks, as winner and as loser (2 × 2 tiles); hidden until the player has a match. */
function FannyComebackCard({ playerId, matches }: { playerId: PlayerId; matches: Match[] }) {
  if (!playerHasMatches(matches, playerId)) return null
  const record = fannyComebackRecord(playerId, matches)
  return (
    <section className="card card-pad">
      <h2 className="tiles-title">Fanny et comebacks</h2>
      <div className="tiles tiles--2">
        <Tile label="Fanny mis" value={fmtInt(record.fannyGiven)} />
        <Tile label="Fanny encaissés" value={fmtInt(record.fannyTaken)} />
        <Tile label="Comebacks réussis" value={fmtInt(record.comebackDone)} />
        <Tile label="Comebacks subis" value={fmtInt(record.comebackSuffered)} />
      </div>
    </section>
  )
}

type PartnerProps = { playerId: PlayerId; matches: Match[]; players: Map<PlayerId, Player> }

type RivalryRowProps = { label: string; rivalry: Rivalry | null; text: (r: Rivalry) => string }

function RivalryRow({ label, rivalry, text }: RivalryRowProps) {
  const body = (
    <>
      <p className="partner-label">{label}</p>
      <p className="partner-value">{rivalry === null ? 'Pas encore assez de matchs ensemble' : text(rivalry)}</p>
    </>
  )
  if (rivalry === null) return <div className="rivalry">{body}</div>
  return (
    <a className="rivalry partner--link" href={hrefOf({ name: 'joueur', id: rivalry.playerId })}>
      {body}
    </a>
  )
}

function nameOf(players: Map<PlayerId, Player>, id: PlayerId): string {
  return players.get(id)?.name ?? '?'
}

function RivalriesCard({ playerId, matches, players }: PartnerProps) {
  const ally = bestAlly(playerId, matches, players)
  const enemy = nemesis(playerId, matches, players)
  if (ally === null && enemy === null) return null
  return (
    <section className="card card-pad rivalries">
      <RivalryRow
        label="Meilleur allié"
        rivalry={ally}
        text={(r) =>
          `${nameOf(players, r.playerId)} · ${r.wins} V sur ${r.matches} ensemble (${fmtPercent(r.wins / r.matches)})`
        }
      />
      <RivalryRow
        label="Némésis"
        rivalry={enemy}
        text={(r) => `${nameOf(players, r.playerId)} · ${r.losses} défaites en ${r.matches} matchs`}
      />
    </section>
  )
}

function PartnerCard({ playerId, matches, players }: PartnerProps) {
  if (!hasTwoVsTwo(playerId, matches)) return null
  const partner = favouritePartner(playerId, matches, players)
  const body = (
    <>
      <p className="partner-label">Partenaire préféré</p>
      <p className="partner-value">{partnerText(partner, players)}</p>
    </>
  )
  if (partner === null) return <section className="card card-pad partner">{body}</section>
  // The pair's own page (2V2 ranking) rather than the partner's.
  const href = hrefOf({ name: 'duo', id: duoId(playerId, partner.partnerId) })
  return (
    <a className="card card-pad partner partner--link" href={href}>
      {body}
    </a>
  )
}

function DayTileView({ tile }: { tile: DayTile }) {
  const valueClass = tile.tone === null ? 'tile-value t-num' : `tile-value t-num ${tile.tone}`
  return (
    <div className="tile">
      <span className="tile-label">{tile.label}</span>
      <span className={valueClass}>{tile.value}</span>
    </div>
  )
}

/** « Récap du jour »: the player's latest day with a match (today when he played today), tiles then highlight lines. */
function DayRecapCard({ player, replay, matches }: { player: Player; replay: ReplayData; matches: Match[] }) {
  const day = playerDayRecap(player.id, [...replay.players.values()], matches, replay.rankings)
  if (day === null) return null
  const view = playerDayView(player.id, day, replay.players, replay.now)
  return (
    <section className="card card-pad day-recap">
      <h2 className="tiles-title">{view.title}</h2>
      <div className="tiles tiles--2">
        {view.tiles.map((tile) => (
          <DayTileView key={tile.label} tile={tile} />
        ))}
      </div>
      <RecapLines lines={view.lines} />
    </section>
  )
}

type DetailsProps = { player: Player; stats: PlayerStats; career: Career; replay: ReplayData; matches: Match[] }

function Details({ player, stats, career, replay, matches }: DetailsProps) {
  if (career.played === 0) return <p className="lists-empty">{NO_MATCH_TEXT}</p>
  return (
    <>
      <DayRecapCard player={player} replay={replay} matches={matches} />
      <SparklineCard stats={stats} />
      <StatsCard career={career} matches={replay.matches} />
      <PositionsCard playerId={player.id} matches={matches} />
      <FannyComebackCard playerId={player.id} matches={matches} />
      <BetsCard record={playerBetRecord(player.id, replay.rankings, replay.matches)} subject="player" />
      <PartnerCard playerId={player.id} matches={matches} players={replay.players} />
      <RivalriesCard playerId={player.id} matches={matches} players={replay.players} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Derniers matchs, danger zone
// ---------------------------------------------------------------------------

function historyRow(matchId: MatchId, playerId: PlayerId, replay: ReplayData): ReactNode {
  const match = replay.matches.get(matchId)
  if (match === undefined) return null
  return (
    <HistoryRow
      key={matchId}
      match={match}
      result={matchResult(replay.rankings, matchId)}
      players={replay.players}
      href={hrefOf({ name: 'match-detail', id: matchId })}
      emphasisId={playerId}
    />
  )
}

function RecentMatches({ player, career, replay }: { player: Player; career: Career; replay: ReplayData }) {
  if (career.played === 0) return null
  return (
    <section className="recent">
      <SectionHeader title="Derniers matchs" />
      <div className="rows">{recentMatchIds(career).map((matchId) => historyRow(matchId, player.id, replay))}</div>
      <a className="lists-link" href={hrefOf({ name: 'historique' })}>
        Voir tout l'historique
      </a>
    </section>
  )
}

function DangerZone({ canDelete, onAsk }: { canDelete: boolean; onAsk: () => void }) {
  if (!canDelete) return <p className="danger-caption">{CANNOT_DELETE_TEXT}</p>
  return (
    <Button variant="text" danger onClick={onAsk}>
      Supprimer le joueur
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type HeroAreaProps = HeroProps & RenameProps & { editing: boolean }

function HeroArea({ editing, player, players, stats, replay, onEdit, onSubmit, onCancel }: HeroAreaProps) {
  if (editing) return <RenameForm player={player} players={players} onSubmit={onSubmit} onCancel={onCancel} />
  return <Hero player={player} stats={stats} replay={replay} onEdit={onEdit} />
}

type PageProps = {
  app: ScreenContext
  replay: ReplayData
  player: Player
  onLeave: () => void
  guard: Guard
}

function PlayerPage({ app, replay, player, onLeave, guard }: PageProps) {
  const { store, dispatch, toast } = app
  const stats = replay.result.byPlayer.get(player.id) ?? emptyStats(player.id)
  const career = careerOf(replay.rankings, player.id)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const canDelete = !playerHasMatches(store.matches, player.id)

  const rename = (value: PlayerFormValue): void => {
    dispatch({ type: 'renamePlayer', id: player.id, name: value.name, isGuest: value.isGuest })
    setEditing(false)
    toast.show({ text: 'Joueur renommé' })
  }

  const remove = (): void => {
    onLeave()
    setConfirming(false)
    dispatch({ type: 'deletePlayer', id: player.id })
    leaveToList()
    toast.show({ text: 'Joueur supprimé' })
  }

  return (
    <div className="lists-screen joueur">
      <div className="content stack-16 lists-block">
        <HeroArea
          editing={editing}
          player={player}
          players={store.players}
          stats={stats}
          replay={replay}
          onEdit={() => guard('renommer ce joueur', () => setEditing(true))}
          onSubmit={(value) => guard('renommer ce joueur', () => rename(value))}
          onCancel={() => setEditing(false)}
        />
        <Details player={player} stats={stats} career={career} replay={replay} matches={store.matches} />
      </div>
      <RecentMatches player={player} career={career} replay={replay} />
      <div className="content danger-zone">
        <DangerZone canDelete={canDelete} onAsk={() => guard('supprimer ce joueur', () => setConfirming(true))} />
      </div>
      <ConfirmDialog
        open={confirming}
        title={`Supprimer ${player.name} ?`}
        body={DELETE_BODY}
        confirmLabel="Supprimer"
        danger
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}

export function JoueurView({ app, replay, id, guard }: JoueurViewProps) {
  const player = replay.players.get(id)
  // Set right before deletePlayer so the "player vanished" redirect does not fight the history.back().
  const leaving = useRef(false)
  const markLeaving = useCallback(() => {
    leaving.current = true
  }, [])

  useEffect(() => {
    if (player !== undefined) {
      leaving.current = false
      return
    }
    if (leaving.current) return
    navigate({ name: 'joueurs' })
  }, [player])

  if (player === undefined) return null
  // Keyed by player: moving to a partner's page must not carry over the edit / confirm state.
  return (
    <PlayerPage
      key={player.id}
      app={app}
      replay={replay}
      player={player}
      onLeave={markLeaving}
      guard={guard}
    />
  )
}
