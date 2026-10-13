import { describe, expect, it, vi } from 'vitest'
import { applyUpdate, checkForUpdate, entryOf, isUpdateAvailable, outcomeFor } from './update'
import type { UpdateDeps } from './update'

function deps(current: string | null, latest: string | null) {
  const reload = vi.fn<() => void>()
  const unregisterWorkers = vi.fn<() => Promise<void>>(async () => undefined)
  const value: UpdateDeps = { currentEntry: () => current, latestEntry: async () => latest, unregisterWorkers, reload }
  return { ...value, reload, unregisterWorkers }
}

describe('update', () => {
  it('reads the entry script from html or a url', () => {
    expect(entryOf('<script type="module" src="/babyflair/assets/index-DYWTFxCy.js"></script>')).toBe(
      'assets/index-DYWTFxCy.js',
    )
    expect(entryOf('https://x/babyflair/assets/index-a_b-1.js')).toBe('assets/index-a_b-1.js')
    expect(entryOf('<html></html>')).toBeNull()
  })

  it('decides from both entries', () => {
    expect(outcomeFor('assets/index-a.js', 'assets/index-a.js')).toBe('latest')
    expect(outcomeFor('assets/index-a.js', 'assets/index-b.js')).toBe('reloading')
    expect(outcomeFor(null, 'assets/index-b.js')).toBe('reloading')
    expect(outcomeFor('assets/index-a.js', null)).toBe('offline')
  })

  it('unregisters the workers and reloads when the deployed version differs', async () => {
    const d = deps('assets/index-a.js', 'assets/index-b.js')
    expect(await checkForUpdate(d)).toBe('reloading')
    expect(d.unregisterWorkers).toHaveBeenCalled()
    expect(d.reload).toHaveBeenCalled()
  })

  it('does nothing when already up to date or offline', async () => {
    const same = deps('assets/index-a.js', 'assets/index-a.js')
    expect(await checkForUpdate(same)).toBe('latest')
    expect(same.reload).not.toHaveBeenCalled()
    const offline = deps('assets/index-a.js', null)
    expect(await checkForUpdate(offline)).toBe('offline')
    expect(offline.reload).not.toHaveBeenCalled()
  })
})

describe('update banner helpers', () => {
  it('reports an available update only when the entries differ', async () => {
    expect(await isUpdateAvailable(deps('assets/index-a.js', 'assets/index-b.js'))).toBe(true)
    expect(await isUpdateAvailable(deps('assets/index-a.js', 'assets/index-a.js'))).toBe(false)
    expect(await isUpdateAvailable(deps('assets/index-a.js', null))).toBe(false)
  })
  it('applies by unregistering then reloading', async () => {
    const d = deps('assets/index-a.js', 'assets/index-b.js')
    await applyUpdate(d)
    expect(d.unregisterWorkers).toHaveBeenCalled()
    expect(d.reload).toHaveBeenCalled()
  })
})
