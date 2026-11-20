import { fmtDayHeader, fmtPercent, plural } from '../format'
import type { Player, PlayerId, Rule, RuleVote, RuleVoteValue } from '../types'

// Règlement (mode partagé, onglet de la cloche): rules proposed by a player and voted « d'accord » / « pas d'accord » by
// everyone for a week (votes changeable until then); at the end the majority decides: adopted, or rejected. Pure:
// tallies, status, sections, the bell badge and the French copy. React side in useRules.ts, screen in
// screens/Reglement.tsx. The server refuses a vote after the week too (docs/supabase/rules.sql, rule_open).

/** How long a rule stays open to votes, from its proposal. */
export const RULE_VOTE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
export const RULE_TEXT_MIN = 3
export const RULE_TEXT_MAX = 280

/** voting: the week is not over; then adopted when « d'accord » outnumbers « pas d'accord », rejected otherwise. */
export type RuleStatus = 'adopted' | 'voting' | 'rejected'

export type RuleTally = { yes: number; no: number; total: number; status: RuleStatus }

export type RuleLine = {
  rule: Rule
  tally: RuleTally
  /** The week is not over: votes (and the author's withdrawal) still possible. */
  open: boolean
  /** End of the vote (ISO), RULE_VOTE_DAYS after the proposal. */
  deadline: string
  /** This phone's player vote; null when he has not voted (or for a visitor). */
  mine: RuleVoteValue | null
  /** Who voted what: votes are public, shown under the shares. */
  voters: Voters
  /** « Article 3 » in the adopted rules (oldest first), null elsewhere. */
  article: number | null
}

export type Voters = { yes: PlayerId[]; no: PlayerId[] }

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
  withdrawBody: 'Elle disparaît avec tous ses votes.',
  adopted: 'Le règlement',
  voting: 'En vote',
  rejected: 'Rejetées',
  empty: 'Pas encore de règle. Propose la première, les autres voteront.',
  local: 'Le règlement se vote à plusieurs : il faut le mode partagé.',
  loading: 'Chargement du règlement…',
  error: 'Impossible de charger le règlement, réessaie dans un instant.',
  proposed: 'Règle proposée',
  withdrawn: 'Règle retirée',
  closed: 'Le vote est clos pour cette règle',
  hint:
    `Chacun a une semaine pour voter d’accord ou pas d’accord, et peut changer d’avis jusque-là. À la fin, la ` +
    `majorité l’emporte : plus de d’accord que de pas d’accord, la règle est adoptée, sinon elle est rejetée.`,
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

/** End of the vote: RULE_VOTE_DAYS after the proposal (ms). */
export function deadlineOf(rule: Pick<Rule, 'createdAt'>): number {
  return Date.parse(rule.createdAt) + RULE_VOTE_DAYS * DAY_MS
}

export function isOpen(rule: Pick<Rule, 'createdAt'>, now: Date): boolean {
  return now.getTime() < deadlineOf(rule)
}

/** While open: « En vote »; then the majority decides, a tie (or no vote) rejecting the rule. */
export function statusOf(yes: number, no: number, open: boolean): RuleStatus {
  if (open) return 'voting'
  if (yes > no) return 'adopted'
  return 'rejected'
}

export function tallyOf(rule: Rule, votes: RuleVote[], now: Date): RuleTally {
  let yes = 0
  let no = 0
  for (const vote of votes) {
    if (vote.ruleId !== rule.id) continue
    if (vote.vote === 'yes') yes += 1
    else no += 1
  }
  return { yes, no, total: yes + no, status: statusOf(yes, no, isOpen(rule, now)) }
}

function mineOf(ruleId: string, votes: RuleVote[], playerId: PlayerId | undefined): RuleVoteValue | null {
  if (playerId === undefined) return null
  return votes.find((vote) => vote.ruleId === ruleId && vote.playerId === playerId)?.vote ?? null
}

export function votersOf(ruleId: string, votes: RuleVote[]): Voters {
  const voters: Voters = { yes: [], no: [] }
  for (const vote of votes) {
    if (vote.ruleId === ruleId) voters[vote.vote].push(vote.playerId)
  }
  return voters
}

/** Open rules this player has not voted on yet: the bell badge (0 for a visitor). */
export function pendingVotes(rules: Rule[], votes: RuleVote[], playerId: PlayerId | undefined, now: Date): number {
  if (playerId === undefined) return 0
  return rules.filter((rule) => isOpen(rule, now) && mineOf(rule.id, votes, playerId) === null).length
}

function byCreation(a: Rule, b: Rule): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)
}

/** Adopted rules oldest first (their article numbers), the open ones closing soonest first, the rejected newest first. */
export function ruleSections(
  rules: Rule[],
  votes: RuleVote[],
  playerId: PlayerId | undefined,
  now: Date,
): RuleSections {
  const sections: RuleSections = { adopted: [], voting: [], rejected: [] }
  for (const rule of [...rules].sort(byCreation)) {
    const tally = tallyOf(rule, votes, now)
    sections[tally.status].push({
      rule,
      tally,
      open: tally.status === 'voting',
      deadline: new Date(deadlineOf(rule)).toISOString(),
      mine: mineOf(rule.id, votes, playerId),
      voters: votersOf(rule.id, votes),
      article: null,
    })
  }
  sections.adopted = sections.adopted.map((line, index) => ({ ...line, article: index + 1 }))
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

function startOfDay(time: number): number {
  const date = new Date(time)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Calendar days from `now` to the deadline: 0 = the vote ends today, 1 = tomorrow. */
function daysLeft(deadline: number, now: Date): number {
  return Math.round((startOfDay(deadline) - startOfDay(now.getTime())) / DAY_MS)
}

const weekdayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * « 3 votes · vote ouvert jusqu'au jeudi 26 novembre » (« jusqu'à demain », « dernier jour de vote »), then
 * « 6 votes · vote clos le jeudi 26 novembre ». Days only, never a time.
 */
export function votesText(line: Pick<RuleLine, 'tally' | 'open' | 'deadline'>, now: Date): string {
  const count = plural(line.tally.total, 'vote')
  const deadline = Date.parse(line.deadline)
  const day = weekdayFormat.format(new Date(deadline))
  if (!line.open) return `${count} · vote clos le ${day}`
  const left = daysLeft(deadline, now)
  if (left <= 0) return `${count} · dernier jour de vote`
  if (left === 1) return `${count} · vote ouvert jusqu’à demain`
  return `${count} · vote ouvert jusqu’au ${day}`
}

/** « Alice, Bob, Chloé »: the voters of one side, alphabetical; a deleted player reads « ancien joueur ». */
export function votersText(ids: PlayerId[], players: ReadonlyMap<PlayerId, Player>): string {
  return ids
    .map((id) => players.get(id)?.name ?? 'ancien joueur')
    .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
    .join(', ')
}

/** « Ton vote : d'accord » under a closed rule; null when he did not vote. */
export function myVoteText(mine: RuleVoteValue | null): string | null {
  if (mine === 'yes') return 'Ton vote : d’accord'
  if (mine === 'no') return 'Ton vote : pas d’accord'
  return null
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
