// Règlement (`#/reglement`, onglet de la cloche, mode partagé): the office rules. « + Proposer une règle » opens the
// form (the others get a notification), then three sections: the adopted rules (« Le règlement », numbered), the ones
// still « En vote » and the « Rejetées ». Every card shows its share of « d'accord » / « pas d'accord » and lets each
// player vote or change his mind; the author can withdraw his rule. Data and copy: src/rules/.
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SectionHeader } from '../components/SectionHeader'
import { useWriteGuard } from '../profile/useWriteGuard'
import type { Guard } from '../profile/useWriteGuard'
import {
  bylineText,
  RULE_TEXT_MAX,
  ruleSections,
  ruleTextError,
  RULES_COPY,
  sharesText,
  votesText,
} from '../rules/rules'
import type { RuleLine, RuleStatus } from '../rules/rules'
import { useRules } from '../rules/useRules'
import type { RulesState } from '../rules/useRules'
import { useAppState } from '../store'
import type { Player, PlayerId, RuleVoteValue } from '../types'
import { NotifTabs } from './NotifTabs'

type Players = ReadonlyMap<PlayerId, Player>

function Message({ text }: { text: string }) {
  return <p className="content lists-empty">{text}</p>
}

// ---------------------------------------------------------------------------
// Proposer une règle
// ---------------------------------------------------------------------------

type FormProps = { busy: boolean; onSubmit: (text: string) => void; onCancel: () => void }

function ProposeForm({ busy, onSubmit, onCancel }: FormProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const errorId = useId()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const problem = ruleTextError(text)
    if (problem !== null) {
      setError(problem)
      return
    }
    onSubmit(text)
  }

  return (
    <form className="inline-form rule-form" onSubmit={handleSubmit} noValidate>
      <textarea
        className="inline-form-input rule-form__input"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setError(null)
        }}
        placeholder={RULES_COPY.placeholder}
        aria-label={RULES_COPY.formLabel}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        maxLength={RULE_TEXT_MAX}
        rows={3}
        autoFocus
      />
      <p className="rule-form__count">{`${Array.from(text).length}/${RULE_TEXT_MAX}`}</p>
      {error && (
        <p id={errorId} className="inline-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="inline-form-actions">
        <Button variant="primary" size="md" type="submit" disabled={busy}>
          {RULES_COPY.submit}
        </Button>
        <Button variant="text" onClick={onCancel}>
          {RULES_COPY.cancel}
        </Button>
      </div>
    </form>
  )
}

function ProposeArea({ rules, guard }: { rules: RulesState; guard: Guard }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button type="button" className="add-row" onClick={() => guard('proposer une règle', () => setOpen(true))}>
        {RULES_COPY.propose}
      </button>
    )
  }
  const submit = (text: string) =>
    guard('proposer une règle', () => {
      void rules.propose(text).then((saved) => {
        if (saved) setOpen(false)
      })
    })
  return <ProposeForm busy={rules.busy} onSubmit={submit} onCancel={() => setOpen(false)} />
}

// ---------------------------------------------------------------------------
// Rule card
// ---------------------------------------------------------------------------

function Bar({ line }: { line: RuleLine }) {
  const { yes, no, total } = line.tally
  if (total === 0) return <div className="rule-bar" aria-hidden="true" />
  return (
    <div className="rule-bar" aria-hidden="true">
      <span className="rule-bar__yes" style={{ flexGrow: yes }} />
      <span className="rule-bar__no" style={{ flexGrow: no }} />
    </div>
  )
}

type VoteButtonProps = { value: RuleVoteValue; line: RuleLine; onVote: (value: RuleVoteValue) => void }

function VoteButton({ value, line, onVote }: VoteButtonProps) {
  const pressed = line.mine === value
  const classes = ['rule-vote', `rule-vote--${value}`]
  if (pressed) classes.push('is-pressed')
  return (
    <button type="button" className={classes.join(' ')} aria-pressed={pressed} onClick={() => onVote(value)}>
      <span aria-hidden="true">{value === 'yes' ? '👍' : '👎'}</span> {value === 'yes' ? RULES_COPY.yes : RULES_COPY.no}
    </button>
  )
}

const STATUS_CLASS: Record<RuleStatus, string> = {
  adopted: 'rule--adopted',
  voting: 'rule--voting',
  rejected: 'rule--rejected',
}

type CardProps = {
  line: RuleLine
  players: Players
  now: Date
  isAuthor: boolean
  onVote: (value: RuleVoteValue) => void
  onWithdraw: () => void
}

function RuleCard({ line, players, now, isAuthor, onVote, onWithdraw }: CardProps) {
  const shares = sharesText(line.tally)
  return (
    <article className={`card card-pad rule ${STATUS_CLASS[line.tally.status]}`}>
      {line.article !== null && <p className="rule__article">{`Article ${line.article}`}</p>}
      <p className="rule__text">{line.rule.text}</p>
      <p className="rule__byline">{bylineText(line.rule, players, now)}</p>
      <Bar line={line} />
      <p className="rule__shares">
        {shares !== null && <span>{shares}</span>}
        <span className="rule__votes">{votesText(line.tally)}</span>
      </p>
      <div className="rule__actions">
        <VoteButton value="yes" line={line} onVote={onVote} />
        <VoteButton value="no" line={line} onVote={onVote} />
      </div>
      {isAuthor && (
        <button type="button" className="rule__withdraw" onClick={onWithdraw}>
          {RULES_COPY.withdraw}
        </button>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type SectionProps = {
  title: string
  lines: RuleLine[]
  rules: RulesState
  players: Players
  now: Date
  guard: Guard
  onWithdraw: (ruleId: string) => void
}

function Section({ title, lines, rules, players, now, guard, onWithdraw }: SectionProps) {
  if (lines.length === 0) return null
  return (
    <section className="rules-section">
      <SectionHeader title={title} count={lines.length} />
      <div className="content rules-list">
        {lines.map((line) => (
          <RuleCard
            key={line.rule.id}
            line={line}
            players={players}
            now={now}
            isAuthor={line.rule.createdBy === rules.playerId}
            onVote={(value) => guard('voter', () => rules.vote(line.rule.id, value))}
            onWithdraw={() => onWithdraw(line.rule.id)}
          />
        ))}
      </div>
    </section>
  )
}

function RulesBody({ rules, guard }: { rules: RulesState; guard: Guard }) {
  const { store } = useAppState()
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  // Only days are shown (« aujourd'hui », « hier »): the time the screen opened is precise enough.
  const [now] = useState(() => new Date())
  const players: Players = new Map(store.players.map((player) => [player.id, player]))
  if (rules.load === 'local') return <Message text={RULES_COPY.local} />
  if (rules.load === 'loading') return <Message text={RULES_COPY.loading} />
  if (rules.load === 'error') return <Message text={RULES_COPY.error} />
  const sections = ruleSections(rules.rules, rules.votes, rules.playerId)
  const shared = { rules, players, now, guard, onWithdraw: setWithdrawing }
  return (
    <>
      <div className="content rules-top">
        <ProposeArea rules={rules} guard={guard} />
        <p className="rules-hint">{RULES_COPY.hint}</p>
      </div>
      {rules.rules.length === 0 && <Message text={RULES_COPY.empty} />}
      <Section title={RULES_COPY.adopted} lines={sections.adopted} {...shared} />
      <Section title={RULES_COPY.voting} lines={sections.voting} {...shared} />
      <Section title={RULES_COPY.rejected} lines={sections.rejected} {...shared} />
      <ConfirmDialog
        open={withdrawing !== null}
        title={RULES_COPY.withdrawTitle}
        body={RULES_COPY.withdrawBody}
        confirmLabel={RULES_COPY.withdraw}
        danger
        onConfirm={() => {
          if (withdrawing !== null) rules.withdraw(withdrawing)
          setWithdrawing(null)
        }}
        onCancel={() => setWithdrawing(null)}
      />
    </>
  )
}

export function Reglement() {
  const rules = useRules()
  const guard = useWriteGuard()
  return (
    <div className="lists-screen reglement">
      <NotifTabs current="reglement" />
      <RulesBody rules={rules} guard={guard} />
    </div>
  )
}
