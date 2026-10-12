import { PreviewTable } from '../../components/PreviewTable'
import { teamLabel } from '../../stats'
import type { Player, PlayerId, Target } from '../../types'
import type { DraftTeams } from './draftMatch'
import type { PreviewData } from './preview'

export type MatchPreviewProps = {
  preview: PreviewData
  teams: DraftTeams
  target: Target
  playersById: Map<PlayerId, Player>
}

/** PreviewTable fed by `computePreview`: chance line + 4-row table before a score, one exact line after. */
export function MatchPreview({ preview, teams, target, playersById }: MatchPreviewProps) {
  const labels = [{ label: teamLabel(teams.teamA, playersById) }, { label: teamLabel(teams.teamB, playersById) }] as const
  const expected = [preview.data.expectedA, preview.data.expectedB] as const
  if (preview.mode === 'whatif') {
    return (
      <PreviewTable
        mode="whatif"
        rows={preview.data.rows}
        teams={labels}
        expected={expected}
        target={target}
        players={playersById}
      />
    )
  }
  return (
    <PreviewTable
      mode="exact"
      rows={preview.data.rows}
      teams={labels}
      expected={expected}
      target={target}
      players={playersById}
    />
  )
}
