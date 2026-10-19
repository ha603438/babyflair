import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { duoBetRecord } from '../../betStats'
import { HistoryRow } from '../../components/rows'
import { SectionHeader } from '../../components/SectionHeader'
import { canonicalDuoId, membersByName } from '../../duo'
import type { DuoId, DuoMembers } from '../../duo'
import {
  duoBeteNoire,
  duoFannyComeback,
  duoMatches,
  duoSide,
  duoStreak,
  duoVictimePreferee,
  formationRecord,
} from '../../duoStats'
import type { DuoRivalry } from '../../duoStats'
import { fmtInt, plural } from '../../format'
import { expandDuoResult, MODE_RANKED_AFTER } from '../../rating/modes'
import type { ModeReplay } from '../../rating/modes'
import { hrefOf, navigate } from '../../router'
import type { Match, MatchId, PlayerId, PlayerStats } from '../../types'
import type { ReplayData } from './context'
import { heroCaption, recentMatchIds, recordText, streakText, winRateText } from './labels'
import { BetsCard, SparklineCard, Tile, Trend } from './profileParts'

// Duo page (`#/duo/<idA>+<idB>`, 2V2 ranking): the player page for a pair of teammates. Hero (duo rating, rank or
// progress, 7-day trend, each name linking to its player), sparkline, stat tiles, the two formations, fanny et
// comebacks, « 🎯 Annonces » (made together, in duo points), the rival duos and the last matches together. No rename,
// no delete, no partner card. Unknown or never-played duo → the same redirect as an unknown player.

export type DuoViewProps = {
  replay: ReplayData
  /** The 2V2 ranking (src/rating/modes.ts). */
  duos: ModeReplay
  /** Route id: the two player ids joined with '+', in any order. */
  id: string
}

type Duo = { id: DuoId; members: DuoMembers; stats: PlayerStats; matches: Match[] }
type DuoProps = { duo: Duo; replay: ReplayData; duos: ModeReplay }

const NOT_ENOUGH_TEXT = 'Pas encore assez de matchs contre le même duo'

function resolveDuo(id: string, duos: ModeReplay): Duo | null {
  const canonical = canonicalDuoId(id)
  if (canonical === null) return null
  const members = duos.duos.get(canonical)
  const stats = duos.result.byPlayer.get(canonical)
  if (members === undefined || stats === undefined) return null
  return { id: canonical, members, stats, matches: duoMatches(canonical, duos.matches) }
}

function nameOf(replay: ReplayData, id: PlayerId): string {
  return replay.players.get(id)?.name ?? '?'
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function NameLink({ id, replay }: { id: PlayerId; replay: ReplayData }) {
  return <a href={hrefOf({ name: 'joueur', id })}>{nameOf(replay, id)}</a>
}

function Names({ members, replay }: { members: DuoMembers; replay: ReplayData }) {
  const [first, second] = membersByName(members, replay.players)
  return (
    <p className="hero-names">
      <NameLink id={first} replay={replay} />
      {' & '}
      <NameLink id={second} replay={replay} />
    </p>
  )
}

function Hero({ duo, replay, duos }: DuoProps) {
  return (
    <section className="card card-pad hero">
      <div className="hero-main">
        <div className="hero-rating t-display">{fmtInt(duo.stats.rating)}</div>
        <p className="hero-caption">{heroCaption(duo.stats, duos.ranking, replay.now, MODE_RANKED_AFTER)}</p>
        <Names members={duo.members} replay={replay} />
      </div>
      <div className="hero-side">
        <Trend stats={duo.stats} now={replay.now} />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Stats, formations, fanny et comebacks
// ---------------------------------------------------------------------------

function Streak({ duo, matches }: { duo: Duo; matches: Map<MatchId, Match> }) {
  const text = streakText(duoStreak(duo.id, duo.stats.history, matches))
  if (text === null) return null
  return <p className="streak">{text}</p>
}

function StatsCard({ duo, replay }: Omit<DuoProps, 'duos'>) {
  const { stats } = duo
  return (
    <section className="card card-pad">
      <div className="tiles">
        <Tile label="Matchs" value={fmtInt(stats.played)} />
        <Tile label="Victoires" value={fmtInt(stats.wins)} />
        <Tile label="Défaites" value={fmtInt(stats.losses)} />
        <Tile label="Victoires" value={winRateText(stats)} />
      </div>
      <Streak duo={duo} matches={replay.matches} />
    </section>
  )
}

/** The two formations, « Arnault arrière · Edgar avant » then the reverse (first name alphabetically first). */
function PositionsCard({ duo, replay }: Omit<DuoProps, 'duos'>) {
  const [first, second] = membersByName(duo.members, replay.players)
  const label = (arriere: PlayerId, avant: PlayerId): string =>
    `${nameOf(replay, arriere)} arrière · ${nameOf(replay, avant)} avant`
  return (
    <section className="card card-pad">
      <div className="tiles tiles--2">
        <Tile label={label(first, second)} value={recordText(formationRecord(first, second, duo.matches))} />
        <Tile label={label(second, first)} value={recordText(formationRecord(second, first, duo.matches))} />
      </div>
    </section>
  )
}

function FannyComebackCard({ duo }: { duo: Duo }) {
  const record = duoFannyComeback(duo.id, duo.matches)
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

// ---------------------------------------------------------------------------
// Rivalries: « Bête noire » and « Victime préférée », each a link to the other duo's page
// ---------------------------------------------------------------------------

type RivalryRowProps = { label: string; rivalry: DuoRivalry | null; text: (rivalry: DuoRivalry) => string }

function RivalryRow({ label, rivalry, text }: RivalryRowProps) {
  if (rivalry === null) {
    return (
      <div className="rivalry">
        <p className="partner-label">{label}</p>
        <p className="partner-value">{NOT_ENOUGH_TEXT}</p>
      </div>
    )
  }
  return (
    <a className="rivalry partner--link" href={hrefOf({ name: 'duo', id: rivalry.duoId })}>
      <p className="partner-label">{label}</p>
      <p className="partner-value">{text(rivalry)}</p>
    </a>
  )
}

function RivalriesCard({ duo, duos }: Omit<DuoProps, 'replay'>) {
  const duoName = (id: DuoId): string => duos.entities.get(id)?.name ?? '?'
  const beteNoire = duoBeteNoire(duo.id, duo.matches, duoName)
  const victime = duoVictimePreferee(duo.id, duo.matches, duoName)
  if (beteNoire === null && victime === null) return null
  return (
    <section className="card card-pad rivalries">
      <RivalryRow
        label="Bête noire"
        rivalry={beteNoire}
        text={(r) => `${duoName(r.duoId)} · ${plural(r.losses, 'défaite')} en ${plural(r.matches, 'match')}`}
      />
      <RivalryRow
        label="Victime préférée"
        rivalry={victime}
        text={(r) => `${duoName(r.duoId)} · ${plural(r.wins, 'victoire')} en ${plural(r.matches, 'match')}`}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Derniers matchs: the duo's names take the accent (CSS on the wrapper), each name shows its duo's delta
// ---------------------------------------------------------------------------

function sideClass(id: DuoId, match: Match): string {
  const side = duoSide(id, match)
  if (side === 'A') return 'duo-hr duo-hr--a'
  if (side === 'B') return 'duo-hr duo-hr--b'
  return 'duo-hr'
}

function historyRow(matchId: MatchId, { duo, replay, duos }: DuoProps): ReactNode {
  const match = replay.matches.get(matchId)
  if (match === undefined) return null
  return (
    <div key={matchId} className={sideClass(duo.id, match)}>
      <HistoryRow
        match={match}
        result={expandDuoResult(duos.result.byMatch.get(matchId), match)}
        players={replay.players}
        href={hrefOf({ name: 'match-detail', id: matchId })}
      />
    </div>
  )
}

function RecentMatches(props: DuoProps) {
  return (
    <section className="recent">
      <SectionHeader title="Derniers matchs" />
      <div className="rows">{recentMatchIds(props.duo.stats).map((matchId) => historyRow(matchId, props))}</div>
      <a className="lists-link" href={hrefOf({ name: 'historique' })}>
        Voir tout l'historique
      </a>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function DuoPage(props: DuoProps) {
  const { duo, replay } = props
  return (
    <div className="lists-screen duo">
      <div className="content stack-16 lists-block">
        <Hero {...props} />
        <SparklineCard stats={duo.stats} />
        <StatsCard duo={duo} replay={replay} />
        <PositionsCard duo={duo} replay={replay} />
        <FannyComebackCard duo={duo} />
        <BetsCard record={duoBetRecord(duo.id, props.duos.result, replay.matches)} subject="duo" />
        <RivalriesCard duo={duo} duos={props.duos} />
      </div>
      <RecentMatches {...props} />
    </div>
  )
}

export function DuoView({ replay, duos, id }: DuoViewProps) {
  const duo = resolveDuo(id, duos)
  const found = duo !== null

  useEffect(() => {
    if (found) return
    navigate({ name: 'joueurs' })
  }, [found])

  if (duo === null) return null
  return <DuoPage duo={duo} replay={replay} duos={duos} />
}
