// Détail du match (spec §3.4): MatchSummary, « Modifier » / « Supprimer » with undo. Unknown id → the list.
import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MatchSummary } from '../components/MatchSummary'
import { fmtDateLine } from '../format'
import { useShowsTimes } from '../profile/useShowsTimes'
import { useWriteGuard } from '../profile/useWriteGuard'
import { useReplay } from '../rating/useReplay'
import { back, hrefOf, navigate } from '../router'
import { useAppState } from '../store'
import type { Match, MatchId, MatchResult } from '../types'

/** After a delete, history.back() returns to the list; if there was no entry to go back to (deep link), the list
 *  is loaded after this delay instead. */
const BACK_FALLBACK_MS = 400

// Replace rather than push: a pushed redirect would make « Retour » land on the dead id and bounce again.
function replaceWithHistorique(): void {
  window.location.replace(hrefOf({ name: 'historique' }))
}

// The replay is keyed on the same store as the match list, so a match without a result is a transient state at
// worst; the hero and the buttons still render, only the per-player rows are missing.
function emptyResult(matchId: MatchId): MatchResult {
  return { matchId, expectedA: 0.5, expectedB: 0.5, perPlayer: [] }
}

export function MatchDetail({ id }: { id: MatchId }) {
  const { store, dispatch, toast } = useAppState()
  const { result, players } = useReplay()
  const showTime = useShowsTimes()
  const guard = useWriteGuard()
  const [confirming, setConfirming] = useState(false)
  const leaving = useRef(false)
  const match = store.matches.find((candidate) => candidate.id === id)

  useEffect(() => {
    if (match !== undefined) return
    if (!leaving.current) {
      replaceWithHistorique()
      return
    }
    const timer = setTimeout(() => {
      if (window.location.hash === hrefOf({ name: 'match-detail', id })) replaceWithHistorique()
    }, BACK_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [match, id])

  function restore(removed: Match, index: number): void {
    // Same object, same index: the replay is byte-identical to the one before the delete.
    dispatch({ type: 'restoreMatch', match: removed, index })
    toast.show({ text: 'Match rétabli' })
  }

  function remove(removed: Match): void {
    const index = store.matches.indexOf(removed)
    setConfirming(false)
    leaving.current = true
    dispatch({ type: 'deleteMatch', id: removed.id })
    back()
    toast.show({ text: 'Match supprimé', action: { label: 'Annuler', onClick: () => restore(removed, index) } })
  }

  if (match === undefined) return null

  return (
    <div className="md-col">
      <MatchSummary
        match={match}
        result={result.byMatch.get(id) ?? emptyResult(id)}
        players={players}
        byPlayer={result.byPlayer}
        dateLine={fmtDateLine(match.playedAt, match.target, showTime)}
      />
      <div className="md-actions">
        <Button
          variant="secondary"
          size="md"
          onClick={() => guard('modifier ce match', () => navigate({ name: 'match-edit', id }))}
        >
          Modifier
        </Button>
        <Button variant="text" danger size="md" onClick={() => guard('supprimer ce match', () => setConfirming(true))}>
          Supprimer
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Supprimer ce match ?"
        body="Le classement sera recalculé sans lui."
        confirmLabel="Supprimer"
        danger
        onConfirm={() => remove(match)}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}
