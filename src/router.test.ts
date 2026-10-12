import { useSyncExternalStore } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { back, hrefOf, navigate, parseHash, useRoute, type Route } from './router'

// vitest runs in a node environment (no DOM): React's hook is replaced by a pass-through that
// records its arguments, so subscribe/getSnapshot can be exercised without rendering.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useSyncExternalStore: vi.fn((_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot()),
  }
})

class FakeWindow extends EventTarget {
  location = { hash: '' }
  history = { back: vi.fn() }
}

function installWindow(hash = ''): FakeWindow {
  const fake = new FakeWindow()
  fake.location.hash = hash
  vi.stubGlobal('window', fake)
  return fake
}

const CLASSEMENT: Route = { name: 'classement' }

describe('parseHash', () => {
  it.each([
    ['', CLASSEMENT],
    ['#', CLASSEMENT],
    ['#/', CLASSEMENT],
    ['/', CLASSEMENT],
    ['#/match', { name: 'match' }],
    ['match', { name: 'match' }],
    ['/match', { name: 'match' }],
    ['#/match/', { name: 'match' }],
    ['#/match/m1/modifier', { name: 'match-edit', id: 'm1' }],
    ['match/m1/modifier', { name: 'match-edit', id: 'm1' }],
    ['#/appel/c1', { name: 'appel', id: 'c1' }],
    ['#/appel', CLASSEMENT],
    ['#/appel/c1/extra', CLASSEMENT],
    ['#/historique', { name: 'historique' }],
    ['#/historique/', { name: 'historique' }],
    ['#/historique/m1', { name: 'match-detail', id: 'm1' }],
    ['#/joueurs', { name: 'joueurs' }],
    ['#/joueurs?add=1', { name: 'joueurs', add: true }],
    ['joueurs?add=1', { name: 'joueurs', add: true }],
    ['#/joueurs?add=0', { name: 'joueurs' }],
    ['#/joueurs?autre=1', { name: 'joueurs' }],
    ['#/joueurs/p1', { name: 'joueur', id: 'p1' }],
    ['#/joueurs/p1?add=1', { name: 'joueur', id: 'p1' }],
    ['#/reglages', { name: 'reglages' }],
    ['#/comment-ca-marche', { name: 'comment-ca-marche' }],
  ] satisfies Array<[string, Route]>)('parses %j', (hash, expected) => {
    expect(parseHash(hash)).toEqual(expected)
  })

  it.each([
    '#/inconnu',
    '#/match/m1',
    '#/match/m1/supprimer',
    '#/match/m1/modifier/extra',
    '#/historique/m1/extra',
    '#/joueurs/p1/extra',
    '#/reglages/extra',
    '#/comment-ca-marche/extra',
    '#/Match',
    '#//inconnu',
  ])('falls back to classement for %j', (hash) => {
    expect(parseHash(hash)).toEqual(CLASSEMENT)
  })

  it('decodes percent-encoded ids', () => {
    expect(parseHash('#/joueurs/a%20b')).toEqual({ name: 'joueur', id: 'a b' })
    expect(parseHash('#/historique/%C3%A9')).toEqual({ name: 'match-detail', id: 'é' })
  })

  it('keeps a malformed percent sequence as is', () => {
    expect(parseHash('#/joueurs/%E0')).toEqual({ name: 'joueur', id: '%E0' })
  })

  it('never returns the add flag when it is not set', () => {
    expect(parseHash('#/joueurs')).not.toHaveProperty('add')
  })
})

describe('hrefOf', () => {
  it.each([
    [{ name: 'classement' }, '#/'],
    [{ name: 'match' }, '#/match'],
    [{ name: 'match-edit', id: 'm1' }, '#/match/m1/modifier'],
    [{ name: 'historique' }, '#/historique'],
    [{ name: 'match-detail', id: 'm1' }, '#/historique/m1'],
    [{ name: 'joueurs' }, '#/joueurs'],
    [{ name: 'joueurs', add: false }, '#/joueurs'],
    [{ name: 'joueurs', add: true }, '#/joueurs?add=1'],
    [{ name: 'joueur', id: 'p1' }, '#/joueurs/p1'],
    [{ name: 'reglages' }, '#/reglages'],
    [{ name: 'comment-ca-marche' }, '#/comment-ca-marche'],
    [{ name: 'appel', id: 'c 1' }, '#/appel/c%201'],
  ] satisfies Array<[Route, string]>)('builds %j', (route, expected) => {
    expect(hrefOf(route)).toBe(expected)
  })

  it('encodes ids', () => {
    expect(hrefOf({ name: 'joueur', id: 'a b/c' })).toBe('#/joueurs/a%20b%2Fc')
  })

  it('round-trips through parseHash', () => {
    const routes: Route[] = [
      { name: 'classement' },
      { name: 'match' },
      { name: 'match-edit', id: 'abc-123' },
      { name: 'historique' },
      { name: 'match-detail', id: 'abc-123' },
      { name: 'joueurs' },
      { name: 'joueurs', add: true },
      { name: 'joueur', id: 'a b/c' },
      { name: 'reglages' },
      { name: 'comment-ca-marche' },
    ]
    for (const route of routes) {
      expect(parseHash(hrefOf(route))).toEqual(route)
    }
  })
})

describe('navigate / back', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('navigate sets location.hash', () => {
    const fake = installWindow('#/')
    navigate({ name: 'joueur', id: 'p1' })
    expect(fake.location.hash).toBe('#/joueurs/p1')
    navigate({ name: 'classement' })
    expect(fake.location.hash).toBe('#/')
  })

  it('back calls history.back', () => {
    const fake = installWindow()
    back()
    expect(fake.history.back).toHaveBeenCalledTimes(1)
  })
})

describe('useRoute', () => {
  const hook = vi.mocked(useSyncExternalStore)

  beforeEach(() => {
    hook.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function lastHookArgs(): { subscribe: (onChange: () => void) => () => void; getSnapshot: () => Route } {
    const call = hook.mock.calls.at(-1)
    if (call === undefined) throw new Error('useSyncExternalStore was not called')
    return {
      subscribe: call[0] as (onChange: () => void) => () => void,
      getSnapshot: call[1] as () => Route,
    }
  }

  it('returns the route parsed from location.hash', () => {
    installWindow('#/historique/m1')
    expect(useRoute()).toEqual({ name: 'match-detail', id: 'm1' })
  })

  it('passes the same reader as client and server snapshot', () => {
    installWindow('#/match')
    useRoute()
    const call = hook.mock.calls.at(-1)
    expect(call?.[1]).toBe(call?.[2])
  })

  it('returns a stable snapshot while the hash is unchanged', () => {
    installWindow('#/joueurs?add=1')
    const first = useRoute()
    const second = useRoute()
    expect(first).toBe(second)
    expect(first).toEqual({ name: 'joueurs', add: true })
  })

  it('returns a new route after the hash changes', () => {
    const fake = installWindow('#/reglages')
    expect(useRoute()).toEqual({ name: 'reglages' })
    fake.location.hash = '#/comment-ca-marche'
    expect(useRoute()).toEqual({ name: 'comment-ca-marche' })
  })

  it('subscribes to hashchange and unsubscribes on cleanup', () => {
    const fake = installWindow('#/')
    useRoute()
    const { subscribe, getSnapshot } = lastHookArgs()
    const onChange = vi.fn()
    const unsubscribe = subscribe(onChange)

    fake.location.hash = '#/match'
    fake.dispatchEvent(new Event('hashchange'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(getSnapshot()).toEqual({ name: 'match' })

    unsubscribe()
    fake.dispatchEvent(new Event('hashchange'))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('falls back to classement without a window', () => {
    vi.unstubAllGlobals()
    expect(useRoute()).toEqual(CLASSEMENT)
  })
})
