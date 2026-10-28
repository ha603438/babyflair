import { describe, expect, it } from 'vitest'
import { replayMode } from '../../rating/modes'
import { replayRankings } from '../../rating/rankings'
import type { Match, Player } from '../../types'
import { duoFormatOf, MAIN_LABEL, modeOfTab, TAB_OPTIONS, tabOf } from './modeLabels'

// The three Classement tabs: their labels (they must fit a 375 px segmented control, hence « Équipes ») and which
// replay each one shows.

const NOW = new Date('2026-10-20T12:00:00.000Z')
const PLAYERS: Player[] = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  name: id,
  isGuest: false,
  createdAt: '2026-10-01T12:00:00.000Z',
}))
const AT = '2026-10-19T12:00:00.000Z'

function match(seq: number, teamA: string[], teamB: string[]): Match {
  const dates = { playedAt: AT, createdAt: AT, updatedAt: AT }
  return { id: `m${seq}`, seq, ...dates, target: 10, teamA, teamB, scoreA: 10, scoreB: 3 }
}

const MATCHES: Match[] = [match(1, ['a', 'b'], ['c', 'd']), match(2, ['a'], ['c'])]

describe('Classement tabs', () => {
  it('are « 2V2 mixte » | « Équipes » | « 1V1 », on « 2V2 mixte » by default', () => {
    expect(TAB_OPTIONS.map((option) => option.label)).toEqual([MAIN_LABEL, 'Équipes', '1V1'])
    expect(MAIN_LABEL).toBe('2V2 mixte')
    expect(tabOf({})).toBe('mixte')
  })

  it('show the main ranking on « 2V2 mixte », the 1V1 replay of useReplay and the duos only when selected', () => {
    const rankings = replayRankings(PLAYERS, MATCHES, NOW)
    const duos = replayMode('2v2', PLAYERS, MATCHES, NOW)
    expect(modeOfTab('mixte', rankings, duos)).toBeNull()
    expect(modeOfTab('1v1', rankings, null)).toBe(rankings.oneVsOne)
    expect(modeOfTab('2v2', rankings, duos)).toBe(duos)
    expect(duoFormatOf('2v2')).toBe('2v2')
    expect(duoFormatOf('mixte')).toBeNull()
    expect(duoFormatOf('1v1')).toBeNull()
  })
})
