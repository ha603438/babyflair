import { useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { Check } from '../components/icons'
import { MatchSummary } from '../components/MatchSummary'
import { useShowsTimes } from '../profile/useShowsTimes'
import { useWriteGuard } from '../profile/useWriteGuard'
import { useReplay } from '../rating/useReplay'
import { navigate } from '../router'
import { useAppState, visibleSlots } from '../store'
import type { Match as MatchRecord, MatchId, Player, PlayerId, Ranking, ReplayResult } from '../types'
import { draftTeams, newMatchFromDraft, rankMapOf, resultDateLine, saveLabel } from './match/draftMatch'
import { MatchPreview } from './match/MatchPreview'
import { PlayersStep } from './match/PlayersStep'
import { computePreview } from './match/preview'
import { ScorePanel } from './match/ScorePanel'

type RankSnapshot = { matchId: MatchId; ranks: Map<PlayerId, number> }

function savedMatchOf(lastSavedMatchId: MatchId | undefined, matches: Map<MatchId, MatchRecord>): MatchRecord | undefined {
  if (lastSavedMatchId === undefined) return undefined
  return matches.get(lastSavedMatchId)
}

/** The captured ranks belong to one match only; a stale snapshot (rematch saved later) must not leak into another. */
function ranksFor(snapshot: RankSnapshot | null, matchId: MatchId): Map<PlayerId, number> | undefined {
  if (snapshot === null || snapshot.matchId !== matchId) return undefined
  return snapshot.ranks
}

function NoPlayers() {
  return (
    <div className="content">
      <EmptyState
        title="Ajoute d'abord des joueurs"
        body="Il en faut au moins 2 pour enregistrer un match."
        action={{ label: 'Ajouter des joueurs', onClick: () => navigate({ name: 'joueurs', add: true }) }}
      />
    </div>
  )
}

type ResultViewProps = {
  match: MatchRecord
  result: ReplayResult
  ranking: Ranking
  playersById: Map<PlayerId, Player>
  now: Date
  rankBefore: Map<PlayerId, number> | undefined
  onRematch: () => void
  onKeepWinners: () => void
  onNewMatch: () => void
  onShowRanking: () => void
  onCancelMatch: () => void
}

/** Step C (spec §4): check + « Match enregistré », the MatchSummary from the fresh replay, the three actions and the undo. */
function ResultView(props: ResultViewProps) {
  const { match, result, ranking, playersById, now, rankBefore } = props
  const matchResult = result.byMatch.get(match.id)
  const rankAfter = rankMapOf(ranking, [...match.teamA, ...match.teamB])
  const dateLine = resultDateLine(match.playedAt, match.target, now, useShowsTimes())
  return (
    <div className="match-screen match-screen--done">
      <div className="content match-result">
        <div className="match-result__title">
          <Check size={28} className="match-result__check" />
          <h1 className="match-result__heading">Match enregistré</h1>
        </div>
        {matchResult === undefined && <p className="match-result__caption">{dateLine}</p>}
        {matchResult !== undefined && (
          <MatchSummary
            match={match}
            result={matchResult}
            players={playersById}
            byPlayer={result.byPlayer}
            rankBefore={rankBefore}
            rankAfter={rankAfter}
            dateLine={dateLine}
          />
        )}
        <div className="match-result__actions">
          <Button variant="primary" size="lg" onClick={props.onKeepWinners}>
            Match suivant : les gagnants restent
          </Button>
          <Button variant="secondary" size="md" onClick={props.onRematch}>
            Revanche
          </Button>
          <Button variant="text" onClick={props.onNewMatch}>
            Nouveau match
          </Button>
          <Button variant="text" onClick={props.onShowRanking}>
            Voir le classement
          </Button>
        </div>
        <div className="match-result__cancel">
          <Button variant="text" danger onClick={props.onCancelMatch}>
            Annuler ce match
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Nouveau match (spec §3.2, §4): steps A players → B score → C done, all on #/match, driven by the shared draft. */
export function Match() {
  const { store, dispatch, draft, draftDispatch, toast, nav } = useAppState()
  const { result, ranking, players: playersById, matches: matchesById, now } = useReplay()
  // Ranks captured right before addMatch; the result view needs them next to the fresh ranking (spec §4 step C).
  const [rankBefore, setRankBefore] = useState<RankSnapshot | null>(null)
  const teams = draftTeams(draft)
  const savedMatch = savedMatchOf(draft.lastSavedMatchId, matchesById)
  const showToast = toast.show
  const guard = useWriteGuard()

  // A slot may still hold a player deleted from the Joueurs screen while the draft lived in memory: free it.
  useEffect(() => {
    for (const index of visibleSlots(draft.format)) {
      const id = draft.slots[index]
      if (id !== null && !playersById.has(id)) draftDispatch({ type: 'clearSlot', index })
    }
  }, [draft, playersById, draftDispatch])

  // The result view of a match deleted elsewhere falls back to step A.
  useEffect(() => {
    if (draft.step !== 'done' || savedMatch !== undefined) return
    draftDispatch({ type: 'reset' })
  }, [draft.step, savedMatch, draftDispatch])

  function save() {
    if (draft.score === null || teams === null) return
    const created = newMatchFromDraft(draft, crypto.randomUUID(), new Date().toISOString())
    setRankBefore({ matchId: created.id, ranks: rankMapOf(ranking, [...created.teamA, ...created.teamB]) })
    dispatch({ type: 'addMatch', match: created })
    dispatch({ type: 'setSetting', patch: { lastFormat: draft.format, lastTarget: draft.target } })
    navigator.vibrate?.(10)
    draftDispatch({ type: 'saved', matchId: created.id })
  }

  function onKeepWinners(match: MatchRecord) {
    const winner = match.scoreA === match.target ? 'A' : 'B'
    draftDispatch({ type: 'keepWinners', winner, teamA: match.teamA, teamB: match.teamB, target: match.target })
  }

  function onRematch(match: MatchRecord) {
    draftDispatch({ type: 'prefill', teamA: match.teamA, teamB: match.teamB, target: match.target })
  }

  function onShowRanking(match: MatchRecord, ranks: Map<PlayerId, number> | undefined) {
    nav.set({ highlightIds: [...match.teamA, ...match.teamB], rankBefore: ranks })
    navigate({ name: 'classement' })
  }

  function cancelMatch(match: MatchRecord) {
    const index = store.matches.findIndex((candidate) => candidate.id === match.id)
    dispatch({ type: 'deleteMatch', id: match.id })
    draftDispatch({ type: 'reset' })
    showToast({
      text: 'Match annulé',
      action: { label: 'Rétablir', onClick: () => dispatch({ type: 'restoreMatch', match, index }) },
    })
  }

  if (store.players.length === 0) return <NoPlayers />

  if (draft.step === 'done') {
    if (savedMatch === undefined) return null
    const ranks = ranksFor(rankBefore, savedMatch.id)
    return (
      <ResultView
        match={savedMatch}
        result={result}
        ranking={ranking}
        playersById={playersById}
        now={now}
        rankBefore={ranks}
        onRematch={() => onRematch(savedMatch)}
        onKeepWinners={() => onKeepWinners(savedMatch)}
        onNewMatch={() => draftDispatch({ type: 'reset' })}
        onShowRanking={() => onShowRanking(savedMatch, ranks)}
        onCancelMatch={() => guard('annuler ce match', () => cancelMatch(savedMatch))}
      />
    )
  }

  if (draft.step === 'score' && teams !== null) {
    const preview = computePreview(result, store.players, teams, draft.target, draft.score, draft.comeback === true)
    return (
      <ScorePanel
        draft={draft}
        teams={teams}
        dispatch={draftDispatch}
        playersById={playersById}
        preview={
          preview && <MatchPreview preview={preview} teams={teams} target={draft.target} playersById={playersById} />
        }
        saveText={saveLabel(draft.target, draft.score)}
        canSave={draft.score !== null}
        onSave={() => guard('enregistrer ce match', save)}
        animate
      />
    )
  }

  return <PlayersStep draft={draft} dispatch={draftDispatch} playersById={playersById} byPlayer={result.byPlayer} />
}
