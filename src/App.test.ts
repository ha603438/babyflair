import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import App from './App'

// vitest runs in the node environment: a minimal window stub lets useRoute() read the hash during server rendering
// (useSyncExternalStore uses the server snapshot, so no hashchange subscription is needed).
function renderAt(hash: string): string {
  vi.stubGlobal('window', { location: { hash }, history: { back: vi.fn() } })
  // Node 25 ships a non-functional localStorage global that warns when touched; loadStore() reads it at mount.
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })
  return renderToString(createElement(App))
}

const CASES: Array<[string, string]> = [
  ['#/', 'Classement'],
  ['#/match', 'Nouveau match'],
  ['#/match/m1/modifier', 'Modifier le match'],
  ['#/historique', 'Historique'],
  ['#/historique/m1', 'Match'],
  ['#/joueurs', 'Joueurs'],
  ['#/joueurs/p1', 'Joueur'],
  ['#/reglages', 'Réglages'],
  ['#/comment-ca-marche', 'Comment ça marche'],
  ['#/journal', "Journal d&#x27;activité"],
]

describe('App shell', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(CASES)('renders %s with the header title « %s »', (hash, title) => {
    const html = renderAt(hash)
    expect(html).toContain('class="app"')
    expect(html).toContain(`>${title}<`)
    expect(html).toContain('class="tabbar"')
    expect(html).toContain('class="toast-region"')
  })

  it('renders the empty-state copy and tab links on the home route', () => {
    const html = renderAt('#/')
    expect(html).toContain('Pas encore de joueurs')
    expect(html).toContain('href="#/match"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('aria-label="Comment ça marche"')
  })

  it('renders Classement with the call dialog on a notification link (#/appel/:id)', () => {
    const html = renderAt('#/appel/c1')
    expect(html).toContain('>Classement<')
    // Local mode knows no call: the dialog reads « Appel terminé ».
    expect(html).toContain('Appel terminé')
  })

  it('local mode: no profile gate, no visitor badge, no « Proposer un baby », no profile or journal rows', () => {
    expect(renderAt('#/')).not.toContain('Qui es-tu ?')
    expect(renderAt('#/')).not.toContain('Mode invité')
    expect(renderAt('#/')).not.toContain('Proposer un baby')
    const reglages = renderAt('#/reglages')
    expect(reglages).not.toContain('Mon profil')
    expect(reglages).not.toContain('Journal des modifications')
    expect(renderAt('#/journal')).toContain("Aucune modification ni suppression pour l&#x27;instant.")
  })

  it('falls back to Classement on an unknown hash', () => {
    expect(renderAt('#/nope')).toContain('>Classement<')
  })
})
