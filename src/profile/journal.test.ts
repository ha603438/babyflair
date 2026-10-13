import { describe, expect, it } from 'vitest'
import { fmtDayHeader, fmtTime } from '../format'
import type { Match, MatchEvent, MatchSnapshot, Player, PlayerId } from '../types'
import {
  filterEvents,
  actorName,
  authorshipLine,
  eventSnapshot,
  eventTitle,
  journalDays,
  journalRow,
  scoreChange,
  snapshotLine,
} from './journal'

function player(id: string, name: string): Player {
  return { id, name, isGuest: false, createdAt: '2026-10-01T10:00:00.000Z' }
}

const PLAYERS = new Map<PlayerId, Player>(
  [player('a', 'Alice'), player('b', 'Bob'), player('c', 'Chloé'), player('d', 'Dan'), player('arn', 'Arnault')].map(
    (p) => [p.id, p],
  ),
)

const snap = (scoreA: number, scoreB: number, patch: Partial<MatchSnapshot> = {}): MatchSnapshot => ({
  target: 5,
  teamA: ['a', 'b'],
  teamB: ['c', 'd'],
  scoreA,
  scoreB,
  ...patch,
})

function event(patch: Partial<MatchEvent> = {}): MatchEvent {
  return {
    id: 1,
    at: '2026-10-12T10:42:00.000Z',
    action: 'created',
    matchId: 'm1',
    actorId: 'arn',
    before: null,
    after: snap(5, 3),
    ...patch,
  }
}

describe('event titles', () => {
  it('« Arnault a saisi / a modifié / a supprimé / a rétabli »', () => {
    expect(eventTitle(event(), PLAYERS)).toBe('Arnault a saisi')
    expect(eventTitle(event({ action: 'updated' }), PLAYERS)).toBe('Arnault a modifié')
    expect(eventTitle(event({ action: 'deleted' }), PLAYERS)).toBe('Arnault a supprimé')
    expect(eventTitle(event({ action: 'restored' }), PLAYERS)).toBe('Arnault a rétabli')
  })

  it("« Quelqu'un » without an actor or for an unknown one", () => {
    expect(actorName(null, PLAYERS)).toBe("Quelqu'un")
    expect(actorName('gone', PLAYERS)).toBe("Quelqu'un")
    expect(eventTitle(event({ actorId: null, action: 'deleted' }), PLAYERS)).toBe("Quelqu'un a supprimé")
  })
})

describe('match summary', () => {
  it('Blancs first, with « ? » for unknown players', () => {
    expect(snapshotLine(snap(5, 3), PLAYERS)).toBe('Alice & Bob 5 – 3 Chloé & Dan')
    expect(snapshotLine(snap(2, 5, { teamA: ['a'], teamB: ['zz'] }), PLAYERS)).toBe('Alice 2 – 5 ?')
  })

  it('uses after, or before for a delete', () => {
    expect(eventSnapshot(event())).toEqual(snap(5, 3))
    expect(eventSnapshot(event({ action: 'deleted', before: snap(1, 5), after: null }))).toEqual(snap(1, 5))
    expect(eventSnapshot(event({ after: null }))).toBeNull()
  })

  it('shows the old → new score of an update only when it changed', () => {
    const updated = event({ action: 'updated', before: snap(5, 3), after: snap(5, 4) })
    expect(scoreChange(updated)).toBe('5 – 3 → 5 – 4')
    const swapped = event({ action: 'updated', before: snap(5, 3), after: snap(5, 3, { teamA: ['b', 'a'] }) })
    expect(scoreChange(swapped)).toBeNull()
    expect(scoreChange(event())).toBeNull()
  })
})

describe('journal rows and days', () => {
  it('builds a row, linkable while the match exists', () => {
    const row = journalRow(event(), PLAYERS, new Set(['m1']))
    expect(row).toEqual({
      id: 1,
      at: '2026-10-12T10:42:00.000Z',
      time: fmtTime('2026-10-12T10:42:00.000Z'),
      title: 'Arnault a saisi',
      summary: 'Alice & Bob 5 – 3 Chloé & Dan',
      change: null,
      matchId: 'm1',
      linkable: true,
    })
    expect(journalRow(event(), PLAYERS, new Set()).linkable).toBe(false)
    expect(journalRow(event({ after: null }), PLAYERS, new Set()).summary).toBeNull()
  })

  it('groups consecutive events of a local day, newest first', () => {
    const now = new Date('2026-10-12T15:00:00.000Z')
    const events = [
      event({ id: 3, at: '2026-10-12T12:00:00.000Z' }),
      event({ id: 2, at: '2026-10-12T11:00:00.000Z' }),
      event({ id: 1, at: '2026-10-08T11:00:00.000Z' }),
    ]
    const days = journalDays(events, PLAYERS, new Set(), now)
    expect(days.map((day) => day.rows.map((row) => row.id))).toEqual([[3, 2], [1]])
    expect(days.map((day) => day.label)).toEqual([
      fmtDayHeader('2026-10-12T12:00:00.000Z', now),
      fmtDayHeader('2026-10-08T11:00:00.000Z', now),
    ])
    expect(journalDays([], PLAYERS, new Set(), now)).toEqual([])
  })
})

describe('authorshipLine', () => {
  const base: Match = {
    id: 'm1',
    seq: 1,
    playedAt: '2026-10-12T10:00:00.000Z',
    createdAt: '2026-10-12T10:00:00.000Z',
    updatedAt: '2026-10-12T10:00:00.000Z',
    target: 5,
    teamA: ['a'],
    teamB: ['b'],
    scoreA: 5,
    scoreB: 2,
  }
  const edited = { updatedAt: '2026-10-12T11:00:00.000Z' }

  it('« Saisi par Arnault » and « · modifié par Bob » once edited', () => {
    expect(authorshipLine({ ...base, createdBy: 'arn' }, PLAYERS)).toBe('Saisi par Arnault')
    expect(authorshipLine({ ...base, ...edited, createdBy: 'arn', updatedBy: 'b' }, PLAYERS)).toBe(
      'Saisi par Arnault · modifié par Bob',
    )
  })

  it('ignores an updatedBy without a later updatedAt, and unknown players', () => {
    expect(authorshipLine({ ...base, createdBy: 'arn', updatedBy: 'b' }, PLAYERS)).toBe('Saisi par Arnault')
    expect(authorshipLine({ ...base, ...edited, updatedBy: 'b' }, PLAYERS)).toBe('Modifié par Bob')
    expect(authorshipLine({ ...base, createdBy: 'gone' }, PLAYERS)).toBeNull()
    expect(authorshipLine(base, PLAYERS)).toBeNull()
  })
})

describe('scoreChange with comeback', () => {
  const snap = (scoreA: number, scoreB: number, comeback?: boolean) => ({ target: 5 as const, teamA: ['a'], teamB: ['b'], scoreA, scoreB, comeback })
  const ev = (before: ReturnType<typeof snap>, after: ReturnType<typeof snap>) => ({ id: 1, at: '2026-10-12T10:00:00Z', action: 'updated' as const, matchId: 'm', actorId: null, before, after })
  it('mentions a ticked or unticked comeback', () => {
    expect(scoreChange(ev(snap(5, 4), snap(5, 4, true)))).toBe('comeback coché')
    expect(scoreChange(ev(snap(5, 4, true), snap(5, 4)))).toBe('comeback décoché')
    expect(scoreChange(ev(snap(5, 4, true), snap(5, 4, true)))).toBeNull()
  })
})

describe('filterEvents', () => {
  const ev = (action: 'created' | 'updated' | 'deleted' | 'restored') =>
    ({ id: 1, at: '2026-10-13T10:00:00Z', action, matchId: 'm', actorId: null, before: null, after: null })
  it('keeps modifications, deletions and restorations by default, everything with « Tout »', () => {
    const all = [ev('created'), ev('updated'), ev('deleted'), ev('restored')]
    expect(filterEvents(all, 'changes').map((e) => e.action)).toEqual(['updated', 'deleted', 'restored'])
    expect(filterEvents(all, 'all')).toHaveLength(4)
  })
})
