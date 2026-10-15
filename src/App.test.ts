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
  ['#/stats', 'Stats'],
  ['#/courbes', 'Stats'],
  ['#/top', 'Stats'],
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

  it('opens the players list as a pushed screen (back chevron), the Classement tab staying active', () => {
    const html = renderAt('#/joueurs')
    expect(html).toContain('<h1 class="header-title">Joueurs</h1>')
    expect(html).toContain('aria-label="Retour"')
    expect(html).not.toContain('header-wordmark')
    const tabs = html.match(/<a [^>]*class="tab[^"]*"[^>]*>/g) ?? []
    expect(tabs[0]).toContain('aria-current="page"')
  })

  it('renders the three Stats segments as tab roots: brand header « Stats », gear to Réglages, no back chevron', () => {
    for (const hash of ['#/stats', '#/courbes', '#/top']) {
      const html = renderAt(hash)
      expect(html).toContain('class="header header-root"')
      expect(html).toContain('<h1 class="header-title">Stats</h1>')
      expect(html).toContain('aria-label="Nouveau match"')
      expect(html).toContain('href="#/reglages" aria-label="Réglages"')
      expect(html).not.toContain('aria-label="Retour"')
      const tabs = html.match(/<a [^>]*class="tab[^"]*"[^>]*>/g) ?? []
      expect(tabs[3]).toContain('href="#/stats"')
      expect(tabs[3]).toContain('aria-current="page"')
    }
  })

  it('shows the Récap empty state on #/stats without any match', () => {
    const html = renderAt('#/stats')
    expect(html).toContain('Pas encore de récap')
  })

  it('falls back to Classement on an unknown hash', () => {
    expect(renderAt('#/nope')).toContain('>Classement<')
  })
})
