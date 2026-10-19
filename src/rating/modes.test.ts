import { describe, expect, it } from 'vitest'

import { canonicalDuoId, duoId, duoLabel, duoMembers, duoTitle, membersByName, teamDuoId } from '../duo'
import type { Match, Player, Target } from '../types'
import type { Match as EngineMatch, Player as EnginePlayer } from './engine'
import { DEFAULT_CONFIG, replay as engineReplay } from './engine'
import { replay } from './index'
import { expandDuoResult, isFormat, matchesOfFormat, MODE_CONFIG, MODE_RANKED_AFTER, replayMode } from './modes'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-12T12:00:00.000Z')
const DAY = 86_400_000

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString()
}

function player(id: string, name: string): Player {
  return { id, name, isGuest: false, createdAt: daysAgo(100) }
}

const PLAYERS: Player[] = [
  player('a', 'Edgar'),
  player('b', 'Arnault'),
  player('c', 'Chloé'),
  player('d', 'Dan'),
  player('e', 'Ève'),
]
const BY_ID = new Map(PLAYERS.map((p) => [p.id, p]))

type Spec = { teamA: string[]; teamB: string[]; scoreA: number; scoreB: number; days: number; target?: Target }

function matches(specs: Spec[]): Match[] {
  return specs.map((spec, i) => ({
    id: `m${i + 1}`,
    seq: i + 1,
    playedAt: daysAgo(spec.days),
    createdAt: daysAgo(spec.days),
    updatedAt: daysAgo(spec.days),
    target: spec.target ?? 10,
    teamA: spec.teamA,
    teamB: spec.teamB,
    scoreA: spec.scoreA,
    scoreB: spec.scoreB,
  }))
}

// Duo a+b: 4 matches (ranked), duo c+d: 3 (ranked), duo a+c / b+d: 1 each, duo c+e: 1 long ago (inactive).
// The 1v1 matches are interleaved: a and b play 1v1 four times, c and e once.
const HISTORY = matches([
  { teamA: ['a', 'b'], teamB: ['c', 'd'], scoreA: 10, scoreB: 8, days: 40 },
  { teamA: ['c', 'e'], teamB: ['a', 'b'], scoreA: 10, scoreB: 0, days: 39 },
  { teamA: ['a'], teamB: ['b'], scoreA: 10, scoreB: 4, days: 10 },
  { teamA: ['b', 'a'], teamB: ['d', 'c'], scoreA: 10, scoreB: 6, days: 9 },
  { teamA: ['c'], teamB: ['e'], scoreA: 5, scoreB: 4, days: 8, target: 5 },
  { teamA: ['b'], teamB: ['a'], scoreA: 10, scoreB: 9, days: 7 },
  { teamA: ['c', 'd'], teamB: ['a', 'b'], scoreA: 10, scoreB: 2, days: 6 },
  { teamA: ['a'], teamB: ['b'], scoreA: 10, scoreB: 7, days: 5 },
  { teamA: ['a', 'c'], teamB: ['b', 'd'], scoreA: 10, scoreB: 9, days: 4 },
  { teamA: ['a'], teamB: ['b'], scoreA: 10, scoreB: 3, days: 3 },
])

const AB = duoId('a', 'b')
const CD = duoId('c', 'd')
const AC = duoId('a', 'c')
const BD = duoId('b', 'd')
const CE = duoId('c', 'e')

function enginePlayer(id: string): EnginePlayer {
  return { id, name: id, createdAt: Date.parse(daysAgo(100)) }
}

function engineMatch(match: Match, teamA: string[], teamB: string[]): EngineMatch {
  return {
    id: match.id,
    seq: match.seq,
    playedAt: Date.parse(match.playedAt),
    createdAt: Date.parse(match.createdAt),
    target: match.target,
    teamA,
    teamB,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
  }
}

// ---------------------------------------------------------------------------
// Duo ids
// ---------------------------------------------------------------------------

describe('duo ids', () => {
  it('joins the two player ids sorted with « + », whatever the order', () => {
    expect(duoId('b', 'a')).toBe('a+b')
    expect(duoId('a', 'b')).toBe('a+b')
    expect(teamDuoId(['d', 'c'])).toBe('c+d')
    expect(teamDuoId(['a'])).toBeNull()
  })

  it('reads the members back, sorted, and rejects anything that is not a pair', () => {
    expect(duoMembers('a+b')).toEqual(['a', 'b'])
    expect(duoMembers('b+a')).toEqual(['a', 'b'])
    expect(canonicalDuoId('b+a')).toBe('a+b')
    for (const bad of ['a', 'a+', '+b', 'a+a', 'a+b+c', '']) {
      expect(duoMembers(bad)).toBeNull()
      expect(canonicalDuoId(bad)).toBeNull()
    }
  })

  it('labels a duo with its names sorted alphabetically (fr locale)', () => {
    expect(duoLabel(['a', 'b'], BY_ID)).toBe('Arnault & Edgar')
    expect(duoLabel(['c', 'e'], BY_ID)).toBe('Chloé & Ève')
    expect(membersByName(['a', 'b'], BY_ID)).toEqual(['b', 'a'])
    expect(duoLabel(['a', 'zz'], BY_ID)).toBe('? & Edgar')
    expect(duoTitle('b+a', PLAYERS)).toBe('Arnault & Edgar')
    expect(duoTitle('nope', PLAYERS)).toBe('Duo')
  })
})

describe('formats', () => {
  it('splits the history by format', () => {
    expect(matchesOfFormat(HISTORY, '1v1').map((m) => m.id)).toEqual(['m3', 'm5', 'm6', 'm8', 'm10'])
    expect(matchesOfFormat(HISTORY, '2v2').map((m) => m.id)).toEqual(['m1', 'm2', 'm4', 'm7', 'm9'])
    expect(isFormat(HISTORY[0], '2v2')).toBe(true)
    expect(isFormat(HISTORY[0], '1v1')).toBe(false)
  })

  it('ranks after 3 matches and keeps every other engine setting', () => {
    expect(MODE_RANKED_AFTER).toBe(3)
    expect(MODE_CONFIG).toEqual({ ...DEFAULT_CONFIG, rankedAfter: 3 })
  })
})

// ---------------------------------------------------------------------------
// 2V2
// ---------------------------------------------------------------------------

describe('replayMode 2v2', () => {
  const duos = replayMode('2v2', PLAYERS, HISTORY, NOW)

  it('rates every pair of teammates as one entity, over the 2v2 matches only', () => {
    expect([...duos.entities.keys()].sort()).toEqual([AB, AC, BD, CD, CE].sort())
    expect(duos.entities.get(AB)?.name).toBe('Arnault & Edgar')
    expect(duos.duos.get(AB)).toEqual(['a', 'b'])
    expect(duos.matches.map((m) => m.id)).toEqual(['m1', 'm2', 'm4', 'm7', 'm9'])
    expect([...duos.result.byMatch.keys()]).toEqual(['m1', 'm2', 'm4', 'm7', 'm9'])
    const ab = duos.result.byPlayer.get(AB)
    expect(ab).toMatchObject({ played: 4, wins: 2, losses: 2 })
    expect(ab?.history.map((p) => p.matchId)).toEqual(['m1', 'm2', 'm4', 'm7'])
  })

  it('applies the engine maths to duo vs duo 1v1 matches (no teammate split)', () => {
    const own = matchesOfFormat(HISTORY, '2v2')
    const expected = engineReplay(
      [AB, AC, BD, CD, CE].map(enginePlayer),
      own.map((m) => engineMatch(m, [teamDuoId(m.teamA) ?? ''], [teamDuoId(m.teamB) ?? ''])),
      MODE_CONFIG,
    )
    for (const id of [AB, AC, BD, CD, CE]) {
      const stats = duos.result.byPlayer.get(id)
      expect(stats?.history.at(-1)?.ratingAfter).toBe(expected.players[id].rating)
      expect(stats?.rating).toBe(Math.round(expected.players[id].rating))
    }
    const first = duos.result.byMatch.get('m1')
    expect(first?.perPlayer.map((d) => d.playerId)).toEqual([AB, CD])
    // One side per duo, the whole team delta, the rookie multiplier of a first match (×3), the margin ×1,2.
    expect(first?.perPlayer[0].why).toContain('débutant ×3,0')
    expect(first?.perPlayer[0].why).toContain('marge ×1,2')
    expect(first?.perPlayer[0].why).not.toContain('part ')
    expect(duos.result.byMatch.get('m2')?.perPlayer[0].why).toContain('fanny ×1,2')
  })

  it('splits classés / pas encore classés / inactifs with the 3-match threshold, best rating first', () => {
    // a+b and c+d have 4 and 3 matches; a+c and b+d one; c+e played its only match 39 days ago.
    expect([...duos.ranking.ranked].sort()).toEqual([AB, CD].sort())
    expect([...duos.ranking.rookies].sort()).toEqual([AC, BD].sort())
    expect(duos.ranking.inactive).toEqual([CE])
    const ratings = duos.ranking.ranked.map((id) => duos.result.byPlayer.get(id)?.rating ?? 0)
    expect(ratings).toEqual([...ratings].sort((x, y) => y - x))
    expect(duos.result.byPlayer.get(AC)).toMatchObject({ status: 'rookie', rookieProgress: 1 })
    expect(duos.result.byPlayer.get(AB)).toMatchObject({ status: 'ranked', rookieProgress: 3 })
  })

  it('copies each duo line onto its two members for a history row', () => {
    const match = HISTORY[3]
    const expanded = expandDuoResult(duos.result.byMatch.get(match.id), match)
    const deltas = new Map(expanded?.perPlayer.map((entry) => [entry.playerId, entry.delta]))
    const lines = duos.result.byMatch.get(match.id)?.perPlayer ?? []
    const abDelta = lines.find((d) => d.playerId === AB)?.delta
    const cdDelta = lines.find((d) => d.playerId === CD)?.delta
    expect([...deltas.keys()]).toEqual(['b', 'a', 'd', 'c'])
    expect(abDelta).toBeGreaterThan(0)
    expect(deltas.get('a')).toBe(abDelta)
    expect(deltas.get('b')).toBe(abDelta)
    expect(deltas.get('c')).toBe(cdDelta)
    expect(deltas.get('d')).toBe(cdDelta)
    expect(expandDuoResult(undefined, match)).toBeUndefined()
  })

  it('is empty without a 2v2 match', () => {
    const none = replayMode('2v2', PLAYERS, matchesOfFormat(HISTORY, '1v1'), NOW)
    expect(none.entities.size).toBe(0)
    expect(none.ranking).toEqual({ ranked: [], rookies: [], inactive: [] })
    expect(none.matches).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 1V1
// ---------------------------------------------------------------------------

describe('replayMode 1v1', () => {
  const solo = replayMode('1v1', PLAYERS, HISTORY, NOW)

  it('lists only the players with a 1v1 match, rated over the 1v1 matches only', () => {
    expect([...solo.entities.keys()]).toEqual(['a', 'b', 'c', 'e'])
    expect(solo.result.byPlayer.has('d')).toBe(false)
    expect(solo.duos.size).toBe(0)
    const own = matchesOfFormat(HISTORY, '1v1')
    const expected = engineReplay(
      ['a', 'b', 'c', 'e'].map(enginePlayer),
      own.map((m) => engineMatch(m, m.teamA, m.teamB)),
      MODE_CONFIG,
    )
    for (const id of ['a', 'b', 'c', 'e']) {
      expect(solo.result.byPlayer.get(id)?.history.at(-1)?.ratingAfter).toBe(expected.players[id].rating)
    }
    expect(solo.result.byPlayer.get('a')).toMatchObject({ played: 4, wins: 3, losses: 1 })
  })

  it('differs from the Mixte ranking, which counts every match', () => {
    const mixte = replay(PLAYERS, HISTORY, { now: NOW })
    expect(mixte.byPlayer.get('a')?.played).toBe(9)
    expect(solo.result.byPlayer.get('a')?.played).toBe(4)
    expect(mixte.byPlayer.get('a')?.rookieProgress).toBe(9)
  })

  it('ranks after 3 matches: a and b are classés, c and e not yet', () => {
    expect(solo.ranking.ranked).toEqual(['a', 'b'])
    expect([...solo.ranking.rookies].sort()).toEqual(['c', 'e'])
    expect(solo.ranking.inactive).toEqual([])
    expect(solo.result.byPlayer.get('c')).toMatchObject({ status: 'rookie', rookieProgress: 1 })
  })

  it('moves a player without a 1v1 match for 30 days to Inactifs', () => {
    const later = new Date(NOW.getTime() + 30 * DAY)
    const aged = replayMode('1v1', PLAYERS, HISTORY, later)
    expect(aged.ranking.ranked).toEqual([])
    expect([...aged.ranking.inactive].sort()).toEqual(['a', 'b', 'c', 'e'])
  })
})

describe('announcements in the 2V2 and 1V1 rankings', () => {
  const withBet = (bets: Pick<Match, 'betA' | 'betB'>): Match[] =>
    HISTORY.map((m) => (m.id === 'm4' || m.id === 'm3' ? { ...m, ...bets } : m))

  it('the duo entity gets the announcement, judged on the duo ratings', () => {
    const plain = replayMode('2v2', PLAYERS, HISTORY, NOW)
    const bet = replayMode('2v2', PLAYERS, withBet({ betA: 3 }), NOW) // m4: b+a beat d+c 10-6 (margin 4)
    const before = plain.result.byMatch.get('m4')
    const after = bet.result.byMatch.get('m4')
    if (before === undefined || after === undefined) throw new Error('m4 missing')
    expect(after.bets).toHaveLength(1)
    expect(after.bets[0]).toMatchObject({ team: 'A', n: 3, success: true })
    const duoAB = after.perPlayer.find((p) => p.team === 'A')
    const plainAB = before.perPlayer.find((p) => p.team === 'A')
    expect(duoAB?.playerId).toBe(duoId('a', 'b'))
    expect((duoAB?.delta ?? 0) - (plainAB?.delta ?? 0)).toBeCloseTo(after.bets[0].delta, 2)
    expect(after.perPlayer.find((p) => p.team === 'B')?.delta).toBe(before.perPlayer.find((p) => p.team === 'B')?.delta)
    expect(expandDuoResult(after, HISTORY[3])?.bets).toEqual(after.bets)
  })

  it('the 1V1 ranking applies it too', () => {
    const bet = replayMode('1v1', PLAYERS, withBet({ betA: 7 }), NOW) // m3: a beats b 10-4 (margin 6 < 7)
    const result = bet.result.byMatch.get('m3')
    expect(result?.bets).toEqual([expect.objectContaining({ team: 'A', n: 7, success: false })])
  })
})
