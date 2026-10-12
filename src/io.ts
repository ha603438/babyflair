// Réglages helpers (spec §3.8): export file naming and envelope, share-vs-download decision, import parsing,
// export nudge counting, standalone / install-prompt detection. Everything that touches the browser takes its
// navigator / document / URL as parameters so it can be unit-tested in node with stand-ins.
import { daysSince, fmtRelative, plural } from './format'
import type { ImportResult } from './stats'
import { buildExport, matchesSinceExport, validateImport } from './stats'

export { matchesSinceExport }
import type { Match, Store } from './types'

export const APP_VERSION = '1.0.0'
export const EXPORT_MIME = 'application/json'

const EXPORT_NUDGE_MATCHES = 30
const EXPORT_NUDGE_DAYS = 30
/** Safari needs the object URL alive until the download has started; a second is plenty. */
const REVOKE_DELAY_MS = 1000
const INVALID_FILE_REASON = "Ce n'est pas un export BabyFlair."

export type ImportOk = Extract<ImportResult, { ok: true }>

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function parseTime(iso: string | undefined): number | null {
  if (iso === undefined) return null
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return null
  return time
}

// ---------------------------------------------------------------------------
// Export: file name, envelope text, nudge
// ---------------------------------------------------------------------------

/** `babyflair-AAAA-MM-JJ.json`, local date. */
export function exportFileName(now: Date): string {
  return `babyflair-${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.json`
}

/** The export envelope (stats.buildExport) as 2-space JSON with a trailing newline. */
export function buildExportText(store: Store, now: Date): string {
  return `${JSON.stringify(buildExport(store, now), null, 2)}\n`
}

/** ≥ 30 matches since the last export, or ≥ 30 days since it (spec §3.8: caption in --warn). */
export function isExportOverdue(matches: Match[], lastExportAt: string | undefined, now: Date): boolean {
  if (matchesSinceExport(matches, lastExportAt) >= EXPORT_NUDGE_MATCHES) return true
  if (parseTime(lastExportAt) === null) return false
  return daysSince(lastExportAt as string, now) >= EXPORT_NUDGE_DAYS
}

/** « Fichier JSON · dernier export il y a 12 j » / « Fichier JSON · jamais exporté ». */
export function exportCaption(lastExportAt: string | undefined, now: Date): string {
  if (parseTime(lastExportAt) === null) return 'Fichier JSON · jamais exporté'
  return `Fichier JSON · dernier export ${fmtRelative(lastExportAt as string, now)}`
}

// ---------------------------------------------------------------------------
// Export delivery: navigator.share({ files }) when the browser can, else <a download> with an object URL
// ---------------------------------------------------------------------------

export type ShareFiles = { files: File[] }
export type ShareNavigatorLike = {
  canShare?: (data: ShareFiles) => boolean
  share?: (data: ShareFiles) => Promise<void>
}
export type AnchorLike = { href: string; download: string; rel: string; click(): void }
export type DocumentLike = { createElement(tag: 'a'): AnchorLike }
export type ObjectUrlLike = { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void }
export type ExportEnv = { navigator: ShareNavigatorLike; document: DocumentLike; url: ObjectUrlLike }
export type ExportMethod = 'share' | 'download'
export type ExportOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * The bound share function when `navigator.canShare({ files })` is true, otherwise null. Both Web Share methods
 * must be invoked on the navigator itself (« Illegal invocation » otherwise), hence the explicit binding.
 */
export function shareFilesWith(nav: ShareNavigatorLike, files: File[]): ((data: ShareFiles) => Promise<void>) | null {
  const { share, canShare } = nav
  if (typeof share !== 'function' || typeof canShare !== 'function') return null
  try {
    if (canShare.call(nav, { files }) !== true) return null
  } catch {
    return null
  }
  return (data) => share.call(nav, data)
}

export function chooseExportMethod(nav: ShareNavigatorLike, files: File[]): ExportMethod {
  if (shareFilesWith(nav, files) === null) return 'download'
  return 'share'
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  return (error as { name?: unknown }).name === 'AbortError'
}

/** Programmatic download through a detached anchor (no DOM insertion needed in current browsers). */
export function downloadFile(file: File, doc: DocumentLike, url: ObjectUrlLike): void {
  const href = url.createObjectURL(file)
  const anchor = doc.createElement('a')
  anchor.href = href
  anchor.download = file.name
  anchor.rel = 'noopener'
  anchor.click()
  setTimeout(() => url.revokeObjectURL(href), REVOKE_DELAY_MS)
}

/**
 * Shares the file when possible (the share call happens synchronously, inside the tap's user activation), falls
 * back to the download when sharing is unavailable or fails for a reason other than the user cancelling.
 */
export async function deliverExport(file: File, env: ExportEnv): Promise<ExportOutcome> {
  const share = shareFilesWith(env.navigator, [file])
  if (share !== null) {
    try {
      await share({ files: [file] })
      return 'shared'
    } catch (error) {
      if (isAbortError(error)) return 'cancelled'
    }
  }
  downloadFile(file, env.document, env.url)
  return 'downloaded'
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** JSON.parse guarded, then stats.validateImport. */
export function parseImport(text: string): ImportResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, reason: INVALID_FILE_REASON }
  }
  return validateImport(json)
}

type Counts = { players: readonly unknown[]; matches: readonly unknown[] }

/** « 12 joueurs, 48 matchs. Les données actuelles (10 joueurs, 31 matchs) seront remplacées. » */
export function importSummary(incoming: Counts, current: Counts): string {
  const next = `${plural(incoming.players.length, 'joueur')}, ${plural(incoming.matches.length, 'match')}`
  const now = `${plural(current.players.length, 'joueur')}, ${plural(current.matches.length, 'match')}`
  return `${next}. Les données actuelles (${now}) seront remplacées.`
}

// ---------------------------------------------------------------------------
// Footer, standalone detection, captured install prompt
// ---------------------------------------------------------------------------

/** « BabyFlair 1.0.0 · 12 joueurs · 148 matchs · données sur cet appareil uniquement » */
export function settingsFooter(store: Counts): string {
  const players = plural(store.players.length, 'joueur')
  const matches = plural(store.matches.length, 'match')
  return `BabyFlair ${APP_VERSION} · ${players} · ${matches} · données sur cet appareil uniquement`
}

export type StandaloneEnv = {
  matchMedia?: (query: string) => { matches: boolean }
  navigator?: { standalone?: boolean; userAgent?: string }
}

/** Installed PWA: `display-mode: standalone` (Chromium, iOS 16.4+) or the legacy iOS `navigator.standalone`. */
export function isStandalone(env: StandaloneEnv): boolean {
  if (env.navigator?.standalone === true) return true
  if (typeof env.matchMedia !== 'function') return false
  try {
    return env.matchMedia('(display-mode: standalone)').matches
  } catch {
    return false
  }
}
