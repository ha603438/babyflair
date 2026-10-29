import { describe, expect, it } from 'vitest'
import { initialsOf, readPhotoUrl } from './avatar'

describe('readPhotoUrl', () => {
  it('keeps an https link', () => {
    const url = 'https://avatars.slack-edge.com/2024-12-23/1_abc_192.jpg'
    expect(readPhotoUrl(url)).toBe(url)
  })

  it('drops anything else', () => {
    expect(readPhotoUrl(undefined)).toBeUndefined()
    expect(readPhotoUrl(null)).toBeUndefined()
    expect(readPhotoUrl(42)).toBeUndefined()
    expect(readPhotoUrl('')).toBeUndefined()
    expect(readPhotoUrl('http://example.com/a.jpg')).toBeUndefined()
    expect(readPhotoUrl('javascript:alert(1)')).toBeUndefined()
    expect(readPhotoUrl(`https://example.com/${'a'.repeat(500)}`)).toBeUndefined()
  })
})

describe('initialsOf', () => {
  it('takes the first letter of the first and last words', () => {
    expect(initialsOf('Julien Fritz')).toBe('JF')
    expect(initialsOf('Jean-Paul de la Tour')).toBe('JT')
    expect(initialsOf('  édgar  ')).toBe('É')
  })

  it('keeps an emoji whole and falls back to « ? »', () => {
    expect(initialsOf('🦊 Renard')).toBe('🦊R')
    expect(initialsOf('   ')).toBe('?')
  })
})
