import { fmtDayHeader, fmtPercent, plural } from '../format'
import type { Player, PlayerId, Rule, RuleVote, RuleVoteValue } from '../types'

// Règlement (mode partagé, onglet de la cloche): rules proposed by a player and voted « d'accord » / « pas d'accord » by
// everyone, each vote changeable at any time, so the rules follow what the office thinks today. Pure: tallies, status,
// sections, the bell badge and the French copy. React side in useRules.ts, screen in screens/Reglement.tsx.

/** Votes needed before a rule is adopted or rejected; until then it is « En vote ». */
export const RULE_MIN_VOTES = 4
export const RULE_TEXT_MIN = 3
export const RULE_TEXT_MAX = 280

/** adopted: more than half « d'accord » with RULE_MIN_VOTES votes or more; rejected: half or more « pas d'accord ». */
export type RuleStatus = 'adopted' | 'voting' | 'rejected'

export type RuleTally = { yes: number; no: number; total: number; status: RuleStatus }

export type RuleLine = {
  rule: Rule
  tally: RuleTally
  /** This phone's player vote; null when he has not voted (or for a visitor). */
  mine: RuleVoteValue | null
  /** « Article 3 » in the adopted rules (oldest first), null elsewhere. */
  article: number | null
}

export type RuleSections = { adopted: RuleLine[]; voting: RuleLine[]; rejected: RuleLine[] }

export const RULES_COPY = {
  title: 'Règlement',
  segment: 'Règlement',
  propose: '+ Proposer une règle',
  formLabel: 'Ta règle',
  placeholder: 'Ex. : la pissette ne compte pas',
  submit: 'Proposer',
  cancel: 'Annuler',
  yes: 'D’accord',
  no: 'Pas d’accord',
  withdraw: 'Retirer',
  withdrawTitle: 'Retirer cette règle ?',
  withdrawBody: 'Elle disparaît du règlement avec tous ses votes.',
  adopted: 'Le règlement',
  voting: 'En vote',
  rejected: 'Rejetées',
  empty: 'Pas encore de règle. Propose la première, les autres voteront.',
  local: 'Le règlement se vote à plusieurs : il faut le mode partagé.',
  loading: 'Chargement du règlement…',
  error: 'Impossible de charger le règlement, réessaie dans un instant.',
  proposed: 'Règle proposée',
  withdrawn: 'Règle retirée',
  hint:
    `Chacun vote d’accord ou pas d’accord, et peut changer d’avis à tout moment. Une règle est adoptée dès ` +
    `${RULE_MIN_VOTES} votes si plus de la moitié est d’accord.`,
} as const

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Trimmed, every run of spaces or line breaks folded into one space. */
export function cleanRuleText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

/** Why the text cannot be proposed yet; null when it can. */
export function ruleTextError(raw: string): string | null {
  const length = Array.from(cleanRuleText(raw)).length
  if (length < RULE_TEXT_MIN) return `Au moins ${RULE_TEXT_MIN} caractères`
  if (length > RULE_TEXT_MAX) return `${RULE_TEXT_MAX} caractères au maximum`
  return null
}

export function newRule(id: string, text: string, createdBy: PlayerId, now: Date): Rule {
  return { id, text: cleanRuleText(text), createdBy, createdAt: now.toISOString() }
}

export function newVote(ruleId: string, playerId: PlayerId, vote: RuleVoteValue, now: Date): RuleVote {
  return { ruleId, playerId, vote, votedAt: now.toISOString() }
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

/** `votes` with `vote` in place of the player's previous one on that rule (or added). */
export function withVote(votes: RuleVote[], vote: RuleVote): RuleVote[] {
  const others = votes.filter((v) => !(v.ruleId === vote.ruleId && v.playerId === vote.playerId))
  return [...others, vote]
}

export function statusOf(yes: number, no: number): RuleStatus {
  const total = yes + no
  if (total < RULE_MIN_VOTES) return 'voting'
  if (yes * 2 > total) return 'adopted'
  return 'rejected'
}

export function tallyOf(ruleId: string, votes: RuleVote[]): RuleTally {
  let yes = 0
  let no = 0
  for (const vote of votes) {
    if (vote.ruleId !== ruleId) continue
    if (vote.vote === 'yes') yes += 1
    else no += 1
  }
  return { yes, no, total: yes + no, status: statusOf(yes, no) }
}

function mineOf(ruleId: string, votes: RuleVote[], playerId: PlayerId | undefined): RuleVoteValue | null {
  if (playerId === undefined) return null
  return votes.find((vote) => vote.ruleId === ruleId && vote.playerId === playerId)?.vote ?? null
}

/** Rules this player has not voted on yet: the bell badge (0 for a visitor). */
export function pendingVotes(rules: Rule[], votes: RuleVote[], playerId: PlayerId | undefined): number {
  if (playerId === undefined) return 0
  return rules.filter((rule) => mineOf(rule.id, votes, playerId) === null).length
}

function byCreation(a: Rule, b: Rule): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)
}

/** Adopted rules oldest first (their article numbers), the others newest first. */
export function ruleSections(rules: Rule[], votes: RuleVote[], playerId: PlayerId | undefined): RuleSections {
  const sections: RuleSections = { adopted: [], voting: [], rejected: [] }
  for (const rule of [...rules].sort(byCreation)) {
    const tally = tallyOf(rule.id, votes)
    sections[tally.status].push({ rule, tally, mine: mineOf(rule.id, votes, playerId), article: null })
  }
  sections.adopted = sections.adopted.map((line, index) => ({ ...line, article: index + 1 }))
  sections.voting.reverse()
  sections.rejected.reverse()
  return sections
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** « Proposée par Arnault, aujourd'hui » / « …, lundi 3 novembre »: a day, never a time. */
export function bylineText(rule: Rule, players: ReadonlyMap<PlayerId, Player>, now: Date): string {
  const name = players.get(rule.createdBy)?.name ?? 'un ancien joueur'
  const day = fmtDayHeader(rule.createdAt, now)
  return `Proposée par ${name}, ${day.charAt(0).toLowerCase()}${day.slice(1)}`
}

/** « 75 % d'accord · 25 % pas d'accord »; null before the first vote. */
export function sharesText(tally: RuleTally): string | null {
  if (tally.total === 0) return null
  return `${fmtPercent(tally.yes / tally.total)} d’accord · ${fmtPercent(tally.no / tally.total)} pas d’accord`
}

/** « 3 votes · encore 1 avant décision » while voting, « 6 votes » after. */
export function votesText(tally: RuleTally): string {
  const count = plural(tally.total, 'vote')
  if (tally.status !== 'voting') return count
  return `${count} · encore ${RULE_MIN_VOTES - tally.total} avant décision`
}

/** The segment label, with the rules waiting for this phone's vote: « Règlement (2) ». */
export function segmentLabel(pending: number): string {
  if (pending === 0) return RULES_COPY.segment
  return `${RULES_COPY.segment} (${pending})`
}

/** « Règle proposée · 9 téléphones prévenus »; without the count when nobody could be notified. */
export function proposedToast(sent: number | null): string {
  if (sent === null || sent === 0) return RULES_COPY.proposed
  return `${RULES_COPY.proposed} · ${plural(sent, 'téléphone prévenu', 'téléphones prévenus')}`
}
