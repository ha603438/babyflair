// « Chaud pour prendre une branlée ? » rendered to static markup (vitest runs in node, no DOM): the answer buttons
// depend on this phone's profile, not on a name picker any more.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Call, CallPlayer, Player, PlayerId } from '../types'
import { CallDialog } from './CallDialog'
import type { CallDialogProps } from './CallDialog'
import { rosterOf } from './calls'

const noop = () => {}

const named = (id: string): Player => ({ id, name: id[0].toUpperCase() + id.slice(1), isGuest: false, createdAt: 'x' })
const PLAYERS = new Map<PlayerId, Player>(['alice', 'bob', 'chloe', 'dan'].map((id) => [id, named(id)]))

const call: Call = { id: 'c1', createdAt: 'a', expiresAt: 'b', createdBy: 'alice' }

function roster(ids: PlayerId[]) {
  const joinedAt = (i: number): string => `2026-10-12T10:0${i}:00Z`
  const callPlayers: CallPlayer[] = ids.map((playerId, i) => ({ callId: 'c1', playerId, joinedAt: joinedAt(i) }))
  return rosterOf(call, callPlayers, PLAYERS)
}

function render(patch: Partial<CallDialogProps>): string {
  const props: CallDialogProps = {
    open: true,
    roster: roster(['alice']),
    viewerId: 'bob',
    busy: false,
    onJoin: noop,
    onFormTeams: noop,
    onDismiss: noop,
    onChooseProfile: noop,
    ...patch,
  }
  return renderToStaticMarkup(createElement(CallDialog, props))
}

describe('CallDialog', () => {
  it('lets a player answer « Chauuud 🔥 » or « Non je fais semblant de bosser », without a name picker', () => {
    const html = render({})
    expect(html).toContain('Chaud pour prendre une branlée ?')
    expect(html).toContain('Alice propose un baby · 1/4 présents')
    expect(html).toContain('Chauuud 🔥')
    expect(html).toContain('Non je fais semblant de bosser')
    expect(html).not.toContain('Déjà inscrit')
    expect(html).not.toContain('Qui es-tu ?')
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Chauuud/)
  })

  it('disables « Chauuud 🔥 » with « Déjà inscrit » once in the call', () => {
    const html = render({ roster: roster(['alice', 'bob']) })
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Chauuud 🔥/)
    expect(html).toContain('Déjà inscrit')
  })

  it('shows a visitor the roster and « Choisir mon profil pour répondre » instead', () => {
    const html = render({ viewerId: undefined })
    expect(html).toContain('Alice propose un baby · 1/4 présents')
    expect(html).toContain('Choisir mon profil pour répondre')
    expect(html).not.toContain('Chauuud')
  })

  it('keeps « Former les équipes » once full, and « Appel terminé » for a closed call', () => {
    expect(render({ roster: roster(['alice', 'bob', 'chloe', 'dan']) })).toContain('Former les équipes')
    expect(render({ roster: null })).toContain('Appel terminé')
  })
})
