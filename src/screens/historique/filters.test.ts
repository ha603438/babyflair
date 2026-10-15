import { describe, expect, it } from 'vitest'
import type { Match, Player } from '../../types'
import {
  countLine,
  filterMatches,
  isFiltered,
  matchFormat,
  NO_FILTERS,
  playedIn,
  playerOptions,
  playerValue,
  resolveFilters,
  toggleFormat,
  withPlayer,
} from './filters'
import { saveHistoryFilters, savedHistoryFilters } from './useHistoryFilters'

function player(id: string, name: string, isGuest = false): Player {
  return { id, name, isGuest, createdAt: '2025-09-01T10:00:00.000Z' }
}

function match(id: string, teamA: string[], teamB: string[]): Match {
  return {
    id,
    seq: 1,
    playedAt: '2025-10-01T12:42:00.000Z',
    createdAt: '2025-10-01T12:42:00.000Z',
    updatedAt: '2025-10-01T12:42:00.000Z',
    target: 10,
    teamA,
    teamB,
    scoreA: 10,
    scoreB: 8,
  }
}

const DUO = match('m1', ['alice', 'bob'], ['chloe', 'dan'])
const SOLO = match('m2', ['alice'], ['eve'])
const SOLO_BOB = match('m3', ['bob'], ['dan'])
const MATCHES = [DUO, SOLO, SOLO_BOB]

describe('matchFormat / playedIn', () => {
  it('one player per team is a 1v1, two is a 2v2', () => {
    expect(matchFormat(SOLO)).toBe('1v1')
    expect(matchFormat(DUO)).toBe('2v2')
  })

  it('finds a player on either team', () => {
    expect(playedIn(DUO, 'alice')).toBe(true)
    expect(playedIn(DUO, 'dan')).toBe(true)
    expect(playedIn(DUO, 'eve')).toBe(false)
  })
})

describe('filterMatches', () => {
  it('keeps every match, in order, when nothing is filtered', () => {
    expect(filterMatches(MATCHES, NO_FILTERS)).toEqual(MATCHES)
  })

  it('filters by format', () => {
    expect(filterMatches(MATCHES, { format: '1v1', playerId: null })).toEqual([SOLO, SOLO_BOB])
    expect(filterMatches(MATCHES, { format: '2v2', playerId: null })).toEqual([DUO])
  })

  it('filters by player, on either team', () => {
    expect(filterMatches(MATCHES, { format: null, playerId: 'alice' })).toEqual([DUO, SOLO])
    expect(filterMatches(MATCHES, { format: null, playerId: 'dan' })).toEqual([DUO, SOLO_BOB])
  })

  it('combines format and player (AND)', () => {
    expect(filterMatches(MATCHES, { format: '1v1', playerId: 'alice' })).toEqual([SOLO])
    expect(filterMatches(MATCHES, { format: '2v2', playerId: 'eve' })).toEqual([])
  })
})

describe('playerOptions', () => {
  it('lists only players with a match, guests included, in French alphabetical order', () => {
    const players = [
      player('zoe', 'Zoé'),
      player('eve', 'Ève', true),
      player('alice', 'alice'),
      player('bob', 'Bob'),
      player('nomatch', 'Aaron'),
      player('dan', 'Dan'),
      player('chloe', 'Chloé'),
    ]
    const options = playerOptions(players, [...MATCHES, match('m4', ['zoe'], ['eve'])])
    expect(options.map((option) => option.name)).toEqual(['alice', 'Bob', 'Chloé', 'Dan', 'Ève', 'Zoé'])
    expect(options[0]).toEqual({ id: 'alice', name: 'alice' })
  })

  it('ignores ids of matches whose player is gone, and is empty without matches', () => {
    expect(playerOptions([player('alice', 'Alice')], [SOLO]).map((option) => option.id)).toEqual(['alice'])
    expect(playerOptions([player('alice', 'Alice')], [])).toEqual([])
  })

  it('keeps homonyms apart, ordered by id', () => {
    const options = playerOptions([player('b', 'Max'), player('a', 'Max')], [match('m', ['a'], ['b'])])
    expect(options.map((option) => option.id)).toEqual(['a', 'b'])
  })
})

describe('resolveFilters', () => {
  const options = [{ id: 'alice', name: 'Alice' }]

  it('keeps a player that is still an option', () => {
    const filters = { format: '1v1' as const, playerId: 'alice' }
    expect(resolveFilters(filters, options)).toBe(filters)
  })

  it('falls back to every player for a deleted player id, keeping the format', () => {
    expect(resolveFilters({ format: '2v2', playerId: 'gone' }, options)).toEqual({ format: '2v2', playerId: null })
  })

  it('leaves « Tous les joueurs » alone', () => {
    expect(resolveFilters(NO_FILTERS, [])).toBe(NO_FILTERS)
  })
})

describe('filter updates', () => {
  it('isFiltered is true as soon as one filter is set', () => {
    expect(isFiltered(NO_FILTERS)).toBe(false)
    expect(isFiltered({ format: '1v1', playerId: null })).toBe(true)
    expect(isFiltered({ format: null, playerId: 'alice' })).toBe(true)
  })

  it('toggleFormat selects, switches, then clears on a second tap of the active chip', () => {
    const duo = toggleFormat(NO_FILTERS, '2v2')
    expect(duo).toEqual({ format: '2v2', playerId: null })
    expect(toggleFormat(duo, '1v1')).toEqual({ format: '1v1', playerId: null })
    expect(toggleFormat(duo, '2v2')).toEqual(NO_FILTERS)
    expect(toggleFormat({ format: null, playerId: 'alice' }, '1v1')).toEqual({ format: '1v1', playerId: 'alice' })
  })

  it('withPlayer maps the select value, the empty value being « Tous les joueurs »', () => {
    const filters = withPlayer({ format: '1v1', playerId: null }, 'bob')
    expect(filters).toEqual({ format: '1v1', playerId: 'bob' })
    expect(withPlayer(filters, '')).toEqual({ format: '1v1', playerId: null })
    expect(playerValue(filters)).toBe('bob')
    expect(playerValue(NO_FILTERS)).toBe('')
  })
})

describe('countLine', () => {
  it('reads the total when nothing is filtered, « n sur N » otherwise', () => {
    expect(countLine(12, 12, false)).toBe('12 matchs au total')
    expect(countLine(1, 1, false)).toBe('1 match au total')
    expect(countLine(3, 12, true)).toBe('3 matchs sur 12')
    expect(countLine(1, 12, true)).toBe('1 match sur 12')
  })
})

describe('saved filters', () => {
  it('start empty and keep the last saved value in memory', () => {
    expect(savedHistoryFilters()).toEqual(NO_FILTERS)
    saveHistoryFilters({ format: '1v1', playerId: 'alice' })
    expect(savedHistoryFilters()).toEqual({ format: '1v1', playerId: 'alice' })
    saveHistoryFilters(NO_FILTERS)
  })
})
