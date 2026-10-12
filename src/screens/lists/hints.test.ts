import { describe, expect, it } from 'vitest'
import type { Match, Settings } from '../../types'
import { exportHint, installHint, isIosUserAgent, isSnoozed, matchesSinceExport, notificationsHint, pickHint } from './hints'
import type { InstallEnv } from './hints'

const now = new Date('2026-10-12T10:00:00Z')
const DAY = 86_400_000
const daysAgo = (days: number): string => new Date(now.getTime() - days * DAY).toISOString()
const settings = (patch: Partial<Settings> = {}): Settings => ({ lastFormat: '2v2', lastTarget: 10, ...patch })
const match = (i: number, createdDaysAgo: number): Match => ({
  id: `m${i}`,
  seq: i,
  playedAt: daysAgo(createdDaysAgo),
  createdAt: daysAgo(createdDaysAgo),
  updatedAt: daysAgo(createdDaysAgo),
  target: 10,
  teamA: ['a', 'b'],
  teamB: ['c', 'd'],
  scoreA: 10,
  scoreB: 8,
})
const matches = (count: number, createdDaysAgo = 1): Match[] =>
  Array.from({ length: count }, (_, i) => match(i + 1, createdDaysAgo))

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'
const env = (patch: Partial<InstallEnv> = {}): InstallEnv => ({
  userAgent: DESKTOP,
  standalone: false,
  promptAvailable: false,
  pushSupported: false,
  ...patch,
})

describe('isIosUserAgent', () => {
  it('matches iPhone and iPad, not desktop', () => {
    expect(isIosUserAgent(IOS)).toBe(true)
    expect(isIosUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true)
    expect(isIosUserAgent(DESKTOP)).toBe(false)
  })
})

describe('isSnoozed', () => {
  it('snoozes for 30 days after a dismissal', () => {
    expect(isSnoozed(undefined, now)).toBe(false)
    expect(isSnoozed(daysAgo(10), now)).toBe(true)
    expect(isSnoozed(daysAgo(29.9), now)).toBe(true)
    expect(isSnoozed(daysAgo(30), now)).toBe(false)
    expect(isSnoozed('not a date', now)).toBe(false)
  })
})

describe('notificationsHint', () => {
  const installed = env({ standalone: true, pushSupported: true })
  it('offers notifications once installed with push support and not enabled', () => {
    expect(notificationsHint(installed, settings(), now)).toEqual({ kind: 'notifications' })
    expect(notificationsHint(installed, settings({ pushEnabled: true }), now)).toBeNull()
    expect(notificationsHint(env({ standalone: true }), settings(), now)).toBeNull()
    expect(notificationsHint(env({ pushSupported: true }), settings(), now)).toBeNull()
  })
  it('respects the 30-day snooze and ranks between install and export', () => {
    expect(notificationsHint(installed, settings({ notifHintDismissedAt: daysAgo(5) }), now)).toBeNull()
    expect(notificationsHint(installed, settings({ notifHintDismissedAt: daysAgo(40) }), now)).toEqual({
      kind: 'notifications',
    })
    expect(pickHint(installed, matches(40), settings(), now)).toEqual({ kind: 'notifications' })
    expect(pickHint(env({ userAgent: IOS, pushSupported: true }), matches(40), settings(), now)).toEqual({ kind: 'install-ios' })
  })
})

describe('installHint', () => {
  it('shows nothing when already installed', () => {
    expect(installHint(env({ userAgent: IOS, standalone: true }), settings(), now)).toBeNull()
    expect(installHint(env({ standalone: true, promptAvailable: true }), settings(), now)).toBeNull()
  })
  it('prefers the captured Chromium prompt, then iOS Safari, then nothing', () => {
    expect(installHint(env({ promptAvailable: true }), settings(), now)).toEqual({ kind: 'install-chromium' })
    expect(installHint(env({ userAgent: IOS }), settings(), now)).toEqual({ kind: 'install-ios' })
    expect(installHint(env(), settings(), now)).toBeNull()
  })
  it('respects the 30-day snooze', () => {
    expect(installHint(env({ userAgent: IOS }), settings({ installHintDismissedAt: daysAgo(5) }), now)).toBeNull()
    expect(installHint(env({ userAgent: IOS }), settings({ installHintDismissedAt: daysAgo(40) }), now)).toEqual({
      kind: 'install-ios',
    })
  })
})

describe('matchesSinceExport', () => {
  it('counts every match when never exported', () => {
    expect(matchesSinceExport(matches(5), undefined)).toBe(5)
    expect(matchesSinceExport(matches(5), 'garbage')).toBe(5)
  })
  it('counts only matches created strictly after the export', () => {
    const list = [match(1, 10), match(2, 5), match(3, 1)]
    expect(matchesSinceExport(list, daysAgo(5))).toBe(1)
    expect(matchesSinceExport(list, daysAgo(0))).toBe(0)
  })
})

describe('exportHint', () => {
  it('nudges after 30 matches since the last export', () => {
    expect(exportHint(matches(30), settings(), now)).toEqual({ kind: 'export', count: 30 })
    expect(exportHint(matches(29), settings(), now)).toBeNull()
  })
  it('nudges after 30 days with at least one match since', () => {
    expect(exportHint(matches(1), settings({ lastExportAt: daysAgo(31) }), now)).toEqual({ kind: 'export', count: 1 })
    expect(exportHint([match(1, 40)], settings({ lastExportAt: daysAgo(31) }), now)).toBeNull()
    expect(exportHint(matches(5), settings({ lastExportAt: daysAgo(10) }), now)).toBeNull()
  })
  it('respects the snooze', () => {
    expect(exportHint(matches(50), settings({ exportHintDismissedAt: daysAgo(1) }), now)).toBeNull()
  })
})

describe('pickHint', () => {
  it('shows the install hint before the export nudge', () => {
    expect(pickHint(env({ userAgent: IOS }), matches(50), settings(), now)).toEqual({ kind: 'install-ios' })
    expect(pickHint(env(), matches(50), settings(), now)).toEqual({ kind: 'export', count: 50 })
    expect(pickHint(env(), matches(3), settings(), now)).toBeNull()
  })
})
