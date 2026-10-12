import { afterEach, describe, expect, it, vi } from 'vitest'

import { fmtRelative } from './format'
import type { AnchorLike, ShareFiles, ShareNavigatorLike } from './io'
import {
  APP_VERSION,
  buildExportText,
  chooseExportMethod,
  deliverExport,
  downloadFile,
  exportCaption,
  exportFileName,
  importSummary,
  isExportOverdue,
  isStandalone,
  matchesSinceExport,
  parseImport,
  settingsFooter,
  shareFilesWith,
} from './io'
import type { Match, Player, Store } from './types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2025-10-10T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString()
}

function player(id: string, name: string): Player {
  return { id, name, isGuest: false, createdAt: daysAgo(100) }
}

function matchAt(id: string, seq: number, createdDaysAgo: number): Match {
  const at = daysAgo(createdDaysAgo)
  return {
    id,
    seq,
    playedAt: at,
    createdAt: at,
    updatedAt: at,
    target: 10,
    teamA: ['a'],
    teamB: ['b'],
    scoreA: 10,
    scoreB: 7,
  }
}

/** `count` matches all created at NOW. */
function recent(count: number): Match[] {
  return Array.from({ length: count }, (_, i) => matchAt(`m${i + 1}`, i + 1, 0))
}

function storeOf(players: Player[], matches: Match[], lastExportAt?: string): Store {
  return { version: 1, players, matches, settings: { lastFormat: '2v2', lastTarget: 10, lastExportAt }, nextSeq: 9 }
}

function arr(length: number): unknown[] {
  return Array.from({ length })
}

type Envelope = { players: unknown[]; matches: Array<{ id: string }>; settings: { lastFormat: string } }

function jsonFile(): File {
  return new File(['{}\n'], 'babyflair-2025-10-10.json', { type: 'application/json' })
}

type FakeAnchor = AnchorLike & { clicks: number }

function fakeDocument(): { doc: { createElement(tag: 'a'): AnchorLike }; anchors: FakeAnchor[] } {
  const anchors: FakeAnchor[] = []
  const doc = {
    createElement: (): AnchorLike => {
      const anchor: FakeAnchor = {
        href: '',
        download: '',
        rel: '',
        clicks: 0,
        click() {
          anchor.clicks += 1
        },
      }
      anchors.push(anchor)
      return anchor
    },
  }
  return { doc, anchors }
}

function fakeUrl(): {
  api: { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void }
  created: Blob[]
  revoked: string[]
} {
  const created: Blob[] = []
  const revoked: string[] = []
  return {
    created,
    revoked,
    api: {
      createObjectURL(blob: Blob): string {
        created.push(blob)
        return `blob:${created.length}`
      },
      revokeObjectURL(url: string): void {
        revoked.push(url)
      },
    },
  }
}

type RecordingNavigator = ShareNavigatorLike & { calls: ShareFiles[] }

function sharingNavigator(failure?: unknown): RecordingNavigator {
  return {
    calls: [],
    canShare: () => true,
    share(data) {
      this.calls.push(data)
      if (failure !== undefined) return Promise.reject(failure)
      return Promise.resolve()
    },
  }
}

const alice = player('a', 'Alice')
const bob = player('b', 'Bob')

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// File name & envelope
// ---------------------------------------------------------------------------

describe('exportFileName', () => {
  it('uses the local calendar date, zero-padded', () => {
    expect(exportFileName(new Date(2025, 9, 6, 23, 59))).toBe('babyflair-2025-10-06.json')
    expect(exportFileName(new Date(2026, 0, 1, 0, 0))).toBe('babyflair-2026-01-01.json')
  })
})

describe('buildExportText', () => {
  const store = storeOf([alice, bob], [matchAt('m1', 1, 3), matchAt('m2', 2, 1)])

  it('serialises the envelope with 2-space indentation and a trailing newline', () => {
    const text = buildExportText(store, NOW)
    const head = '{\n  "app": "babyflair",\n  "version": 1,\n  "exportedAt": "2025-10-10T12:00:00.000Z"'
    expect(text.startsWith(head)).toBe(true)
    expect(text.endsWith('}\n')).toBe(true)
    const parsed = JSON.parse(text) as Envelope
    expect(parsed.players).toHaveLength(2)
    expect(parsed.matches.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(parsed.settings.lastFormat).toBe('2v2')
  })

  it('round-trips through parseImport', () => {
    const result = parseImport(buildExportText(store, NOW))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.players.map((p) => p.name)).toEqual(['Alice', 'Bob'])
    expect(result.matches.map((m) => m.seq)).toEqual([1, 2])
    expect(result.settings.lastTarget).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Export nudge
// ---------------------------------------------------------------------------

describe('matchesSinceExport', () => {
  const matches = [matchAt('m1', 1, 10), matchAt('m2', 2, 5), matchAt('m3', 3, 2)]

  it('counts every match when there was no export', () => {
    expect(matchesSinceExport(matches, undefined)).toBe(3)
  })

  it('counts only matches created strictly after the last export', () => {
    expect(matchesSinceExport(matches, daysAgo(5))).toBe(1)
    expect(matchesSinceExport(matches, daysAgo(1))).toBe(0)
  })

  it('treats an unparsable export date as never exported', () => {
    expect(matchesSinceExport(matches, 'hier')).toBe(3)
  })
})

describe('isExportOverdue', () => {
  it('is false with fewer than 30 new matches and a recent export', () => {
    expect(isExportOverdue(recent(29), daysAgo(1), NOW)).toBe(false)
  })

  it('is true from 30 new matches since the export', () => {
    expect(isExportOverdue(recent(30), daysAgo(1), NOW)).toBe(true)
  })

  it('is true from 30 days since the export, even without a new match', () => {
    expect(isExportOverdue([], daysAgo(29), NOW)).toBe(false)
    expect(isExportOverdue([], daysAgo(30), NOW)).toBe(true)
  })

  it('never exported: only the match count can trigger it', () => {
    expect(isExportOverdue(recent(29), undefined, NOW)).toBe(false)
    expect(isExportOverdue(recent(30), undefined, NOW)).toBe(true)
  })
})

describe('exportCaption', () => {
  it('reads « jamais exporté » without a usable date', () => {
    expect(exportCaption(undefined, NOW)).toBe('Fichier JSON · jamais exporté')
    expect(exportCaption('n/a', NOW)).toBe('Fichier JSON · jamais exporté')
  })

  it('appends the relative time of the last export', () => {
    const at = daysAgo(12)
    expect(exportCaption(at, NOW)).toBe(`Fichier JSON · dernier export ${fmtRelative(at, NOW)}`)
    expect(exportCaption(at, NOW)).toContain('12')
  })
})

// ---------------------------------------------------------------------------
// Share vs download
// ---------------------------------------------------------------------------

describe('shareFilesWith / chooseExportMethod', () => {
  const files = [jsonFile()]

  it('downloads when the navigator has no Web Share', () => {
    expect(shareFilesWith({}, files)).toBeNull()
    expect(chooseExportMethod({}, files)).toBe('download')
  })

  it('downloads when share exists but canShare is missing or refuses files', () => {
    const noCanShare: ShareNavigatorLike = { share: () => Promise.resolve() }
    expect(chooseExportMethod(noCanShare, files)).toBe('download')
    const refuses: ShareNavigatorLike = { share: () => Promise.resolve(), canShare: () => false }
    expect(chooseExportMethod(refuses, files)).toBe('download')
  })

  it('downloads when canShare throws', () => {
    const throwing: ShareNavigatorLike = {
      share: () => Promise.resolve(),
      canShare: () => {
        throw new TypeError('bad data')
      },
    }
    expect(chooseExportMethod(throwing, files)).toBe('download')
  })

  it('shares, calling share on the navigator with the files', async () => {
    const nav = sharingNavigator()
    expect(chooseExportMethod(nav, files)).toBe('share')
    const share = shareFilesWith(nav, files)
    await share?.({ files })
    expect(nav.calls).toEqual([{ files }])
  })
})

describe('downloadFile', () => {
  it('clicks a detached anchor with an object URL, revoked after a delay', () => {
    vi.useFakeTimers()
    const file = jsonFile()
    const { doc, anchors } = fakeDocument()
    const url = fakeUrl()
    downloadFile(file, doc, url.api)
    expect(anchors).toHaveLength(1)
    expect(anchors[0].href).toBe('blob:1')
    expect(anchors[0].download).toBe('babyflair-2025-10-10.json')
    expect(anchors[0].rel).toBe('noopener')
    expect(anchors[0].clicks).toBe(1)
    expect(url.created).toEqual([file])
    expect(url.revoked).toEqual([])
    vi.runAllTimers()
    expect(url.revoked).toEqual(['blob:1'])
  })
})

describe('deliverExport', () => {
  it('shares when the navigator can, without any download', async () => {
    const nav = sharingNavigator()
    const { doc, anchors } = fakeDocument()
    const file = jsonFile()
    const outcome = await deliverExport(file, { navigator: nav, document: doc, url: fakeUrl().api })
    expect(outcome).toBe('shared')
    expect(nav.calls).toEqual([{ files: [file] }])
    expect(anchors).toHaveLength(0)
  })

  it('reports a cancelled share sheet and downloads nothing', async () => {
    const nav = sharingNavigator(new DOMException('cancelled', 'AbortError'))
    const { doc, anchors } = fakeDocument()
    const outcome = await deliverExport(jsonFile(), { navigator: nav, document: doc, url: fakeUrl().api })
    expect(outcome).toBe('cancelled')
    expect(anchors).toHaveLength(0)
  })

  it('falls back to the download when sharing fails for another reason', async () => {
    const nav = sharingNavigator(new Error('not allowed'))
    const { doc, anchors } = fakeDocument()
    const outcome = await deliverExport(jsonFile(), { navigator: nav, document: doc, url: fakeUrl().api })
    expect(outcome).toBe('downloaded')
    expect(anchors).toHaveLength(1)
    expect(anchors[0].clicks).toBe(1)
  })

  it('downloads when there is no Web Share at all', async () => {
    const { doc, anchors } = fakeDocument()
    const outcome = await deliverExport(jsonFile(), { navigator: {}, document: doc, url: fakeUrl().api })
    expect(outcome).toBe('downloaded')
    expect(anchors).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

describe('parseImport', () => {
  it('rejects text that is not JSON with the spec copy', () => {
    const result = parseImport('{not json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("Ce n'est pas un export BabyFlair.")
  })

  it('rejects JSON that is not a BabyFlair export', () => {
    expect(parseImport('{"app":"other","version":1}').ok).toBe(false)
    expect(parseImport('[]').ok).toBe(false)
    expect(parseImport('null').ok).toBe(false)
  })
})

describe('importSummary', () => {
  it('builds the confirmation body with both counts', () => {
    const body = importSummary({ players: arr(12), matches: arr(48) }, { players: arr(10), matches: arr(31) })
    expect(body).toBe('12 joueurs, 48 matchs. Les données actuelles (10 joueurs, 31 matchs) seront remplacées.')
  })

  it('keeps the French singular for 0 and 1', () => {
    const body = importSummary({ players: arr(1), matches: arr(0) }, { players: arr(0), matches: arr(1) })
    expect(body).toBe('1 joueur, 0 match. Les données actuelles (0 joueur, 1 match) seront remplacées.')
  })
})

// ---------------------------------------------------------------------------
// Footer, standalone, install prompt
// ---------------------------------------------------------------------------

describe('settingsFooter', () => {
  it('shows the version and both counts', () => {
    expect(APP_VERSION).toBe('1.0.0')
    const text = settingsFooter({ players: arr(12), matches: arr(148) })
    expect(text).toBe('BabyFlair 1.0.0 · 12 joueurs · 148 matchs · données sur cet appareil uniquement')
  })

  it('uses the singular for 1', () => {
    expect(settingsFooter({ players: arr(1), matches: arr(0) })).toContain('· 1 joueur · 0 match ·')
  })
})

describe('isStandalone', () => {
  it('is false without any signal', () => {
    expect(isStandalone({})).toBe(false)
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigator: { userAgent: 'x' } })).toBe(false)
  })

  it('detects the display-mode media query', () => {
    const queries: string[] = []
    const env = {
      matchMedia: (query: string) => {
        queries.push(query)
        return { matches: true }
      },
    }
    expect(isStandalone(env)).toBe(true)
    expect(queries).toEqual(['(display-mode: standalone)'])
  })

  it('detects the legacy iOS navigator.standalone', () => {
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } })).toBe(true)
  })

  it('survives a throwing matchMedia', () => {
    const env = {
      matchMedia: () => {
        throw new Error('unsupported')
      },
    }
    expect(isStandalone(env)).toBe(false)
  })
})

describe('mode partagé', () => {
  it('settingsFooter describes the shared data and the last sync', () => {
    const now = new Date('2025-10-06T12:00:00.000Z')
    const counts = { players: [1, 2], matches: [1] }
    expect(settingsFooter(counts, { now })).toContain('· données partagées · pas encore synchronisé')
    const lastSyncAt = '2025-10-06T11:58:00.000Z'
    expect(settingsFooter(counts, { lastSyncAt, now })).toContain(
      `· données partagées · dernière synchro ${fmtRelative(lastSyncAt, now)}`,
    )
  })

  it('buildExportText never includes the office code', () => {
    const store = {
      version: 1 as const,
      players: [],
      matches: [],
      settings: { lastFormat: '2v2' as const, lastTarget: 10 as const, officeCode: 'secret' },
      nextSeq: 1,
    }
    const text = buildExportText(store, new Date('2025-10-06T12:00:00.000Z'))
    expect(text).not.toContain('secret')
    expect(text).not.toContain('officeCode')
    expect(JSON.parse(text).settings).toEqual({ lastFormat: '2v2', lastTarget: 10 })
  })
})
