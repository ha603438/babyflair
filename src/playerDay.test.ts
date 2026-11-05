import { describe, expect, it } from 'vitest'
import { betFields } from './bets'
import { NEMESIS_MIN_LOSSES, playerDayRecap } from './playerDay'
import { replayRankings } from './rating/rankings'
import type { Match, Player, PlayerId, Target } from './types'
import { dayLines, dayTiles, dayTitle, rankText } from './screens/lists/playerDayLines'

// « Récap du jour » of the player page (src/playerDay.ts + its copy): the latest day with a match, its points and
// record from the player's side, the rating moves of the formats he played, and each highlight's rule. Real replays
// (each match in the ranking of its format); dates in local time (TZ-independent).

const PLAYERS: Player[] = ['alice', 'bob', 'chloe', 'dan', 'eve', 'fred'].map((id) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  isGuest: false,
  createdAt: '2026-09-01T10:00:00.000Z',
}))
const BY_ID = new Map(PLAYERS.map((player) => [player.id, player]))

let seq = 0

type Spec = { day: number; a: PlayerId[]; b: PlayerId[]; score: [number, number]; target?: Target; betA?: number }

/** A match on November `day` 2026, local time, one minute after the previous one. */
function match({ day, a, b, score, target = 5, betA }: Spec): Match {
  seq += 1
  const at = new Date(2026, 10, day, 12, seq).toISOString()
  const base = { id: `m${seq}`, seq, playedAt: at, createdAt: at, updatedAt: at, target, teamA: a, teamB: b }
  return { ...base, scoreA: score[0], scoreB: score[1], ...betFields(betA, undefined) }
}

function dayOf(playerId: PlayerId, matches: Match[]) {
  const rankings = replayRankings(PLAYERS, matches, new Date(2026, 10, 30))
  return { day: playerDayRecap(playerId, PLAYERS, matches, rankings), rankings }
}

describe('playerDayRecap', () => {
  it('is null for a player who never played', () => {
    const matches = [match({ day: 3, a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [5, 2] })]
    expect(dayOf('eve', matches).day).toBeNull()
  })

  it('sums up his latest day only: net points from each match’s ranking, record, 2V2 mixte move', () => {
    const old = match({ day: 3, a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [5, 0] })
    const m1 = match({ day: 4, a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [5, 3] })
    const m2 = match({ day: 4, a: ['chloe', 'alice'], b: ['bob', 'dan'], score: [2, 5] })
    const other = match({ day: 4, a: ['eve'], b: ['fred'], score: [5, 1] })
    const { day, rankings } = dayOf('alice', [old, m1, m2, other])
    if (day === null) throw new Error('day expected')
    expect(day.matches.map((m) => m.id)).toEqual([m1.id, m2.id])
    expect([day.wins, day.losses]).toEqual([1, 1])
    const delta = (id: string) => rankings.byMatch.get(id)?.perPlayer.find((row) => row.playerId === 'alice')?.delta ?? 0
    expect(day.net).toBeCloseTo(delta(m1.id) + delta(m2.id), 3)
    const history = rankings.main.result.byPlayer.get('alice')?.history ?? []
    expect(day.main).toEqual({ before: history[1].ratingBefore, after: history[2].ratingAfter })
    expect(day.oneVsOne).toBeNull()
    // Nobody is ranked after 3 matches (10 needed in 2V2 mixte).
    expect(day.rank).toEqual({ before: null, after: null })
  })

  it('adds the 1V1 move when he played 1v1 that day, and no 2V2 mixte move without a 2v2', () => {
    const solo = match({ day: 5, a: ['alice'], b: ['bob'], score: [5, 4] })
    const { day, rankings } = dayOf('alice', [solo])
    const point = rankings.oneVsOne.result.byPlayer.get('alice')?.history[0]
    expect(day?.oneVsOne).toEqual({ before: point?.ratingBefore, after: point?.ratingAfter })
    expect(day?.main).toBeNull()
    expect(day?.rank).toBeNull()
  })

  it('best partner: most points together (> 0); nemesis: the opponent who beat him at least twice', () => {
    const matches = [
      match({ day: 6, a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [5, 1] }),
      match({ day: 6, a: ['alice', 'eve'], b: ['chloe', 'fred'], score: [3, 5] }),
      match({ day: 6, a: ['alice', 'eve'], b: ['chloe', 'dan'], score: [4, 5] }),
    ]
    const { day } = dayOf('alice', matches)
    expect(day?.partner).toMatchObject({ partnerId: 'bob', wins: 1, losses: 0 })
    expect(day?.nemesis).toEqual({ opponentId: 'chloe', wins: 1, losses: NEMESIS_MIN_LOSSES })
    // Dan beat her once only.
    const once = dayOf('alice', matches.slice(0, 2)).day
    expect(once?.nemesis).toBeNull()
  })

  it('best win: the lowest chance under 50 %; fanny and comebacks split by side; his announcements', () => {
    const warmUp = [1, 2, 3].map(() => match({ day: 1, a: ['chloe', 'dan'], b: ['alice', 'bob'], score: [5, 0] }))
    const upset = match({ day: 7, a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [5, 3], betA: 2 })
    const fanny = match({ day: 7, a: ['alice', 'eve'], b: ['fred', 'bob'], score: [5, 0] })
    const comeback = { ...match({ day: 7, a: ['fred', 'eve'], b: ['alice', 'chloe'], score: [5, 4] }), comeback: true }
    const { day, rankings } = dayOf('alice', [...warmUp, upset, fanny, comeback])
    expect(day?.holdUp?.match.id).toBe(upset.id)
    expect(day?.holdUp?.chance).toBeCloseTo(rankings.byMatch.get(upset.id)?.expectedA ?? 1, 10)
    expect(day?.fannyGiven.map((m) => m.id)).toEqual([fanny.id])
    expect(day?.fannyTaken).toEqual([])
    expect(day?.comebackSuffered.map((m) => m.id)).toEqual([comeback.id])
    expect(day?.bets).toMatchObject({ made: 1, won: 1, match: upset })
    expect(day?.bets?.points).toBeCloseTo(rankings.byMatch.get(upset.id)?.bets[0].delta ?? 0, 3)
    // Fred took the fanny from the other side.
    expect(dayOf('fred', [...warmUp, upset, fanny, comeback]).day?.fannyTaken.map((m) => m.id)).toEqual([fanny.id])
  })

  it('flags the Récap’s « Joueur du jour » and « Dans le dur » when they are him', () => {
    const matches = [match({ day: 8, a: ['alice'], b: ['bob'], score: [5, 0] })]
    expect(dayOf('alice', matches).day).toMatchObject({ hot: true, cold: false })
    expect(dayOf('bob', matches).day).toMatchObject({ hot: false, cold: true })
  })
})

describe('« Récap du jour » copy', () => {
  it('titles today « Récap du jour », another day « Dernière journée · … »', () => {
    const now = new Date(2026, 10, 5, 18, 0)
    expect(dayTitle({ date: new Date(2026, 10, 5, 12, 30).toISOString() }, now)).toBe('Récap du jour')
    expect(dayTitle({ date: new Date(2026, 10, 4, 12, 30).toISOString() }, now)).toBe('Dernière journée · Hier')
    expect(dayTitle({ date: new Date(2026, 10, 2, 12, 30).toISOString() }, now)).toBe(
      'Dernière journée · lundi 2 novembre',
    )
  })

  it('reads the rank move', () => {
    expect(rankText({ before: 5, after: 3 })).toBe('5e → 3e')
    expect(rankText({ before: 1, after: 1 })).toBe('1er')
    expect(rankText({ before: null, after: 8 })).toBe('8e (entrée)')
    expect(rankText({ before: 2, after: null })).toBeNull()
  })

  it('tiles: points and record always, then the moves of the formats played; lines only when they apply', () => {
    const matches = [
      match({ day: 9, a: ['alice', 'bob'], b: ['chloe', 'dan'], score: [5, 0] }),
      match({ day: 9, a: ['alice'], b: ['eve'], score: [5, 2] }),
    ]
    const { day } = dayOf('alice', matches)
    if (day === null) throw new Error('day expected')
    const tiles = dayTiles(day)
    expect(tiles.map((tile) => tile.label)).toEqual(['Points', 'Bilan', '2V2 mixte', '1V1'])
    expect(tiles[0]).toMatchObject({ tone: 'pos' })
    expect(tiles[0].value.startsWith('+')).toBe(true)
    expect(tiles[1].value).toBe('2 V · 0 D')
    expect(tiles[2].value).toMatch(/^1\u202f000 → 1\u202f\d{3}$/u)
    const lines = dayLines('alice', day, BY_ID)
    expect(lines.map((line) => line.key)).toEqual(['hot', 'partner', `fannyGiven-${matches[0].id}`])
    expect(lines[1]).toMatchObject({ label: 'Meilleur partenaire', subject: 'Bob', detail: '1 V · 0 D', tone: 'pos' })
    expect(lines[1].href).toBe('#/duo/alice+bob')
    expect(lines[2]).toMatchObject({ label: 'Fanny mis', subject: 'Alice & Bob 5–0 Chloe & Dan' })
  })
})
