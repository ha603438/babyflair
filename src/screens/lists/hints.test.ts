import { describe, expect, it } from 'vitest'
import type { Settings } from '../../types'
import { installHint, isIosUserAgent, isSnoozed, notificationsHint, pickHint } from './hints'
import type { InstallEnv } from './hints'

const now = new Date('2026-10-12T10:00:00Z')
const DAY = 86_400_000
const daysAgo = (days: number): string => new Date(now.getTime() - days * DAY).toISOString()
const settings = (patch: Partial<Settings> = {}): Settings => ({ lastFormat: '2v2', lastTarget: 10, ...patch })

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

  it('never for a visitor, who cannot answer the appels', () => {
    expect(notificationsHint(installed, settings({ visitor: true }), now)).toBeNull()
  })
  it('respects the 30-day snooze and ranks between install and export', () => {
    expect(notificationsHint(installed, settings({ notifHintDismissedAt: daysAgo(5) }), now)).toBeNull()
    expect(notificationsHint(installed, settings({ notifHintDismissedAt: daysAgo(40) }), now)).toEqual({
      kind: 'notifications',
    })
    expect(pickHint(installed, settings(), now)).toEqual({ kind: 'notifications' })
    expect(pickHint(env({ userAgent: IOS, pushSupported: true }), settings(), now)).toEqual({ kind: 'install-ios' })
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

describe('pickHint', () => {
  it('shows the install hint first and never an export reminder on Classement', () => {
    expect(pickHint(env({ userAgent: IOS }), settings(), now)).toEqual({ kind: 'install-ios' })
    expect(pickHint(env(), settings(), now)).toBeNull()
    expect(pickHint(env(), settings({ lastExportAt: daysAgo(90) }), now)).toBeNull()
  })
})
