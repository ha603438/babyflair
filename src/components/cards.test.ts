// Lists group, part 3: the Card-based components that embed Button (HintCard, EmptyState) and SectionHeader.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EmptyState } from './EmptyState'
import { HintCard } from './HintCard'
import { SectionHeader } from './SectionHeader'

const noop = () => {}

describe('SectionHeader', () => {
  it('joins the subtitle with « · » and shows the count on the right', () => {
    const html = renderToStaticMarkup(
      createElement(SectionHeader, { title: 'Pas encore classés', subtitle: 'classés après 10 matchs', count: 3 }),
    )
    expect(html).toContain('<h2 class="section-header">')
    expect(html).toContain('>Pas encore classés · classés après 10 matchs<')
    expect(html).toContain('class="section-header-count num">3<')
  })

  it('renders the bare title without subtitle or count', () => {
    const html = renderToStaticMarkup(createElement(SectionHeader, { title: 'Données' }))
    expect(html).toContain('>Données<')
    expect(html).not.toContain('·')
    expect(html).not.toContain('section-header-count')
  })
})

describe('HintCard', () => {
  it('iOS install hint: title, body and a single text « OK »', () => {
    const html = renderToStaticMarkup(
      createElement(HintCard, {
        title: 'Installe BabyFlair sur l’écran d’accueil',
        body: 'corps',
        onDismiss: noop,
      }),
    )
    expect(html).toContain('class="card card-pad hint"')
    expect(html).toContain('class="hint-title">Installe BabyFlair sur l’écran d’accueil<')
    expect(html).toContain('class="hint-body">corps<')
    expect(html).toContain('>OK</button>')
    expect(html).not.toContain('Plus tard')
    expect(html).not.toContain('btn-secondary')
  })

  it('with a primary action: « Plus tard » on the left, the secondary action on the right', () => {
    const html = renderToStaticMarkup(
      createElement(HintCard, {
        title: 't',
        body: 'b',
        primary: { label: 'Installer', onClick: noop },
        onDismiss: noop,
      }),
    )
    expect(html).toContain('>Plus tard</button>')
    expect(html).toContain('>Installer</button>')
    expect(html.indexOf('Plus tard')).toBeLessThan(html.indexOf('Installer'))
    expect(html).toContain('btn-secondary')
    expect(html).toContain('btn-inline')
  })
})

describe('EmptyState', () => {
  it('renders title, body and one primary button', () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        title: 'Pas encore de joueurs',
        body: 'Ajoute les collègues, puis enregistre le premier match.',
        action: { label: 'Ajouter des joueurs', onClick: noop },
      }),
    )
    expect(html).toContain('<section class="empty">')
    expect(html).toContain('class="empty-title">Pas encore de joueurs<')
    expect(html).toContain('class="empty-body">Ajoute les collègues, puis enregistre le premier match.<')
    expect(html).toContain('btn btn-primary btn-lg')
    expect(html).toContain('>Ajouter des joueurs</button>')
    expect(html).not.toContain('disabled')
    expect(html).not.toContain('empty-icon')
  })

  it('disables the button and shows its caption; compact variant and icon slot', () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        icon: createElement('svg'),
        compact: true,
        title: 'Pas encore de classement',
        body: 'Enregistre un match pour commencer.',
        action: { label: 'Nouveau match', onClick: noop, disabled: true, caption: 'Il faut au moins 2 joueurs' },
      }),
    )
    expect(html).toContain('class="empty empty--compact"')
    expect(html).toContain('class="empty-icon" aria-hidden="true"><svg></svg></div>')
    expect(html).toContain('disabled=""')
    expect(html).toContain('class="empty-caption">Il faut au moins 2 joueurs<')
  })

  it('renders no button without an action', () => {
    const html = renderToStaticMarkup(createElement(EmptyState, { title: 't', body: 'b' }))
    expect(html).not.toContain('<button')
  })
})
