import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import App from '../App'
import { RulesContext } from '../rules/useRules'
import type { RulesState } from '../rules/useRules'
import { AppStateProvider } from '../store'
import type { Player, Store } from '../types'
import { Reglement } from './Reglement'

// Règlement screen (server render, no DOM): sections, cards, vote buttons and the author's « Retirer ». The data
// comes through RulesContext; the decisions are unit-tested in src/rules/rules.test.ts.

const PLAYERS: Player[] = ['alice', 'bob', 'chloe', 'dan'].map((id) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  isGuest: false,
  createdAt: '2026-11-01T10:00:00.000Z',
}))

function storeOf(): Store {
  return {
    version: 1,
    players: PLAYERS,
    matches: [],
    settings: { lastFormat: '2v2', lastTarget: 5, myPlayerId: 'alice', profileConfirmed: true },
    nextSeq: 1,
    calls: [],
    callPlayers: [],
  }
}

function stub(hash: string): void {
  vi.stubGlobal('window', { location: { hash }, history: { back: vi.fn(), length: 1 } })
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(storeOf()), setItem: () => undefined })
}

const at = '2026-11-02T10:00:00.000Z'
const yes = (ruleId: string, playerId: string) => ({ ruleId, playerId, vote: 'yes' as const, votedAt: at })
const no = (ruleId: string, playerId: string) => ({ ruleId, playerId, vote: 'no' as const, votedAt: at })

const STATE: RulesState = {
  load: 'done',
  rules: [
    { id: 'r1', text: 'La pissette ne compte pas', createdBy: 'bob', createdAt: at },
    { id: 'r2', text: 'Gamelle = un but de moins', createdBy: 'alice', createdAt: '2026-11-18T10:00:00.000Z' },
  ],
  votes: [yes('r1', 'bob'), yes('r1', 'alice'), yes('r1', 'chloe'), no('r1', 'dan'), yes('r2', 'alice')],
  // r1 (2 November) closed on the 9th, r2 (18 November) is open until the 25th.
  now: new Date('2026-11-19T12:00:00.000Z'),
  playerId: 'alice',
  busy: false,
  refresh: async () => undefined,
  propose: async () => true,
  vote: () => undefined,
  withdraw: () => undefined,
}

function renderScreen(state: RulesState): string {
  stub('#/reglement')
  const screen = createElement(RulesContext.Provider, { value: state }, createElement(Reglement))
  return renderToString(createElement(AppStateProvider, null, screen)).replace(/<!-- -->/g, '')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Règlement screen', () => {
  it('lists the adopted rule as an article and the one still in vote; buttons and « Retirer » only during the week', () => {
    const html = renderScreen(STATE)
    expect(html).toContain('+ Proposer une règle')
    const adopted = html.indexOf('Le règlement')
    const voting = html.indexOf('En vote')
    expect(adopted).toBeGreaterThan(-1)
    expect(voting).toBeGreaterThan(adopted)
    expect(html).toContain('<p class="rule__article">Article 1</p>')
    expect(html).toContain('La pissette ne compte pas')
    expect(html).toContain('75 % d’accord · 25 % pas d’accord')
    expect(html).toContain('4 votes · vote clos le lundi 9 novembre')
    expect(html).toContain('1 vote · vote ouvert jusqu’au mercredi 25 novembre')
    // The closed rule only recalls Alice's vote; the open one (hers) has the buttons, her vote pressed, and « Retirer ».
    expect(html).toContain('<p class="rule__mine">Ton vote : d’accord</p>')
    expect(html.match(/class="rule__actions"/g)).toHaveLength(1)
    expect(html.match(/class="rule-vote rule-vote--yes is-pressed" aria-pressed="true"/g)).toHaveLength(1)
    expect(html.match(/class="rule__withdraw"/g)).toHaveLength(1)
    expect(html).not.toContain('Rejetées')
  })

  it('invites the first proposal when there is none, and says so in local mode', () => {
    expect(renderScreen({ ...STATE, rules: [], votes: [] })).toContain('Pas encore de règle')
    stub('#/reglement')
    const html = renderToString(createElement(App))
    expect(html).toContain('<h1 class="header-title">Règlement</h1>')
    expect(html).toContain('Le règlement se vote à plusieurs')
  })
})
