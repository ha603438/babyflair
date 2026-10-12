// Step B preview (spec §4 step B, 4): what-if rows before a score, exact deltas after. The engine is the only
// source of the numbers; this module just picks the mode and swallows the engine's validation errors.
import { previewMatch } from '../../rating'
import type { Player, PreviewExact, PreviewWhatIf, ReplayResult, Score, Target } from '../../types'
import type { DraftTeams } from './draftMatch'

export type PreviewData = { mode: 'whatif'; data: PreviewWhatIf } | { mode: 'exact'; data: PreviewExact }

function isWhatIf(preview: PreviewWhatIf | PreviewExact): preview is PreviewWhatIf {
  return preview.rows.length > 0 && preview.rows.every((row) => 'winDelta' in row)
}

function isExact(preview: PreviewWhatIf | PreviewExact): preview is PreviewExact {
  return preview.rows.length > 0 && preview.rows.every((row) => 'delta' in row)
}

/** The engine throws on an invalid draft (unknown id, duplicate, unequal sizes): the preview is then just hidden. */
export function computePreview(
  result: ReplayResult,
  players: Player[],
  teams: DraftTeams,
  target: Target,
  score: Score | null,
): PreviewData | null {
  try {
    if (score === null) {
      const data = previewMatch(result, players, { teamA: teams.teamA, teamB: teams.teamB, target })
      if (!isWhatIf(data)) return null
      return { mode: 'whatif', data }
    }
    const data = previewMatch(result, players, { teamA: teams.teamA, teamB: teams.teamB, target, score })
    if (!isExact(data)) return null
    return { mode: 'exact', data }
  } catch {
    return null
  }
}
