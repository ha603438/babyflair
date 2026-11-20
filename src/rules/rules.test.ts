import { describe, expect, it } from 'vitest'
import type { Player, Rule, RuleVote } from '../types'
import {
  bylineText,
  cleanRuleText,
  newRule,
  pendingVotes,
  proposedToast,
  RULE_VOTE_DAYS,
  isOpen,
  myVoteText,
  ruleSections,
  ruleTextError,
  segmentLabel,
  sharesText,
  statusOf,
  tallyOf,
  votersOf,
  votersText,
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
  const now = new Date('2026-11-19T12:00:00.000Z')

  it('stays « en vote » for a week, then the majority decides, a tie rejecting the rule', () => {
    expect(RULE_VOTE_DAYS).toBe(7)
    expect(isOpen({ createdAt: '2026-11-12T12:00:01.000Z' }, now)).toBe(true)
    expect(isOpen({ createdAt: '2026-11-12T12:00:00.000Z' }, now)).toBe(false)
    expect(statusOf(3, 0, true)).toBe('voting')
    expect(statusOf(1, 0, false)).toBe('adopted')
    expect(statusOf(3, 2, false)).toBe('adopted')
    expect(statusOf(2, 2, false)).toBe('rejected')
    expect(statusOf(1, 3, false)).toBe('rejected')
    expect(statusOf(0, 0, false)).toBe('rejected')
    const votes = [vote('r1', 'a', 'yes'), vote('r1', 'b', 'no'), vote('r2', 'a', 'no')]
    expect(tallyOf(rule('r1', '2026-11-18T10:00:00.000Z'), votes, now)).toEqual({
      yes: 1,
      no: 1,
      total: 2,
      status: 'voting',
    })
    expect(tallyOf(rule('r1', '2026-11-01T10:00:00.000Z'), votes, now).status).toBe('rejected')
  })

  it('a new vote replaces the player’s previous one on the same rule', () => {
    const votes = withVote([vote('r1', 'a', 'yes'), vote('r2', 'a', 'yes')], vote('r1', 'a', 'no'))
    expect(tallyOf(rule('r1', '2026-11-18T10:00:00.000Z'), votes, now)).toMatchObject({ yes: 0, no: 1 })
    expect(tallyOf(rule('r2', '2026-11-18T10:00:00.000Z'), votes, now)).toMatchObject({ yes: 1, no: 0 })
  })
})

describe('sections and badge', () => {
  const now = new Date('2026-11-19T12:00:00.000Z')
  const rules = [
    rule('old', '2026-11-01T10:00:00.000Z'),
    rule('mid', '2026-11-05T10:00:00.000Z'),
    rule('newer', '2026-11-11T10:00:00.000Z'),
    rule('open', '2026-11-14T10:00:00.000Z', 'bob'),
    rule('fresh', '2026-11-18T10:00:00.000Z', 'bob'),
  ]
  const votes = [
    vote('old', 'a', 'yes'),
    vote('old', 'b', 'yes'),
    vote('old', 'c', 'no'),
    vote('newer', 'b', 'yes'),
    vote('mid', 'a', 'no'),
    vote('mid', 'b', 'yes'),
    vote('open', 'bob', 'yes'),
    vote('open', 'a', 'no'),
    vote('fresh', 'bob', 'yes'),
  ]

  it('numbers the adopted rules oldest first, lists the open ones closing soonest first, then the rejected', () => {
    const sections = ruleSections(rules, votes, 'a', now)
    expect(sections.adopted.map((line) => [line.rule.id, line.article])).toEqual([
      ['old', 1],
      ['newer', 2],
    ])
    expect(sections.voting.map((line) => line.rule.id)).toEqual(['open', 'fresh'])
    expect(sections.rejected.map((line) => line.rule.id)).toEqual(['mid'])
    expect(sections.voting.every((line) => line.open)).toBe(true)
    expect(sections.adopted[0]).toMatchObject({ open: false, mine: 'yes', deadline: '2026-11-08T10:00:00.000Z' })
    expect(sections.voting[0].mine).toBe('no')
    expect(sections.voting[1].mine).toBeNull()
    expect(ruleSections(rules, votes, undefined, now).adopted[0].mine).toBeNull()
    expect(sections.adopted[0].voters).toEqual({ yes: ['a', 'b'], no: ['c'] })
  })

  it('lists who voted what, names in alphabetical order', () => {
    expect(votersOf('open', votes)).toEqual({ yes: ['bob'], no: ['a'] })
    expect(votersOf('nothing', votes)).toEqual({ yes: [], no: [] })
    const names = new Map<string, Player>(
      [['z', 'Zoé'], ['e', 'Émile'], ['b', 'bob']].map(([id, name]) => [id, { id, name, isGuest: false, createdAt: 'x' }]),
    )
    expect(votersText(['z', 'e', 'b', 'gone'], names)).toBe('ancien joueur, bob, Émile, Zoé')
  })

  it('counts the open rules waiting for this player’s vote (none for a visitor)', () => {
    expect(pendingVotes(rules, votes, 'a', now)).toBe(1)
    expect(pendingVotes(rules, votes, 'zoe', now)).toBe(2)
    expect(pendingVotes(rules, votes, undefined, now)).toBe(0)
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
    const tally = { yes: 3, no: 1, total: 4, status: 'voting' as const }
    expect(sharesText(tally)).toBe(`75${NNBSP}% d’accord · 25${NNBSP}% pas d’accord`)
    expect(sharesText({ yes: 0, no: 0, total: 0, status: 'voting' })).toBeNull()
    const line = (deadline: Date, open = true) => ({ tally, open, deadline: deadline.toISOString() })
    expect(votesText(line(new Date(2026, 10, 26, 9, 0)), now)).toBe('4 votes · vote ouvert jusqu’au jeudi 26 novembre')
    expect(votesText(line(new Date(2026, 10, 20, 9, 0)), now)).toBe('4 votes · vote ouvert jusqu’à demain')
    expect(votesText(line(new Date(2026, 10, 19, 20, 0)), now)).toBe('4 votes · dernier jour de vote')
    expect(votesText(line(new Date(2026, 10, 12, 9, 0), false), now)).toBe('4 votes · vote clos le jeudi 12 novembre')
    expect(myVoteText('yes')).toBe('Ton vote : d’accord')
    expect(myVoteText(null)).toBeNull()
    expect(proposedToast(9)).toBe('Règle proposée · 9 téléphones prévenus')
    expect(proposedToast(null)).toBe('Règle proposée')
  })
})
