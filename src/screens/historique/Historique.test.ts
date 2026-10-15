import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { AppStateProvider } from '../../store'
import type { Match, Player, Store } from '../../types'
import { Historique } from '../Historique'
import { NO_FILTERS } from './filters'
import type { HistoryFilters } from './filters'
import { saveHistoryFilters } from './useHistoryFilters'

// Server-rendered markup only (vitest runs in node, no DOM), like src/screens/match/screens.test.ts: the filters are
// seeded through the module-level state the screen reads at mount, the same path as coming back from a match detail.

const PLAYERS: Player[] = [
  { id: 'zoe', name: 'Zoé', isGuest: false, createdAt: '2025-09-01T10:00:00.000Z' },
  { id: 'alice', name: 'Alice', isGuest: false, createdAt: '2025-09-01T10:00:00.000Z' },
  { id: 'bob', name: 'Bob', isGuest: false, createdAt: '2025-09-02T10:00:00.000Z' },
  { id: 'chloe', name: 'Chloé', isGuest: true, createdAt: '2025-09-03T10:00:00.000Z' },
  { id: 'dan', name: 'Dan', isGuest: false, createdAt: '2025-09-04T10:00:00.000Z' },
  { id: 'idle', name: 'Aaron', isGuest: false, createdAt: '2025-09-05T10:00:00.000Z' },
]

function match(id: string, seq: number, playedAt: string, teamA: string[], teamB: string[]): Match {
  return { id, seq, playedAt, createdAt: playedAt, updatedAt: playedAt, target: 10, teamA, teamB, scoreA: 10, scoreB: 6 }
}

const MATCHES: Match[] = [
  match('m1', 1, '2025-10-01T12:00:00.000Z', ['alice', 'bob'], ['chloe', 'dan']),
  match('m2', 2, '2025-10-02T12:00:00.000Z', ['alice'], ['zoe']),
  match('m3', 3, '2025-10-03T12:00:00.000Z', ['bob'], ['dan']),
]

function storeOf(matches: Match[]): Store {
  return {
    version: 1,
    players: PLAYERS,
    matches,
    settings: { lastFormat: '2v2', lastTarget: 10 },
    nextSeq: matches.length + 1,
    calls: [],
    callPlayers: [],
  }
}

function render(filters: HistoryFilters, matches: Match[] = MATCHES): string {
  saveHistoryFilters(filters)
  vi.stubGlobal('window', { location: { hash: '#/historique' }, history: { back: vi.fn() } })
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(storeOf(matches)), setItem: () => undefined })
  return renderToString(createElement(AppStateProvider, null, createElement(Historique)))
}

function plain(html: string): string {
  return html.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'")
}

function matchLinks(html: string): string[] {
  return [...html.matchAll(/href="#\/historique\/(m\d)"/g)].map((found) => found[1])
}

afterEach(() => {
  saveHistoryFilters(NO_FILTERS)
  vi.unstubAllGlobals()
})

describe('Historique filters', () => {
  it('no filter: both chips released, « Tous les joueurs », every match, no « Effacer »', () => {
    const html = render(NO_FILTERS)
    expect(html).toContain('role="group" aria-label="Filtres"')
    expect(html).toContain('aria-pressed="false">2V2</button>')
    expect(html).toContain('aria-pressed="false">1V1</button>')
    expect(html).toContain('<option value="" selected="">Tous les joueurs</option>')
    expect(html).toContain('<span class="sr-only">Filtrer par joueur</span>')
    expect(html).not.toContain('class="hf-clear"')
    expect(matchLinks(html)).toEqual(['m3', 'm2', 'm1'])
    expect(plain(html)).toContain('3 matchs au total')
  })

  it('lists only players with a match, in French alphabetical order (guests included)', () => {
    const html = render(NO_FILTERS)
    const names = [...html.matchAll(/<option value="([a-z]+)"[^>]*>/g)].map((found) => found[1])
    expect(names).toEqual(['alice', 'bob', 'chloe', 'dan', 'zoe'])
    expect(html).not.toContain('value="idle"')
  })

  it('1V1 + Alice: chip pressed, Alice selected, only her 1v1 left, « Effacer » shown, count recomputed', () => {
    const html = render({ format: '1v1', playerId: 'alice' })
    expect(html).toContain('aria-pressed="true">1V1</button>')
    expect(html).toContain('aria-pressed="false">2V2</button>')
    expect(html).toContain('<option value="alice" selected="">Alice</option>')
    expect(html).toContain('class="hf-select is-on"')
    expect(html).toContain('aria-label="Effacer les filtres">Effacer</button>')
    expect(matchLinks(html)).toEqual(['m2'])
    expect(html.match(/class="hist-day"/g)).toHaveLength(1)
    expect(plain(html)).toContain('1 match sur 3')
    expect(html).not.toContain('Aucun match pour ces filtres')
  })

  it('a player alone keeps every match he played, day headers follow the filtered list', () => {
    const html = render({ format: null, playerId: 'bob' })
    expect(matchLinks(html)).toEqual(['m3', 'm1'])
    expect(html.match(/class="hist-day"/g)).toHaveLength(2)
    expect(plain(html)).toContain('2 matchs sur 3')
  })

  it('empty result: message and « Effacer les filtres », no day header, no count', () => {
    const html = render({ format: '2v2', playerId: 'zoe' })
    expect(html).toContain('aria-pressed="true">2V2</button>')
    expect(html).toContain('<option value="zoe" selected="">Zoé</option>')
    expect(html).toContain('<p class="hf-empty__text">Aucun match pour ces filtres</p>')
    expect(html).toContain('>Effacer les filtres</button>')
    expect(html).not.toContain('class="hist-day"')
    expect(html).not.toContain('class="hist-footer"')
  })

  it('a deleted player id falls back to « Tous les joueurs »', () => {
    const html = render({ format: null, playerId: 'gone' })
    expect(html).toContain('<option value="" selected="">Tous les joueurs</option>')
    expect(html).not.toContain('class="hf-clear"')
    expect(matchLinks(html)).toEqual(['m3', 'm2', 'm1'])
  })

  it('no match at all: the first-match empty state, without the filter bar', () => {
    const html = render({ format: '1v1', playerId: null }, [])
    expect(plain(html)).toContain("Aucun match pour l'instant.")
    expect(html).not.toContain('class="content hf-bar"')
  })
})
