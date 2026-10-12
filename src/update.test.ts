import { describe, expect, it, vi } from 'vitest'
import { checkForUpdate, outcomeFor } from './update'

const reg = (waiting: boolean, installing = false) => ({
  update: vi.fn(async () => undefined),
  waiting: waiting ? { postMessage: vi.fn() } : null,
  installing: installing ? {} : null,
})

describe('update', () => {
  it('decides from the registration state', () => {
    expect(outcomeFor(undefined)).toBe('unsupported')
    expect(outcomeFor(reg(false))).toBe('latest')
    expect(outcomeFor(reg(true))).toBe('reloading')
    expect(outcomeFor(reg(false, true))).toBe('reloading')
  })

  it('checks, skips waiting and reloads when a new worker exists', async () => {
    vi.useFakeTimers()
    const r = reg(true)
    const reload = vi.fn()
    expect(await checkForUpdate(async () => r, reload)).toBe('reloading')
    expect(r.update).toHaveBeenCalled()
    expect(r.waiting?.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    vi.runAllTimers()
    expect(reload).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does not reload when already up to date', async () => {
    const reload = vi.fn()
    expect(await checkForUpdate(async () => reg(false), reload)).toBe('latest')
    expect(reload).not.toHaveBeenCalled()
  })
})
