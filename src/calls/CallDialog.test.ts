// « Chaud pour prendre une branlée ? » rendered to static markup (vitest runs in node, no DOM): the answer buttons
// depend on this phone's profile, not on a name picker any more.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Call, CallPlayer, CallResponse, Player, PlayerId } from '../types'
import { CallDialog } from './CallDialog'
import type { CallDialogProps } from './CallDialog'
import { callResponses, rosterOf } from './calls'

const noop = () => {}

const named = (id: string): Player => ({ id, name: id[0].toUpperCase() + id.slice(1), isGuest: false, createdAt: 'x' })
const EVERYONE = ['alice', 'bob', 'chloe', 'dan', 'emile'].map(named)
const PLAYERS = new Map<PlayerId, Player>(EVERYONE.map((player) => [player.id, player]))

const call: Call = { id: 'c1', createdAt: 'a', expiresAt: 'b', createdBy: 'alice' }

type Answer = PlayerId | [PlayerId, CallResponse]

function callPlayersOf(answers: Answer[]): CallPlayer[] {
  const joinedAt = (i: number): string => `2026-10-12T10:0${i}:00Z`
  return answers.map((answer, i) => {
    const [playerId, response] = typeof answer === 'string' ? [answer, 'in' as const] : answer
    return { callId: 'c1', playerId, joinedAt: joinedAt(i), response }
  })
}

/** The dialog's roster and lists for these answers (a bare id answers 'in'). */
function state(answers: Answer[]): Pick<CallDialogProps, 'roster' | 'responses'> {
  const callPlayers = callPlayersOf(answers)
  return { roster: rosterOf(call, callPlayers, PLAYERS), responses: callResponses(call, callPlayers, EVERYONE, new Map()) }
}

function render(patch: Partial<CallDialogProps>): string {
  const props: CallDialogProps = {
    open: true,
    ...state(['alice']),
    viewerId: 'bob',
    busy: false,
    onJoin: noop,
    onDecline: noop,
    onFormTeams: noop,
    onDismiss: noop,
    onChooseProfile: noop,
    ...patch,
  }
  return renderToStaticMarkup(createElement(CallDialog, props))
}

/** The names under a list caption, in order. */
function namesUnder(html: string, caption: string): string[] {
  const group = html.split(`call-dialog__group-caption">${caption}</p>`)[1]?.split('</ul>')[0] ?? ''
  return [...group.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map((match) => match[1])
}

describe('CallDialog', () => {
  it('lets a player answer « Chauuud 🔥 » or « Non je fais semblant de bosser », without a name picker', () => {
    const html = render({})
    expect(html).toContain('Chaud pour prendre une branlée ?')
    expect(html).toContain('Alice flaire un baby · 1/4 présents')
    expect(html).toContain('Chauuud 🔥')
    expect(html).toContain('Non je fais semblant de bosser')
    expect(html).not.toContain('Déjà inscrit')
    expect(html).not.toContain('Qui es-tu ?')
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Chauuud/)
  })

  it('lists who is in, who declined and who has not answered yet, the viewer marked « (toi) »', () => {
    const html = render({ ...state(['alice', ['dan', 'out'], 'chloe']), viewerId: 'bob' })
    expect(namesUnder(html, 'Chauds · 2/4')).toEqual(['Alice', 'Chloe'])
    expect(namesUnder(html, 'Pas chauds')).toEqual(['Dan'])
    expect(namesUnder(html, 'Pas encore répondu')).toEqual(['Bob (toi)', 'Emile'])
    expect(html).toContain('Alice flaire un baby · 2/4 présents')
  })

  it('hides « Pas chauds » and « Pas encore répondu » when nobody is in them', () => {
    const html = render(state(['alice', 'bob', 'chloe', 'dan', 'emile']))
    expect(html).toContain('Chauds · 4/4')
    expect(html).not.toContain('Pas chauds')
    expect(html).not.toContain('Pas encore répondu')
    const first = render({ ...state(['alice']), viewerId: 'alice' })
    expect(namesUnder(first, 'Chauds · 1/4')).toEqual(['Alice (toi)'])
    expect(first).not.toContain('Pas chauds')
  })

  it('disables « Chauuud 🔥 » with « Déjà inscrit » once in the call; declining stays possible', () => {
    const html = render(state(['alice', 'bob']))
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Chauuud 🔥/)
    expect(html).toContain('Déjà inscrit')
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Non je fais semblant de bosser/)
  })

  it('a player who declined can still say « Chauuud 🔥 »', () => {
    const html = render(state(['alice', ['bob', 'out']]))
    expect(namesUnder(html, 'Pas chauds')).toEqual(['Bob (toi)'])
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Chauuud/)
    expect(html).not.toContain('Déjà inscrit')
  })

  it('refuses « Chauuud 🔥 » with « Complet » once 4 are in, without « Former les équipes » for the others', () => {
    const html = render({ ...state(['alice', 'chloe', 'dan', 'emile']), viewerId: 'bob' })
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Chauuud 🔥/)
    expect(html).toContain('Complet')
    expect(html).toContain('Non je fais semblant de bosser')
    expect(html).not.toContain('Former les équipes')
  })

  it('shows a visitor the roster and « Choisir mon profil pour répondre » instead', () => {
    const html = render({ viewerId: undefined })
    expect(html).toContain('Alice flaire un baby · 1/4 présents')
    expect(html).toContain('Choisir mon profil pour répondre')
    expect(html).not.toContain('Chauuud')
    expect(html).not.toContain('(toi)')
  })

  it('keeps « Former les équipes » for the 4 players once full, and « Appel terminé » for a closed call', () => {
    expect(render(state(['alice', 'bob', 'chloe', 'dan']))).toContain('Former les équipes')
    expect(render({ roster: null })).toContain('Appel terminé')
  })
})
