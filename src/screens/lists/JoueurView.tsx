import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '../../components/Badge'
import { Button, IconButton } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Delta } from '../../components/Delta'
import { InlinePlayerForm } from '../../components/InlinePlayerForm'
import type { PlayerFormValue } from '../../components/InlinePlayerForm'
import { Pencil } from '../../components/icons'
import { SectionHeader } from '../../components/SectionHeader'
import { Sparkline } from '../../components/Sparkline'
import { HistoryRow } from '../../components/rows'
import type { Guard } from '../../profile/useWriteGuard'
import { fmtInt, fmtPercent } from '../../format'
import { back, hrefOf, navigate } from '../../router'
import { playerHasMatches } from '../../store'
import { bestAlly, currentStreak, favouritePartner, nemesis, positionRecord, sevenDayDelta } from '../../stats'
import type { Rivalry } from '../../stats'
import type { Match, MatchId, Player, PlayerId, PlayerStats } from '../../types'
import type { ReplayData, ScreenContext } from './context'
import {
  hasTwoVsTwo,
  heroCaption,
  partnerText,
  recentMatchIds,
  sparklineCaption,
  sparklinePoints,
  streakText,
  winRateText,
} from './labels'

// Joueur screen body (spec §3.7): hero card (with the « Renommer » pencil and the inline rename form), sparkline,
// stat tiles, favourite partner, last matches and the danger zone. Unknown id → redirect to the list.

/** `guard`: renaming and deleting are writes, refused to a visitor (src/profile/useWriteGuard.ts). */
export type JoueurViewProps = { app: ScreenContext; replay: ReplayData; id: PlayerId; guard: Guard }

const NO_MATCH_TEXT = "Aucun match pour l'instant."
const CANNOT_DELETE_TEXT =
  'Ce joueur a des matchs enregistrés et ne peut pas être supprimé. ' +
  'Sans match pendant 30 jours, il passe en Inactifs.'
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

function Trend({ stats, now }: { stats: PlayerStats; now: Date }) {
  const trend = sevenDayDelta(stats, now)
  if (trend === null) return null
  return <Delta value={trend} size={13} suffix="sur 7 j" />
}

function GuestBadge({ player }: { player: Player }) {
  if (!player.isGuest) return null
  return (
    <div className="hero-badges">
      <Badge kind="guest" />
    </div>
  )
}

type HeroProps = { player: Player; stats: PlayerStats; replay: ReplayData; onEdit: () => void }

function Hero({ player, stats, replay, onEdit }: HeroProps) {
  return (
    <section className="card card-pad hero">
      <div className="hero-main">
        <div className="hero-rating t-display">{fmtInt(stats.rating)}</div>
        <p className="hero-caption">{heroCaption(stats, replay.ranking, replay.now)}</p>
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

function SparklineCard({ stats }: { stats: PlayerStats }) {
  const points = sparklinePoints(stats)
  return (
    <section className="card card-pad">
      <Sparkline points={points} />
      <p className="spark-caption">{sparklineCaption(points)}</p>
    </section>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value t-num">{value}</span>
    </div>
  )
}

function Streak({ stats, matches }: { stats: PlayerStats; matches: Map<MatchId, Match> }) {
  const text = streakText(currentStreak(stats, matches))
  if (text === null) return null
  return <p className="streak">{text}</p>
}

function StatsCard({ stats, matches }: { stats: PlayerStats; matches: Map<MatchId, Match> }) {
  return (
    <section className="card card-pad">
      <div className="tiles">
        <Tile label="Matchs" value={fmtInt(stats.played)} />
        <Tile label="Victoires" value={fmtInt(stats.wins)} />
        <Tile label="Défaites" value={fmtInt(stats.losses)} />
        <Tile label="Victoires" value={winRateText(stats)} />
      </div>
      <Streak stats={stats} matches={matches} />
    </section>
  )
}

function recordText(record: { wins: number; losses: number }): string {
  return `${record.wins} V · ${record.losses} D`
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
        text={(r) => `${nameOf(players, r.playerId)} · ${r.losses} défaites en ${r.matches} matchs face à ce joueur`}
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
  return (
    <a className="card card-pad partner partner--link" href={hrefOf({ name: 'joueur', id: partner.partnerId })}>
      {body}
    </a>
  )
}

type DetailsProps = { player: Player; stats: PlayerStats; replay: ReplayData; matches: Match[] }

function Details({ player, stats, replay, matches }: DetailsProps) {
  if (stats.played === 0) return <p className="lists-empty">{NO_MATCH_TEXT}</p>
  return (
    <>
      <SparklineCard stats={stats} />
      <StatsCard stats={stats} matches={replay.matches} />
      <PositionsCard playerId={player.id} matches={matches} />
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
      result={replay.result.byMatch.get(matchId)}
      players={replay.players}
      href={hrefOf({ name: 'match-detail', id: matchId })}
      emphasisId={playerId}
    />
  )
}

function RecentMatches({ player, stats, replay }: { player: Player; stats: PlayerStats; replay: ReplayData }) {
  if (stats.played === 0) return null
  return (
    <section className="recent">
      <SectionHeader title="Derniers matchs" />
      <div className="rows">{recentMatchIds(stats).map((matchId) => historyRow(matchId, player.id, replay))}</div>
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

type PageProps = { app: ScreenContext; replay: ReplayData; player: Player; onLeave: () => void; guard: Guard }

function PlayerPage({ app, replay, player, onLeave, guard }: PageProps) {
  const { store, dispatch, toast } = app
  const stats = replay.result.byPlayer.get(player.id) ?? emptyStats(player.id)
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
        <Details player={player} stats={stats} replay={replay} matches={store.matches} />
      </div>
      <RecentMatches player={player} stats={stats} replay={replay} />
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
  return <PlayerPage key={player.id} app={app} replay={replay} player={player} onLeave={markLeaving} guard={guard} />
}
