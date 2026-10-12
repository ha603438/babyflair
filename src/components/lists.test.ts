// Lists group, part 1: the pure shells (ListRow, Badge, Card, Sparkline). vitest runs in node (no DOM), so the
// markup is checked through react-dom/server.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Badge } from './Badge'
import { Card } from './Card'
import { ListRow } from './ListRow'
import { Sparkline } from './Sparkline'

const noop = () => {}

describe('ListRow', () => {
  it('renders an <a> with the href, the divider and the pressed-state class', () => {
    const html = renderToStaticMarkup(createElement(ListRow, { title: 'Alice', href: '#/joueurs/a', chevron: true }))
    expect(html.startsWith('<a ')).toBe(true)
    expect(html).toContain('href="#/joueurs/a"')
    expect(html).toContain('class="row row-divider row--tap"')
    expect(html).toContain('row-chevron')
  })

  it('renders a <button type="button"> when only onClick is given', () => {
    const html = renderToStaticMarkup(createElement(ListRow, { title: 'Exporter', onClick: noop }))
    expect(html.startsWith('<button type="button"')).toBe(true)
    expect(html).toContain('row--tap')
  })

  it('renders a plain <div> otherwise, with an inline min-height only when asked', () => {
    const plain = renderToStaticMarkup(createElement(ListRow, { title: 'x' }))
    expect(plain.startsWith('<div class="row row-divider"')).toBe(true)
    expect(plain).not.toContain('style=')
    expect(plain).not.toContain('row--tap')

    const tall = renderToStaticMarkup(createElement(ListRow, { title: 'x', minHeight: 72 }))
    expect(tall).toContain('style="min-height:72px"')
  })

  it('places leading, subtitle, trailing and trailingSub in their columns', () => {
    const html = renderToStaticMarkup(
      createElement(ListRow, { title: 'T', subtitle: 'S', leading: 'L', trailing: '1 026', trailingSub: 'tr' }),
    )
    expect(html).toContain('<div class="row-leading">L</div>')
    expect(html).toContain('<div class="row-sub">S</div>')
    expect(html).toContain('<div class="row-trailing-main">1 026</div>')
    expect(html).toContain('<div class="row-trailing-sub">tr</div>')
  })
})

describe('Badge', () => {
  it('renders the « invité » pill', () => {
    expect(renderToStaticMarkup(createElement(Badge, { kind: 'guest' }))).toBe(
      '<span class="badge badge--guest">invité</span>',
    )
  })

  it('renders the rookie « ? » circle with an accessible name', () => {
    const html = renderToStaticMarkup(createElement(Badge, { kind: 'rookie' }))
    expect(html).toContain('badge--rookie')
    expect(html).toContain('aria-label="Pas encore classé"')
    expect(html).toContain('>?</span>')
  })

  it('maps ranks 1–3 to gold, silver and bronze', () => {
    expect(renderToStaticMarkup(createElement(Badge, { kind: 'medal', rank: 1 }))).toContain('badge--gold">1<')
    expect(renderToStaticMarkup(createElement(Badge, { kind: 'medal', rank: 2 }))).toContain('badge--silver">2<')
    expect(renderToStaticMarkup(createElement(Badge, { kind: 'medal', rank: 3 }))).toContain('badge--bronze">3<')
  })
})

describe('Card', () => {
  it('uses the base .card surface with the default 16 px padding class', () => {
    // Card is a pure function component (no hooks), so calling it directly yields the element.
    expect(renderToStaticMarkup(Card({ children: 'x' }))).toBe('<div class="card card-pad">x</div>')
  })

  it('switches to an inline padding when a custom value is given', () => {
    const html = renderToStaticMarkup(Card({ padding: 0, className: 'hint', children: 'x' }))
    expect(html).toBe('<div class="card hint" style="padding:0">x</div>')
  })
})

function polylinePoints(html: string): Array<[number, number]> {
  const match = /points="([^"]+)"/.exec(html)
  if (!match) return []
  return match[1].split(' ').map((pair) => {
    const [x, y] = pair.split(',').map(Number)
    return [x, y]
  })
}

describe('Sparkline', () => {
  it('renders nothing with fewer than 2 points', () => {
    expect(renderToStaticMarkup(createElement(Sparkline, { points: [] }))).toBe('')
    expect(renderToStaticMarkup(createElement(Sparkline, { points: [1000] }))).toBe('')
  })

  it('draws one polyline vertex per point across the full 0..100 viewBox width', () => {
    const html = renderToStaticMarkup(createElement(Sparkline, { points: [1000, 1016, 1003, 1021] }))
    const pts = polylinePoints(html)
    expect(pts).toHaveLength(4)
    expect(pts[0][0]).toBe(0)
    expect(pts[3][0]).toBe(100)
    // higher rating = smaller y
    expect(pts[3][1]).toBeLessThan(pts[2][1])
    expect(pts[1][1]).toBeLessThan(pts[0][1])
  })

  it('keeps the dashed 1000 baseline and its label visible even when every point is above it', () => {
    const html = renderToStaticMarkup(createElement(Sparkline, { points: [1010, 1030], height: 72 }))
    expect(html).toContain('spark-base')
    expect(html).toContain('>1000</text>')
    const baseline = /class="spark-base"[^>]*y1="([\d.]+)"/.exec(html)
    expect(baseline).not.toBeNull()
    // the baseline is the lowest value, so it sits at the bottom padding edge (72 - 6)
    expect(Number(baseline?.[1])).toBe(66)
    expect(html).toContain('preserveAspectRatio="none"')
    expect(html).toContain('spark-dot')
  })

  it('does not produce NaN coordinates for a flat series', () => {
    const html = renderToStaticMarkup(createElement(Sparkline, { points: [1000, 1000, 1000] }))
    expect(html).not.toContain('NaN')
  })
})
