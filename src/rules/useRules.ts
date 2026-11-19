// React side of the Règlement: one shared state for the shell (the bell badge) and the screen, fetched from the
// server on open, on focus and every minute; proposing, voting and withdrawing go straight to the server (sync.api)
// and update the state optimistically. Decisions and copy live in rules.ts.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { currentSubscription } from '../calls/push'
import { profileId } from '../profile/profile'
import { useProfile } from '../profile/useWriteGuard'
import type { RemoteApi } from '../remote/api'
import { useAppState } from '../store'
import { subscribeRefetch, toastTextFor } from '../store/remote-sync'
import type { PlayerId, Rule, RuleVote, RuleVoteValue } from '../types'
import { isOpen, newRule, newVote, proposedToast, RULES_COPY, withVote } from './rules'

/** Rules change slowly: a minute between polls while the app is visible (plus focus and visibility). */
const RULES_REFETCH_MS = 60_000

export type RulesLoad = 'local' | 'loading' | 'error' | 'done'

export type RulesState = {
  load: RulesLoad
  rules: Rule[]
  votes: RuleVote[]
  /** When the rules were last fetched: the clock that opens and closes the weeks of vote on screen. */
  now: Date
  /** This phone's player; undefined for a visitor (read only). */
  playerId: PlayerId | undefined
  busy: boolean
  refresh: () => Promise<void>
  /** Inserts the rule and its author's « d'accord », then notifies the others; false when it could not be saved. */
  propose: (text: string) => Promise<boolean>
  vote: (ruleId: string, value: RuleVoteValue) => void
  withdraw: (ruleId: string) => void
}

type Data = { load: Exclude<RulesLoad, 'local'>; rules: Rule[]; votes: RuleVote[]; now: Date }

function initialData(): Data {
  return { load: 'loading', rules: [], votes: [], now: new Date() }
}

/** A failed poll keeps what was already shown; only a first load turns into an error. */
function afterFailedFetch(current: Data): Data {
  if (current.load === 'done') return { ...current, now: new Date() }
  return { ...current, load: 'error', now: new Date() }
}

/** Without a server (local mode, or before the office code) there is nothing to vote on. */
function loadOf(api: RemoteApi | null, data: Data): RulesLoad {
  if (api === null) return 'local'
  return data.load
}

function useRulesState(): RulesState {
  const { sync, toast } = useAppState()
  const api = sync.api
  const showToast = toast.show
  const playerId = profileId(useProfile())
  const [data, setData] = useState<Data>(initialData)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (api === null) return
    try {
      const fetched = await api.fetchRules()
      setData({ load: 'done', ...fetched, now: new Date() })
    } catch {
      setData(afterFailedFetch)
    }
  }, [api])

  // On open, then on focus / visibility and every minute; a late answer from a previous office code is dropped.
  useEffect(() => {
    if (api === null) return
    let active = true
    const load = () => {
      api.fetchRules().then(
        (fetched) => {
          if (active) setData({ load: 'done', ...fetched, now: new Date() })
        },
        () => {
          if (active) setData(afterFailedFetch)
        },
      )
    }
    load()
    const stop = subscribeRefetch(window, document, load, RULES_REFETCH_MS, globalThis)
    return () => {
      active = false
      stop()
    }
  }, [api])

  const fail = useCallback(
    (error: unknown) => {
      showToast({ text: toastTextFor(error) })
      void refresh()
    },
    [refresh, showToast],
  )

  const propose = useCallback(
    async (text: string): Promise<boolean> => {
      if (api === null || playerId === undefined) return false
      const now = new Date()
      const rule = newRule(crypto.randomUUID(), text, playerId, now)
      const agree = newVote(rule.id, playerId, 'yes', now)
      setBusy(true)
      try {
        await api.insertRule(rule)
        await api.upsertRuleVote(agree)
      } catch (error) {
        setBusy(false)
        showToast({ text: toastTextFor(error) })
        return false
      }
      setData((current) => ({ ...current, rules: [...current.rules, rule], votes: withVote(current.votes, agree) }))
      setBusy(false)
      // The author's own phone is skipped; its subscription is tied to the profile, as for a call.
      const mine = await currentSubscription(playerId)
      if (mine !== null) await api.upsertPushSubscription(mine).catch(() => undefined)
      const sent = await api.notifyRule(rule.id, mine?.endpoint ?? null).then(
        (result) => result.sent,
        () => null,
      )
      showToast({ text: proposedToast(sent) })
      return true
    },
    [api, playerId, showToast],
  )

  const vote = useCallback(
    (ruleId: string, value: RuleVoteValue) => {
      if (api === null || playerId === undefined) return
      const now = new Date()
      // The week is over (the screen may have stayed open): the server would refuse it anyway.
      const rule = data.rules.find((r) => r.id === ruleId)
      if (rule === undefined || !isOpen(rule, now)) {
        showToast({ text: RULES_COPY.closed })
        void refresh()
        return
      }
      const next = newVote(ruleId, playerId, value, now)
      setData((current) => ({ ...current, votes: withVote(current.votes, next) }))
      api.upsertRuleVote(next).catch(fail)
    },
    [api, data.rules, fail, playerId, refresh, showToast],
  )

  const withdraw = useCallback(
    (ruleId: string) => {
      if (api === null) return
      setData((current) => ({
        ...current,
        rules: current.rules.filter((rule) => rule.id !== ruleId),
        votes: current.votes.filter((v) => v.ruleId !== ruleId),
      }))
      api.deleteRule(ruleId).then(() => showToast({ text: RULES_COPY.withdrawn }), fail)
    },
    [api, fail, showToast],
  )

  return useMemo(
    () => ({ ...data, load: loadOf(api, data), playerId, busy, refresh, propose, vote, withdraw }),
    [api, data, playerId, busy, refresh, propose, vote, withdraw],
  )
}

/** Exported for the screen tests, which hand it a ready state. */
export const RulesContext = createContext<RulesState | null>(null)

/** Mounted once by the shell, so the bell badge and the screen share one fetch. */
export function RulesProvider({ children }: { children: ReactNode }) {
  const state = useRulesState()
  return createElement(RulesContext.Provider, { value: state }, children)
}

export function useRules(): RulesState {
  const state = useContext(RulesContext)
  if (state === null) throw new Error('useRules outside RulesProvider')
  return state
}
