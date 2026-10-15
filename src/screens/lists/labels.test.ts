import { describe, expect, it } from 'vitest'
import { fmtInt, fmtPercent, fmtRelative, fmtRelativeDay } from '../../format'
import type { Match, Player, PlayerStats, Ranking } from '../../types'
import {
  contextStripText,
  hasTwoVsTwo,
  heroCaption,
  latestMatch,
  modeLineText,
  partnerText,
  playerCountText,
  recentMatchIds,
  recordText,
  sparklineCaption,
  sparklinePoints,
  streakText,
  winRateText,
} from './labels'

const now = new Date('2026-10-12T10:00:00Z')
const DAY = 86_400_000
const daysAgo = (days: number): string => new Date(now.getTime() - days * DAY).toISOString()
const player = (id: string, name: string, isGuest = false): Player => ({ id, name, isGuest, createdAt: daysAgo(100) })
const match = (id: string, seq: number, playedDaysAgo: number, teamA: string[], teamB: string[]): Match => ({
  id,
  seq,
  playedAt: daysAgo(playedDaysAgo),
  createdAt: daysAgo(playedDaysAgo),
  updatedAt: daysAgo(playedDaysAgo),
  target: 10,
  teamA,
  teamB,
  scoreA: 10,
  scoreB: 7,
})
const stats = (patch: Partial<PlayerStats> = {}): PlayerStats => ({
  playerId: 'a',
  rating: 1026,
  played: 20,
  wins: 12,
  losses: 8,
  status: 'ranked',
  rookieProgress: 10,
  history: [],
  ...patch,
})
const ranking: Ranking = { ranked: ['x', 'y', 'a', 'z'], rookies: [], inactive: [] }

describe('latestMatch', () => {
  it('returns the match with the latest playedAt, or undefined', () => {
    expect(latestMatch([])).toBeUndefined()
    const list = [match('m1', 1, 5, ['a'], ['b']), match('m2', 2, 1, ['a'], ['b']), match('m3', 3, 3, ['a'], ['b'])]
    expect(latestMatch(list)?.id).toBe('m2')
  })
})

describe('texts', () => {
  it('builds the context strip', () => {
    const last = daysAgo(0.01)
    expect(contextStripText(48, 12, last, now, true)).toBe(
      `48 matchs · 12 classés · dernier match ${fmtRelative(last, now)}`,
    )
    expect(contextStripText(1, 1, last, now, true)).toBe(`1 match · 1 classé · dernier match ${fmtRelative(last, now)}`)
  })
  it('says only the day of the last match without times', () => {
    const today = new Date(now.getTime() - 5 * 60_000).toISOString()
    expect(contextStripText(2, 1, today, now, false)).toBe(`2 matchs · 1 classé · dernier match ${fmtRelativeDay(today, now)}`)
    expect(contextStripText(2, 1, today, now, false)).not.toMatch(/min|\bh\b/)
  })
  it('counts players and guests', () => {
    expect(playerCountText([player('a', 'A')])).toBe('1 joueur')
    expect(playerCountText([player('a', 'A'), player('b', 'B', true), player('c', 'C', true)])).toBe(
      '3 joueurs · 2 invités',
    )
  })
  it('captions the hero by status', () => {
    expect(heroCaption(stats(), ranking, now)).toBe('3e sur 4')
    expect(heroCaption(stats({ playerId: 'r', status: 'rookie', rookieProgress: 4 }), ranking, now)).toBe(
      'Pas encore classé · 4/10 matchs',
    )
    expect(heroCaption(stats({ playerId: 'i', status: 'inactive', lastPlayedAt: daysAgo(42) }), ranking, now)).toBe(
      'Inactif · dernier match il y a 42 j',
    )
  })
  it('formats the win rate', () => {
    expect(winRateText(stats({ played: 0, wins: 0 }))).toBe(fmtPercent(0))
    expect(winRateText(stats())).toBe(fmtPercent(0.6))
  })
  it('formats the streak', () => {
    expect(streakText(null)).toBeNull()
    expect(streakText({ kind: 'win', length: 3 })).toBe('Série en cours : 3 victoires')
    expect(streakText({ kind: 'loss', length: 2 })).toBe('Série en cours : 2 défaites')
  })
  it('formats the favourite partner', () => {
    const players = new Map([['b', player('b', 'Bob')]])
    expect(partnerText(null, players)).toBe('Pas encore de partenaire')
    expect(partnerText({ partnerId: 'b', shared: 7, winRate: 0.71 }, players)).toBe(
      `Bob · 7 matchs ensemble · ${fmtPercent(0.71)} de victoires`,
    )
  })
})

describe('sparkline', () => {
  const point = (matchId: string, ratingAfter: number) => ({
    matchId,
    playedAt: daysAgo(1),
    ratingBefore: 1000,
    ratingAfter,
    delta: ratingAfter - 1000,
  })
  it('keeps the last 30 ratings, oldest first', () => {
    const history = Array.from({ length: 35 }, (_, i) => point(`m${i}`, 1000 + i))
    const points = sparklinePoints(stats({ history }))
    expect(points).toHaveLength(30)
    expect(points[0]).toBe(1005)
    expect(points[29]).toBe(1034)
  })
  it('captions with min and max, or the waiting line', () => {
    expect(sparklineCaption([1000])).toBe('La courbe apparaîtra après quelques matchs.')
    expect(sparklineCaption([962, 1041, 1000])).toBe(`3 derniers matchs · min ${fmtInt(962)} · max ${fmtInt(1041)}`)
  })
  it('lists recent match ids newest first', () => {
    const history = Array.from({ length: 12 }, (_, i) => point(`m${i}`, 1000))
    expect(recentMatchIds(stats({ history }))).toEqual(['m11', 'm10', 'm9', 'm8', 'm7', 'm6', 'm5', 'm4', 'm3', 'm2'])
    expect(recentMatchIds(stats({ history }), 2)).toEqual(['m11', 'm10'])
  })
})

describe('hasTwoVsTwo', () => {
  it('is true only when the player has a 2v2 match', () => {
    const only1v1 = [match('m1', 1, 1, ['a'], ['b'])]
    const with2v2 = [...only1v1, match('m2', 2, 1, ['c', 'd'], ['a', 'b'])]
    expect(hasTwoVsTwo('a', only1v1)).toBe(false)
    expect(hasTwoVsTwo('a', with2v2)).toBe(true)
    expect(hasTwoVsTwo('zz', with2v2)).toBe(false)
  })
})

describe('2V2 / 1V1 labels', () => {
  it('captions a hero with the threshold of its ranking', () => {
    const rookie = stats({ playerId: 'r', status: 'rookie', rookieProgress: 2 })
    expect(heroCaption(rookie, ranking, now, 3)).toBe('Pas encore classé · 2/3 matchs')
    expect(heroCaption(stats(), ranking, now, 3)).toBe('3e sur 4')
  })
  it('builds the discreet 1V1 line of the player page', () => {
    expect(modeLineText('1V1', stats({ rating: 1032 }), ranking)).toBe(`1V1 : ${fmtInt(1032)} · 3e`)
    expect(modeLineText('1V1', stats({ playerId: 'r', status: 'rookie' }), ranking)).toBe(
      `1V1 : ${fmtInt(1026)} · pas encore classé`,
    )
    expect(modeLineText('1V1', stats({ playerId: 'i', status: 'inactive' }), ranking)).toBe(
      `1V1 : ${fmtInt(1026)} · inactif`,
    )
  })
  it('formats a win / loss record', () => {
    expect(recordText({ wins: 3, losses: 1 })).toBe('3 V · 1 D')
  })
})
