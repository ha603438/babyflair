import { describe, expect, it } from 'vitest'
import { CHANGELOG, latestChangelogId, unseenEntries } from './changelog'

describe('changelog', () => {
  it('is newest first with unique ids', () => {
    const ids = CHANGELOG.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort().reverse()).toEqual(ids)
  })
  it('counts unseen entries', () => {
    expect(unseenEntries({})).toHaveLength(CHANGELOG.length)
    expect(unseenEntries({ seenChangelogId: CHANGELOG[0].id })).toHaveLength(0)
    expect(unseenEntries({ seenChangelogId: CHANGELOG[1].id })).toHaveLength(1)
    expect(unseenEntries({ seenChangelogId: 'inconnu' })).toHaveLength(CHANGELOG.length)
    expect(latestChangelogId()).toBe(CHANGELOG[0].id)
  })
})
