// « Qui es-tu ? » server-rendered inside the real provider (vitest runs in node, no DOM; the store comes from a
// stubbed localStorage).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppStateProvider, STORAGE_KEY } from '../store'
import type { Player, Settings, Store } from '../types'
import { ProfileGate } from './ProfileGate'

function player(id: string, name: string): Player {
  return { id, name, isGuest: false, createdAt: '2026-10-01T10:00:00.000Z' }
}

function renderGate(players: Player[], settings: Partial<Settings> = {}): string {
  const store: Store = {
    version: 1,
    players,
    matches: [],
    settings: { lastFormat: '2v2', lastTarget: 5, officeCode: 'secret', ...settings },
    nextSeq: 1,
    calls: [],
    callPlayers: [],
  }
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === STORAGE_KEY ? JSON.stringify(store) : null),
    setItem: () => undefined,
  })
  return renderToStaticMarkup(createElement(AppStateProvider, null, createElement(ProfileGate)))
}

describe('ProfileGate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists the players alphabetically with the previous pick preselected', () => {
    const html = renderGate([player('z', 'Zoé'), player('a', 'arnault'), player('j', 'Julien')], { myPlayerId: 'j' })
    expect(html).toContain('Qui es-tu ?')
    expect(html).toContain('Choisis ton profil : il signe tes matchs et tes réponses aux appels.')
    const names = [...html.matchAll(/class="profile-choice__name">([^<]+)</g)].map((m) => m[1])
    expect(names).toEqual(['arnault', 'Julien', 'Zoé'])
    expect(html).toMatch(/aria-pressed="true"[^>]*><span class="profile-choice__name">Julien/)
    expect(html).toContain('Je ne suis pas dans la liste')
    expect(html).toContain('Visiter en invité')
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>C&#x27;est moi/)
  })

  it('needs a pick before « C’est moi », and opens the form when nobody is listed', () => {
    expect(renderGate([player('a', 'Alice')])).toMatch(/<button[^>]*disabled[^>]*>C&#x27;est moi/)
    const empty = renderGate([])
    expect(empty).toContain('Prénom ou surnom')
    // Someone creating their own profile is a colleague: no « Invité » box here.
    expect(empty).not.toContain('Pas un collègue')
  })
})
