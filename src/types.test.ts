import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Draft, ExportFile, Match, Player, PlayerStats, Ranking, ReplayResult, Settings, Store } from './types'

// Compile-time checks that the shared shapes accept the data every other module will build.

const player: Player = { id: 'p1', name: 'Alice', isGuest: false, createdAt: '2026-10-01T10:00:00.000Z' }

const match: Match = {
  id: 'm1',
  seq: 1,
  playedAt: '2026-10-06T12:42:00.000Z',
  createdAt: '2026-10-06T12:42:00.000Z',
  updatedAt: '2026-10-06T12:42:00.000Z',
  target: 10,
  teamA: ['p1', 'p2'],
  teamB: ['p3', 'p4'],
  scoreA: 10,
  scoreB: 8,
}

const settings: Settings = { lastFormat: '2v2', lastTarget: 10 }

const store: Store = { version: 1, players: [player], matches: [match], settings, nextSeq: 2, calls: [], callPlayers: [] }

const exportFile: ExportFile = {
  app: 'babyflair',
  version: 1,
  exportedAt: '2026-10-11T09:00:00.000Z',
  players: store.players,
  matches: store.matches,
  settings: store.settings,
}

const stats: PlayerStats = {
  playerId: 'p1',
  rating: 1028,
  played: 1,
  wins: 1,
  losses: 0,
  lastPlayedAt: match.playedAt,
  status: 'rookie',
  rookieProgress: 1,
  history: [{ matchId: 'm1', playedAt: match.playedAt, ratingBefore: 1012, ratingAfter: 1028, delta: 16 }],
}

const replay: ReplayResult = {
  byPlayer: new Map([[stats.playerId, stats]]),
  byMatch: new Map([
    [
      match.id,
      {
        matchId: match.id,
        expectedA: 0.28,
        expectedB: 0.72,
        perPlayer: [
          { playerId: 'p1', team: 'A', before: 1012, after: 1028, delta: 16, why: 'Attendu 28 % de victoire' },
        ],
        bets: [],
      },
    ],
  ]),
}

const ranking: Ranking = { ranked: [], rookies: ['p1'], inactive: [] }

const draft: Draft = {
  format: '2v2',
  target: 10,
  slots: ['p1', null, null, null],
  activeSlot: 1,
  score: null,
  step: 'players',
}

describe('types', () => {
  it('narrow literal unions as intended', () => {
    expectTypeOf(match.target).toEqualTypeOf<5 | 10>()
    expectTypeOf(settings.lastFormat).toEqualTypeOf<'1v1' | '2v2'>()
    expectTypeOf(stats.status).toEqualTypeOf<'ranked' | 'rookie' | 'inactive'>()
    expectTypeOf(draft.step).toEqualTypeOf<'players' | 'score' | 'done'>()
    expectTypeOf(store.version).toEqualTypeOf<1>()
    expectTypeOf(exportFile.app).toEqualTypeOf<'babyflair'>()
  })

  it('keeps the sample data coherent', () => {
    expect(replay.byMatch.get(match.id)?.perPlayer[0]?.delta).toBe(16)
    expect(ranking.rookies).toContain(stats.playerId)
    expect(draft.slots).toHaveLength(4)
  })
})
