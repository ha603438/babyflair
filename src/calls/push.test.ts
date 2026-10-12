import { describe, expect, it } from 'vitest'
import {
  pushSupport,
  shouldOfferPush,
  subscriptionInput,
  unsupportedCopy,
  urlBase64ToUint8Array,
  vapidPublicKey,
} from './push'
import { hashOf, isNavigateMessage } from './swClient'

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'

describe('pushSupport', () => {
  it('ok whenever PushManager exists, iOS copy when not installed, unsupported otherwise', () => {
    expect(pushSupport({ userAgent: ANDROID, standalone: false, pushManager: true })).toBe('ok')
    expect(pushSupport({ userAgent: IOS, standalone: true, pushManager: true })).toBe('ok')
    expect(pushSupport({ userAgent: IOS, standalone: false, pushManager: false })).toBe('ios-not-installed')
    expect(pushSupport({ userAgent: IOS, standalone: true, pushManager: false })).toBe('unsupported')
    expect(pushSupport({ userAgent: ANDROID, standalone: false, pushManager: false })).toBe('unsupported')
  })

  it('maps to the Réglages copy', () => {
    expect(unsupportedCopy('ok')).toBeNull()
    expect(unsupportedCopy('ios-not-installed')).toBe("Installe d'abord l'app sur l'écran d'accueil (iOS 16.4+)")
    expect(unsupportedCopy('unsupported')).toBe('Non pris en charge sur ce navigateur')
  })
})

describe('shouldOfferPush', () => {
  it('only when installed, supported and not enabled yet', () => {
    const env = { userAgent: ANDROID, standalone: true, pushManager: true }
    expect(shouldOfferPush(env, undefined)).toBe(true)
    expect(shouldOfferPush(env, false)).toBe(true)
    expect(shouldOfferPush(env, true)).toBe(false)
    expect(shouldOfferPush({ ...env, standalone: false }, undefined)).toBe(false)
    expect(shouldOfferPush({ ...env, pushManager: false }, undefined)).toBe(false)
  })
})

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url with and without padding', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3])
    expect(Array.from(urlBase64ToUint8Array('AQI'))).toEqual([1, 2])
    // '-' and '_' are the url-safe forms of '+' and '/'.
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })

  it('decodes a real VAPID key to 65 bytes starting with 0x04', () => {
    const key = 'BFVFtuU4dwV4wwiR_Gx1Bo5u5EnLz5fhTyr5CRzHxSw7QywnRaNlx4Hz-E3_MABlZfaN3xRb-wUIhOy3MWsaE0Q'
    const bytes = urlBase64ToUint8Array(key)
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(4)
  })
})

describe('subscriptionInput', () => {
  it('maps the browser JSON to the server row, player optional', () => {
    const json = { endpoint: 'https://push/x', keys: { p256dh: 'P', auth: 'A' } }
    expect(subscriptionInput(json, 'alice')).toEqual({ endpoint: 'https://push/x', p256dh: 'P', auth: 'A', playerId: 'alice' })
    expect(subscriptionInput(json, undefined)?.playerId).toBeNull()
    expect(subscriptionInput({ endpoint: 'x' }, 'alice')).toBeNull()
    expect(subscriptionInput({ keys: { p256dh: 'P', auth: 'A' } }, 'alice')).toBeNull()
  })
})

describe('vapidPublicKey', () => {
  it('is null when absent or blank', () => {
    expect(vapidPublicKey({})).toBeNull()
    expect(vapidPublicKey({ VITE_VAPID_PUBLIC_KEY: '  ' })).toBeNull()
    expect(vapidPublicKey({ VITE_VAPID_PUBLIC_KEY: ' k ' })).toBe('k')
  })
})

describe('service worker messages', () => {
  it('recognises the navigate message only', () => {
    expect(isNavigateMessage({ type: 'navigate', url: 'x' })).toBe(true)
    expect(isNavigateMessage({ type: 'navigate' })).toBe(false)
    expect(isNavigateMessage(null)).toBe(false)
    expect(isNavigateMessage('navigate')).toBe(false)
  })

  it('extracts the hash of the notification url', () => {
    const base = 'https://ha603438.github.io/babyflair/'
    expect(hashOf('https://ha603438.github.io/babyflair/#/appel/c1', base)).toBe('#/appel/c1')
    expect(hashOf('#/appel/c1', base)).toBe('#/appel/c1')
    expect(hashOf('https://ha603438.github.io/babyflair/', base)).toBeNull()
    expect(hashOf('::', '::')).toBeNull()
  })
})
