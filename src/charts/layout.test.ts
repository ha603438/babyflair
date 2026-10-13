import { describe, expect, it } from 'vitest'
import {
  CHART_HEIGHT,
  endLabelWidth,
  fitName,
  indexAtPx,
  makeFrame,
  MARGIN,
  placeTicks,
  rightMargin,
  spreadLabels,
  stepIndex,
  textWidth,
  tooltipLeft,
  xPx,
  yPx,
} from './layout'

const FRAME = makeFrame(343, 64, { min: 0.5, max: 10 }, { min: 980, max: 1020 })

describe('frame and scales', () => {
  it('applies the margins in real pixels', () => {
    expect(FRAME).toMatchObject({ left: MARGIN.left, top: MARGIN.top, width: 343 - 40 - 64 })
    expect(FRAME.height).toBe(CHART_HEIGHT - MARGIN.top - MARGIN.bottom)
  })

  it('maps x 0.5..N to the plot width and y with the maximum on top', () => {
    expect(xPx(FRAME, 0.5)).toBe(FRAME.left)
    expect(xPx(FRAME, 10)).toBe(FRAME.left + FRAME.width)
    expect(yPx(FRAME, 1020)).toBe(FRAME.top)
    expect(yPx(FRAME, 980)).toBe(FRAME.top + FRAME.height)
    expect(yPx(FRAME, 1000)).toBe(FRAME.top + FRAME.height / 2)
  })

  it('snaps a pixel column to the nearest match, clamped to 1..N', () => {
    expect(indexAtPx(FRAME, xPx(FRAME, 4.4), 10)).toBe(4)
    expect(indexAtPx(FRAME, xPx(FRAME, 4.6), 10)).toBe(5)
    expect(indexAtPx(FRAME, 0, 10)).toBe(1)
    expect(indexAtPx(FRAME, 999, 10)).toBe(10)
  })
})

describe('end labels', () => {
  it('estimates wider text for longer strings', () => {
    expect(textWidth('Alexandre', 12)).toBeGreaterThan(textWidth('Max', 12))
    expect(endLabelWidth('Max', '1 012')).toBeGreaterThan(textWidth('Max', 12))
  })

  it('keeps the right margin at 64 px at least and grows it for long names, capped', () => {
    const short = rightMargin([{ name: 'Li', rating: '1 000' }], 343)
    expect(short).toBeGreaterThanOrEqual(64)
    const long = rightMargin([{ name: 'Alexandre', rating: '1 012' }], 343)
    expect(long).toBeGreaterThan(short)
    expect(long).toBeLessThanOrEqual(Math.round(343 * 0.38))
    expect(rightMargin([{ name: 'Maximilien-Alexandre', rating: '1 012' }], 343)).toBe(Math.round(343 * 0.38))
    expect(rightMargin([], 343)).toBe(64)
  })

  it('cuts a name that does not fit, with an ellipsis', () => {
    expect(fitName('Max', '1 012', 200)).toBe('Max')
    const cut = fitName('Maximilien-Alexandre', '1 012', 80)
    expect(cut.endsWith('…')).toBe(true)
    expect(endLabelWidth(cut, '1 012')).toBeLessThanOrEqual(80)
    expect(fitName('Maximilien', '1 012', 1)).toBe('M…')
  })

  it('nudges labels apart by the gap, keeps their order and the plot bounds', () => {
    expect(spreadLabels([100, 102, 104], 14, 0, 300)).toEqual([100, 114, 128])
    expect(spreadLabels([104, 100], 14, 0, 300)).toEqual([114, 100])
    expect(spreadLabels([295, 298], 14, 0, 300)).toEqual([286, 300])
    expect(spreadLabels([-20, 50], 14, 6, 300)).toEqual([6, 50])
    expect(spreadLabels([], 14, 0, 300)).toEqual([])
  })
})

describe('x ticks', () => {
  it('drops a day label that would overlap the previous one and keeps labels inside the chart', () => {
    const placed = placeTicks(
      [
        { index: 1, label: '12 oct.', at: 42 },
        { index: 2, label: '13 oct.', at: 50 },
        { index: 9, label: '14 oct.', at: 200 },
        { index: 10, label: '15 oct.', at: 340 },
      ],
      0,
      343,
      6,
    )
    expect(placed.map((tick) => tick.index)).toEqual([1, 9, 10])
    const last = placed[placed.length - 1]
    expect(last.center + textWidth(last.label, 11) / 2).toBeLessThanOrEqual(343)
    expect(last.at).toBe(340)
  })
})

describe('tooltip and keyboard', () => {
  it('opens on the right of the crosshair and flips left near the edge', () => {
    expect(tooltipLeft(50, 150, 343)).toBe(62)
    expect(tooltipLeft(250, 150, 343)).toBe(88)
    expect(tooltipLeft(100, 300, 343)).toBe(0)
  })

  it('moves the crosshair with the arrow keys from the latest match', () => {
    expect(stepIndex('ArrowLeft', null, 10)).toBe(10)
    expect(stepIndex('ArrowRight', null, 10)).toBe(10)
    expect(stepIndex('ArrowLeft', 5, 10)).toBe(4)
    expect(stepIndex('ArrowLeft', 1, 10)).toBe(1)
    expect(stepIndex('ArrowRight', 10, 10)).toBe(10)
    expect(stepIndex('Home', 5, 10)).toBe(1)
    expect(stepIndex('End', 5, 10)).toBe(10)
    expect(stepIndex('Escape', 5, 10)).toBeNull()
    expect(stepIndex('Tab', 5, 10)).toBeUndefined()
  })
})
