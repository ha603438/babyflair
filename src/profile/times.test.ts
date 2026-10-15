import { describe, expect, it } from 'vitest'
import type { Player } from '../types'
import { showsTimes, TIME_VIEWER_IDS } from './times'

const owner: Player = { id: [...TIME_VIEWER_IDS][0], name: 'Owner', isGuest: false, createdAt: '2026-10-01T08:00:00Z' }
const other: Player = { id: 'p-other', name: 'Other', isGuest: false, createdAt: '2026-10-01T08:00:00Z' }

describe('showsTimes', () => {
  it('shows times to the owner profile only', () => {
    expect(showsTimes({ kind: 'player', player: owner })).toBe(true)
    expect(showsTimes({ kind: 'player', player: other })).toBe(false)
  })

  it('hides times from visitors and phones without a profile', () => {
    expect(showsTimes({ kind: 'visitor' })).toBe(false)
    expect(showsTimes({ kind: 'none' })).toBe(false)
  })
})
