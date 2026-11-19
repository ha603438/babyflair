import { describe, expect, it } from 'vitest'
import type { Player, Rule, RuleVote } from '../types'
import {
  bylineText,
  cleanRuleText,
  newRule,
  pendingVotes,
  proposedToast,
  RULE_MIN_VOTES,
  ruleSections,
  ruleTextError,
  segmentLabel,
  sharesText,
  statusOf,
  tallyOf,
  votesText,
  withVote,
} from './rules'

// Règlement (src/rules/rules.ts): text checks, tallies and status, the three sections, the bell badge and the copy.

const NNBSP = ' '

function rule(id: string, createdAt: string, createdBy = 'alice'): Rule {
  return { id, text: `Règle ${id}`, createdBy, createdAt }
}

function vote(ruleId: string, playerId: string, value: 'yes' | 'no'): RuleVote {
  return { ruleId, playerId, vote: value, votedAt: '2026-11-19T10:00:00.000Z' }
}

describe('text', () => {
  it('folds spaces and line breaks, and needs 3 to 280 characters', () => {
    expect(cleanRuleText('  La pissette\n\n  ne compte   pas ')).toBe('La pissette ne compte pas')
    expect(ruleTextError(' a ')).toBe('Au moins 3 caractères')
    expect(ruleTextError('x'.repeat(281))).toBe('280 caractères au maximum')
    expect(ruleTextError('Gamelle = -1')).toBeNull()
    expect(newRule('r1', '  Pas de   pissette ', 'alice', new Date('2026-11-19T10:00:00.000Z'))).toEqual({
      id: 'r1',
      text: 'Pas de pissette',
      createdBy: 'alice',
      createdAt: '2026-11-19T10:00:00.000Z',
    })
  })
})

describe('tally and status', () => {
  it('stays « en vote » under 4 votes, then adopted on a majority of « d’accord », rejected otherwise', () => {
    expect(RULE_MIN_VOTES).toBe(4)
    expect(statusOf(3, 0)).toBe('voting')
    expect(statusOf(3, 1)).toBe('adopted')
    expect(statusOf(2, 2)).toBe('rejected')
    expect(statusOf(1, 3)).toBe('rejected')
    const votes = [vote('r1', 'a', 'yes'), vote('r1', 'b', 'no'), vote('r2', 'a', 'no')]
    expect(tallyOf('r1', votes)).toEqual({ yes: 1, no: 1, total: 2, status: 'voting' })
  })

  it('a new vote replaces the player’s previous one on the same rule', () => {
    const votes = withVote([vote('r1', 'a', 'yes'), vote('r2', 'a', 'yes')], vote('r1', 'a', 'no'))
    expect(tallyOf('r1', votes)).toMatchObject({ yes: 0, no: 1 })
    expect(tallyOf('r2', votes)).toMatchObject({ yes: 1, no: 0 })
  })
})

describe('sections and badge', () => {
  const rules = [
    rule('old', '2026-11-01T10:00:00.000Z'),
    rule('mid', '2026-11-05T10:00:00.000Z'),
    rule('new', '2026-11-10T10:00:00.000Z', 'bob'),
    rule('newer', '2026-11-12T10:00:00.000Z'),
  ]
  const adopt = (id: string) => ['a', 'b', 'c', 'd'].map((p, i) => vote(id, p, i < 3 ? 'yes' : 'no'))
  const votes = [...adopt('old'), ...adopt('newer'), vote('new', 'bob', 'yes'), ...['a', 'b', 'c', 'd'].map((p) => vote('mid', p, 'no'))]

  it('numbers the adopted rules oldest first, lists the others newest first, with this player’s vote', () => {
    const sections = ruleSections(rules, votes, 'a')
    expect(sections.adopted.map((line) => [line.rule.id, line.article])).toEqual([
      ['old', 1],
      ['newer', 2],
    ])
    expect(sections.voting.map((line) => line.rule.id)).toEqual(['new'])
    expect(sections.rejected.map((line) => line.rule.id)).toEqual(['mid'])
    expect(sections.adopted[0].mine).toBe('yes')
    expect(sections.voting[0].mine).toBeNull()
    expect(ruleSections(rules, votes, undefined).adopted[0].mine).toBeNull()
  })

  it('counts the rules waiting for this player’s vote (none for a visitor)', () => {
    expect(pendingVotes(rules, votes, 'a')).toBe(1)
    expect(pendingVotes(rules, votes, 'zoe')).toBe(4)
    expect(pendingVotes(rules, votes, undefined)).toBe(0)
    expect(segmentLabel(0)).toBe('Règlement')
    expect(segmentLabel(2)).toBe('Règlement (2)')
  })
})

describe('copy', () => {
  it('byline with a day only, shares, votes and the toast', () => {
    const players = new Map<string, Player>([['alice', { id: 'alice', name: 'Alice', isGuest: false, createdAt: 'x' }]])
    const now = new Date(2026, 10, 19, 18, 0)
    const today = rule('r', new Date(2026, 10, 19, 9, 30).toISOString())
    expect(bylineText(today, players, now)).toBe('Proposée par Alice, aujourd’hui'.replace('’', "'"))
    expect(bylineText({ ...today, createdBy: 'gone' }, players, now)).toMatch(/^Proposée par un ancien joueur, /u)
    const tally = { yes: 3, no: 1, total: 4, status: 'adopted' as const }
    expect(sharesText(tally)).toBe(`75${NNBSP}% d’accord · 25${NNBSP}% pas d’accord`)
    expect(sharesText({ yes: 0, no: 0, total: 0, status: 'voting' })).toBeNull()
    expect(votesText(tally)).toBe('4 votes')
    expect(votesText({ yes: 1, no: 0, total: 1, status: 'voting' })).toBe('1 vote · encore 3 avant décision')
    expect(proposedToast(9)).toBe('Règle proposée · 9 téléphones prévenus')
    expect(proposedToast(null)).toBe('Règle proposée')
  })
})
