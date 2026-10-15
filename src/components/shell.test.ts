// Shell components (Button, Header, TabBar, Toast, ConfirmDialog, InlinePlayerForm, icons).
// vitest runs in the node environment (no DOM), so markup is checked through react-dom/server and the
// InlinePlayerForm validation is tested as a pure function.
import { createElement } from 'react'
import type { FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../router', () => ({
  back: vi.fn(),
  hrefOf: (route: { name: string }) => (route.name === 'classement' ? '#/' : `#/${route.name}`),
}))

import { Button, IconButton } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { Header } from './Header'
import { InlinePlayerForm, normalizePlayerName, validatePlayerName } from './InlinePlayerForm'
import { TabBar } from './TabBar'
import { Toast } from './Toast'
import * as icons from './icons'

const noop = () => {}

/** Renders a function component to static HTML; `children` travels inside `props` like any other prop. */
function render<P extends object>(type: FunctionComponent<P>, props: P): string {
  return renderToStaticMarkup(createElement(type, props))
}

describe('Button', () => {
  it('renders a non-submitting button with variant, size and danger classes', () => {
    const html = render(Button, { variant: 'primary', children: 'Enregistrer' })
    expect(html).toContain('type="button"')
    expect(html).toContain('class="btn btn-primary btn-lg"')
    expect(html).toContain('>Enregistrer<')

    const danger = render(Button, { variant: 'text', danger: true, inline: true, children: 'Supprimer' })
    expect(danger).toContain('class="btn btn-text btn-danger btn-inline"')

    const secondary = render(Button, { variant: 'secondary', children: 'Modifier' })
    expect(secondary).toContain('class="btn btn-secondary btn-md"')
  })

  it('forwards disabled, type=submit and aria-label', () => {
    const props = { variant: 'primary', disabled: true, type: 'submit', 'aria-label': 'Go', children: 'x' } as const
    const html = render(Button, props)
    expect(html).toContain('disabled=""')
    expect(html).toContain('type="submit"')
    expect(html).toContain('aria-label="Go"')
  })

  it('IconButton renders a 44px button or a link with the accessible name', () => {
    const btn = render(IconButton, { label: 'Réglages', children: 'i' })
    expect(btn).toMatch(/^<button type="button" class="icon-btn" aria-label="Réglages">i<\/button>$/)
    const link = render(IconButton, { label: 'Comment ça marche', href: '#/x', children: 'i' })
    expect(link).toMatch(/^<a class="icon-btn" href="#\/x" aria-label="Comment ça marche">i<\/a>$/)
  })
})

describe('icons', () => {
  const names = [
    'Plus', 'Close', 'Check', 'ChevronLeft', 'ChevronRight', 'Pencil', 'Trash', 'Help',
    'Settings', 'Share', 'Download', 'Upload', 'Trophy', 'List', 'Clock', 'People',
  ] as const

  it('exports the 16 icons as 24px currentColor stroke-2 decorative SVGs', () => {
    for (const name of names) {
      const Icon = icons[name]
      expect(typeof Icon).toBe('function')
      const html = renderToStaticMarkup(createElement(Icon))
      expect(html.startsWith('<svg class="icon"')).toBe(true)
      expect(html).toContain('width="24"')
      expect(html).toContain('height="24"')
      expect(html).toContain('stroke="currentColor"')
      expect(html).toContain('stroke-width="2"')
      expect(html).toContain('fill="none"')
      expect(html).toContain('aria-hidden="true"')
    }
  })

  it('accepts a size override', () => {
    expect(renderToStaticMarkup(createElement(icons.Check, { size: 28 }))).toContain('width="28"')
  })
})

describe('Header', () => {
  it('tab root: h1 title left and the right slot', () => {
    const html = render(Header, { title: 'Classement', right: 'R' })
    expect(html).toContain('class="header header-root"')
    expect(html).toContain('<h1 class="header-title">')
    expect(html).toContain('class="header-brand-mark"')
    expect(html).toContain('Classement</h1>')
    expect(html).toContain('<div class="header-right">R</div>')
    expect(html).not.toContain('Retour')
  })

  it('pushed: back chevron with aria-label « Retour »', () => {
    const html = render(Header, { title: 'Réglages', back: true })
    expect(html).toContain('class="header header-pushed"')
    expect(html).toContain('aria-label="Retour"')
    expect(html).toContain('<h1 class="header-title">Réglages</h1>')
  })

  it('tab root: brand line (mark + wordmark) above the title', () => {
    const html = render(Header, { title: 'Nouveau match', right: 'S' })
    expect(html).toContain('class="header header-root"')
    expect(html).toContain('class="header-brandline"')
    expect(html).toContain('class="header-brand-mark"')
    expect(html).toContain('class="header-wordmark"')
    expect(html).toContain('Nouveau match</h1>')
  })
})

describe('TabBar', () => {
  it('renders the 5 tabs in order as links with hrefOf and aria-current on the active one', () => {
    const html = render(TabBar, { current: 'historique' })
    const links = html.match(/<a [^>]*>/g) ?? []
    expect(links).toHaveLength(5)
    expect(links[0]).toContain('href="#/"')
    expect(links[1]).toContain('href="#/match"')
    expect(links[2]).toContain('href="#/historique"')
    expect(links[3]).toContain('href="#/joueurs"')
    expect(links[4]).toContain('href="#/nouveautes"')
    expect(links[2]).toContain('aria-current="page"')
    expect(links[2]).toContain('tab-active')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    expect(html).toContain('>Classement<')
    expect(html).toContain('>Match<')
    expect(html).toContain('>Historique<')
    expect(html).toContain('>Joueurs<')
  })

  it('keeps the section tab active on pushed screens', () => {
    const detail = render(TabBar, { current: 'match-detail' })
    expect((detail.match(/<a [^>]*>/g) ?? [])[2]).toContain('aria-current="page"')
    const reglages = render(TabBar, { current: 'reglages' })
    expect((reglages.match(/<a [^>]*>/g) ?? [])[3]).toContain('aria-current="page"')
    const rules = render(TabBar, { current: 'comment-ca-marche' })
    expect((rules.match(/<a [^>]*>/g) ?? [])[0]).toContain('aria-current="page"')
    const curves = render(TabBar, { current: 'courbes' })
    expect((curves.match(/<a [^>]*>/g) ?? [])[0]).toContain('aria-current="page"')
    const top = render(TabBar, { current: 'top' })
    expect((top.match(/<a [^>]*>/g) ?? [])[0]).toContain('aria-current="page"')
  })
})

describe('Toast', () => {
  it('keeps an empty live region when there is no toast', () => {
    const html = render(Toast, { toast: null, onDismiss: noop })
    expect(html).toBe('<div class="toast-region" role="status" aria-live="polite"></div>')
  })

  it('renders the text and the action button', () => {
    const html = render(Toast, {
      toast: { id: 3, text: 'Match supprimé', action: { label: 'Annuler', onClick: noop } },
      onDismiss: noop,
      })
    expect(html).toContain('<span class="toast-text">Match supprimé</span>')
    expect(html).toContain('<button type="button" class="toast-action">Annuler</button>')
  })

  it('renders no button without an action', () => {
    const html = render(Toast, { toast: { id: 1, text: 'Export prêt' }, onDismiss: noop })
    expect(html).toContain('Export prêt')
    expect(html).not.toContain('<button')
  })
})

describe('ConfirmDialog', () => {
  it('renders a native dialog with title, body, cancel left and confirm right', () => {
    const html = render(ConfirmDialog, {
      open: true,
      title: 'Supprimer ce match ?',
      body: 'Le classement sera recalculé sans lui.',
      confirmLabel: 'Supprimer',
      danger: true,
      onConfirm: noop,
      onCancel: noop,
      })
    expect(html.startsWith('<dialog class="dialog"')).toBe(true)
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('Supprimer ce match ?')
    expect(html).toContain('Le classement sera recalculé sans lui.')
    const buttons = html.match(/<button [^>]*>[^<]*<\/button>/g) ?? []
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toContain('btn-secondary')
    expect(buttons[0]).toContain('>Annuler<')
    expect(buttons[1]).toContain('btn-primary')
    expect(buttons[1]).toContain('btn-danger')
    expect(buttons[1]).toContain('>Supprimer<')
  })

  it('single mode renders one OK button', () => {
    const html = render(ConfirmDialog, {
      open: true,
      single: true,
      title: 'Fichier invalide',
      body: "Ce n'est pas un export BabyFlair.",
      confirmLabel: 'OK',
      onConfirm: noop,
      onCancel: noop,
      })
    const buttons = html.match(/<button [^>]*>[^<]*<\/button>/g) ?? []
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toContain('>OK<')
    expect(html).toContain('dialog-actions-single')
  })

  it('honours a custom cancel label', () => {
    const html = render(ConfirmDialog, {
      open: false,
      title: 'T',
      body: 'B',
      confirmLabel: 'Importer',
      cancelLabel: 'Plus tard',
      onConfirm: noop,
      onCancel: noop,
      })
    expect(html).toContain('>Plus tard<')
    expect(html).toContain('>Importer<')
  })
})

describe('InlinePlayerForm', () => {
  it('validatePlayerName returns the three French messages', () => {
    expect(validatePlayerName('', [])).toBe('Entre un nom')
    expect(validatePlayerName('   ', [])).toBe('Entre un nom')
    expect(validatePlayerName('a'.repeat(25), [])).toBe('24 caractères max')
    expect(validatePlayerName('a'.repeat(24), [])).toBeNull()
    expect(validatePlayerName('Léa', ['lea'])).toBe('Ce nom existe déjà')
    expect(validatePlayerName('alice', ['Alice'])).toBe('Ce nom existe déjà')
    expect(validatePlayerName(' Chloé ', ['CHLOE'])).toBe('Ce nom existe déjà')
    expect(validatePlayerName('Bob', ['Alice', 'Chloé'])).toBeNull()
  })

  it('validatePlayerName ignores the player own current name in edit mode', () => {
    expect(validatePlayerName('Alice', ['Alice', 'Bob'], 'Alice')).toBeNull()
    expect(validatePlayerName('alice', ['Alice', 'Bob'], 'Alice')).toBeNull()
    expect(validatePlayerName('Bob', ['Alice', 'Bob'], 'Alice')).toBe('Ce nom existe déjà')
  })

  it('normalizePlayerName strips accents, case and surrounding spaces', () => {
    expect(normalizePlayerName('  Éloïse ')).toBe('eloise')
    expect(normalizePlayerName('Chloé')).toBe(normalizePlayerName('CHLOE'))
  })

  it('renders the add form with the iOS-safe input attributes', () => {
    const html = render(InlinePlayerForm, { mode: 'add', onSubmit: noop, onCancel: noop, existingNames: [] })
    // HTML attribute names are case-insensitive; the server renderer keeps some of them camel-cased.
    const lower = html.toLowerCase()
    expect(html.startsWith('<form class="inline-form"')).toBe(true)
    expect(html).toContain('placeholder="Prénom ou surnom"')
    expect(lower).toContain('autocapitalize="words"')
    expect(lower).toContain('autocomplete="off"')
    expect(lower).toContain('enterkeyhint="done"')
    expect(lower).toContain('maxlength="24"')
    expect(lower).toContain('autofocus=""')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('>Invité<')
    expect(html).toContain('Pas un collègue : badge invité dans les listes')
    expect(html).toContain('type="submit"')
    expect(html).toContain('>Ajouter<')
    expect(html).toContain('>Annuler<')
    expect(html).not.toContain('inline-form-error')
  })

  it('renders the edit form prefilled with « Enregistrer » and an optional title', () => {
    const html = render(InlinePlayerForm, {
      mode: 'edit',
      initial: { name: 'Alice', isGuest: true },
      title: 'Ajoute tes collègues',
      onSubmit: noop,
      onCancel: noop,
      existingNames: ['Bob'],
      })
    expect(html).toContain('value="Alice"')
    expect(html).toContain('checked=""')
    expect(html).toContain('<h2 class="inline-form-title">Ajoute tes collègues</h2>')
    expect(html).toContain('>Enregistrer<')
    expect(html).not.toContain('>Ajouter<')
  })
})
