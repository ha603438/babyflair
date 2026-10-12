# BabyFlair — foundation report (integration phase)

State at the end of the foundation phase: `tsc -p tsconfig.app.json` 0 errors, `oxlint` 0 diagnostics, `vitest` 13 files /
276 tests green, `vite build` produces `dist/` (JS 239 kB / 75 kB gzip, CSS 23 kB / 5 kB gzip, 20 precached entries).

## File map

### App shell (integrator)
- `index.html` — spec §10 head: viewport with `interactive-widget=resizes-content`, two `theme-color` metas (light / dark), `apple-mobile-web-app-status-bar-style=default`; manifest link left to vite-plugin-pwa.
- `vite.config.ts` — `manifest.background_color` → `#f6f7f5`; `workbox.navigateFallback` + `globPatterns` from §10. Nothing else changed.
- `src/main.tsx` — unchanged scaffold: `<App />` in StrictMode with `./index.css`.
- `src/App.tsx` — default export `App` = `AppStateProvider` wrapping `AppShell` (`.app` grid: `AppHeader` per route, `<main>` with the `Screen` switch on `useRoute()`, `TabBar current`, `Toast`). Also: storage-blocked toast (§9 « Générique »), tab reselect (scroll `main` to top; « Match » resets an *empty* draft), the Match header's `[1v1 | 2v2]` segmented control bound to `draft.format`.
- `src/App.test.ts` — server-renders the shell on every route (header title, tab bar, toast region, empty-state copy, unknown hash fallback).
- `src/screens/{Classement,Match,MatchEdit,Historique,MatchDetail,Joueurs,Joueur,Reglages,CommentCaMarche}.tsx` — tiny placeholders marked `// TODO(screens)`; each renders a `.content` column and the spec's empty-state copy where one exists (Classement « Pas encore de joueurs », Match « Ajoute d'abord des joueurs », Historique « Aucun match pour l'instant. », Joueurs « Aucun joueur pour l'instant… » + « Ajoute tes collègues » when `add`, Joueur « Aucun match pour l'instant. »).

### Core
- `src/types.ts` — all shared domain / engine / draft types (contract verbatim).
- `src/router.ts` — hash router: `Route`, `parseHash`, `hrefOf`, `navigate`, `back`, `useRoute` (useSyncExternalStore, cached snapshot).
- `src/format.ts` — French formatting helpers (Intl fr-FR, U+2212, U+202F).
- `src/types.test.ts`, `src/router.test.ts`, `src/format.test.ts`.

### Store
- `src/store/reducer.ts` — pure `reducer`, `Action`, `initialStore`, `DEFAULT_SETTINGS`, `playerHasMatches`, `backfillSeq`, `nextSeqOf`.
- `src/store/persistence.ts` — `loadStore`, `saveStore`, `STORAGE_KEY`, `normaliseStore`, `normaliseSettings`.
- `src/store/draft.ts` — `draftReducer`, `DraftAction`, `initialDraft`, `NO_ACTIVE_SLOT`, `visibleSlots`, `isDraftComplete`.
- `src/store/provider.tsx` — `AppStateProvider`, `useAppState`, `AppState`, `ToastInput`, `ToastState`, `NavPayload`.
- `src/store/index.ts` — barrel. Tests: `reducer.test.ts`, `draft.test.ts`, `persistence.test.ts`, `provider.test.ts`.

### Stats
- `src/stats.ts` — pure UI helpers (no rating math) + `ImportResult` type. `src/stats.test.ts`.

### Components (`src/components/`)
- Shell: `icons.tsx` (16 icons), `Button.tsx` (`Button`, `IconButton`), `Header.tsx`, `TabBar.tsx`, `Toast.tsx`, `ConfirmDialog.tsx`, `InlinePlayerForm.tsx` (+ `validatePlayerName`, `normalizePlayerName`, `PLAYER_NAME_MAX`). Test: `shell.test.ts`.
- Entry: `SegmentedControl.tsx`, `Chip.tsx`, `AddChip.tsx`, `Slot.tsx`, `ScoreGrid.tsx`, `PreviewTable.tsx`. No repo tests (smoke tests were kept in the agent's scratchpad).
- Lists: `ListRow.tsx`, `rows.tsx` (`RankRow`, `PlayerRow`, `HistoryRow`, `SettingRow`), `SectionHeader.tsx`, `Badge.tsx`, `Delta.tsx`, `Card.tsx`, `HintCard.tsx`, `EmptyState.tsx`, `Sparkline.tsx`, `MatchSummary.tsx`. Tests: `lists.test.ts`, `rows.test.ts`, `cards.test.ts`.

### Styles (`src/styles/`, imported in order by `src/index.css`)
- `tokens.css` (spec §6 verbatim), `base.css` (resets, `.app` layout root, safe-area vars `--safe-*`, type scale `.t-*`, `.content`, `.stack-16`, `.row-divider`, `.pos/.neg/.warn/.muted/.text-2`, `.no-select`, `.sr-only`), `shell.css` (btn, icon-btn, header, tabbar, toast, dialog, inline-form), `entry.css` (segmented, chip, slot, score grid, preview, `.is-shaking`, `.entry-*` helpers), `lists.css` (row variants, section header, badge, pill, delta, hint, empty, sparkline, match summary).

## Public API actually exported (verified by reading the files)

### `src/router.ts`
```ts
export type Route = { name: 'classement' } | { name: 'match' } | { name: 'match-edit'; id: MatchId } | { name: 'historique' }
  | { name: 'match-detail'; id: MatchId } | { name: 'joueurs'; add?: boolean } | { name: 'joueur'; id: PlayerId }
  | { name: 'reglages' } | { name: 'comment-ca-marche' }
export function parseHash(hash: string): Route
export function hrefOf(route: Route): string
export function navigate(route: Route): void
export function back(): void
export function useRoute(): Route
```
Matches the contract exactly. `add` is present only when the query is exactly `add=1`.

### `src/store/index.ts`
```ts
export type { Action, DraftAction, AppState, NavPayload, ToastInput, ToastState }
export { reducer, initialStore, DEFAULT_SETTINGS, playerHasMatches, backfillSeq, nextSeqOf }
export { loadStore, saveStore, STORAGE_KEY, normaliseStore, normaliseSettings }
export { draftReducer, initialDraft, NO_ACTIVE_SLOT, visibleSlots, isDraftComplete }
export { AppStateProvider, useAppState }
```
`Action`, `DraftAction`, `reducer`, `initialStore`, `loadStore`, `saveStore`, `draftReducer`, `initialDraft`, `ToastInput`,
`NavPayload`, `AppStateProvider`, `useAppState` match the contract signatures. The rest are additive helpers.

### `src/stats.ts`
All ten contract functions with the exact contract signatures: `sevenDayDelta`, `currentStreak`, `favouritePartner`,
`chipOrder`, `sortByName`, `isInactive`, `validateImport`, `buildExport`, `rankIndexOf`, `teamLabel`. Extra:
`export type ImportResult` (return type of `validateImport`).

### `src/format.ts`
All twelve contract functions with the exact contract signatures: `fmtInt`, `fmtDelta`, `fmtPercent`, `fmtMultiplier`,
`fmtOrdinal`, `fmtTime`, `fmtRelative`, `fmtDayHeader`, `fmtDateLine`, `fmtScore`, `daysSince`, `plural`.

## Deviations from the contracts / spec (all additive or documented)

1. `Draft.activeSlot` uses `-1` (`NO_ACTIVE_SLOT`) when no slot is active; `pick` with no active slot returns the same
   draft reference (the screen detects `Object.is` to trigger the 200 ms shake). The contract type is `number`, so this
   is a convention, not a type change.
2. `PreviewTable` rows carry no `name` (spec §5 lists one); the fixed `PreviewWhatIf` / `PreviewExact` shapes were kept
   and names are resolved through the `players` map prop. `teams` is `[{ label }, { label }]`.
3. `MatchSummary` has an extra optional `byPlayer` prop (needed for the rookie / newly-ranked movement variants).
   `ListRow` got `className` and `aria-label`; `EmptyState` got `compact`; `SettingRow` got `captionWarn`; `TabBar` got
   `onReselect`; `Button` got `inline`, `autoFocus`, `className`, `type`. All optional.
4. `fmtRelative` returns ICU strings with U+00A0 before the unit (« il y a 12 min ») and « avant-hier » for 2 days;
   compare against `fmtRelative` itself in tests, not literals.
5. `reducer` throws on `deletePlayer` for a player with matches (and `dispatch` pre-checks it at the call site).
   `restoreMatch` with a duplicate id and `updateMatch` with an unknown id are no-ops.
6. `useAppState().toast` is a memo whose identity changes with `current`; depend on `toast.show` / `toast.dismiss`
   (stable callbacks) in effects, never on `toast` itself.
7. `provider.tsx` and `InlinePlayerForm.tsx` carry `oxlint-disable-next-line react/only-export-components` for the
   hook / validators they export next to a component (HMR full-reload only).
8. The `[1v1 | 2v2]` segmented control of the Match header lives in `App.tsx` (`AppHeader`) because the header is
   rendered by the shell, outside the screen; the Match screen reads the same `draft.format`.
9. `src/App.test.ts` and `src/components/shell.test.ts` were not in any ownership list; both are kept because they are
   the only tests exercising the shell. Tests run in vitest's `node` environment with no DOM: they assert server-rendered
   markup and pure functions only.

## Open issues for the screens phase

- `src/rating/` does not exist yet: `ReplayResult` / `Ranking` consumers (Classement, Joueur, Historique rows,
  MatchSummary, PreviewTable) need the engine plus a `useMemo` replay keyed on `[players, matches]` identity.
- Joueur header: the « Renommer » pencil is rendered by `AppHeader` with no handler. Either lift an "edit mode" flag
  into the Joueur screen through a tiny context/ref, or move the header into the screen (the shell would then render
  `null` for that route). Same question for any screen-owned header action.
- Unknown ids: `MatchDetail` / `MatchEdit` / `Joueur` must redirect (`#/historique`, `#/joueurs`) per §3.4; the
  placeholders just echo the id.
- Per-tab scroll position memory (§2) is not implemented; `AppShell` only scrolls to top on tab reselect.
- `nav.take()` for `highlightIds` / `rankBefore` is wired in the provider but unused; Classement must consume it on
  mount and apply `.row--flash` + scroll-into-view.
- Install hint (iOS UA / `beforeinstallprompt` / `appinstalled`) and the export nudge have no helper yet; both belong
  to the Classement screen + Réglages row, with dismissal dates in `settings`.
- Export via `navigator.share({ files })` / `<a download>` and import via hidden `<input type=file>` + `validateImport`
  are screen-phase work (helpers exist: `buildExport`, `validateImport`).
- `draftReducer` `reset` keeps the current `format` / `target`; the Match screen must dispatch `setSetting` with
  `lastFormat` / `lastTarget` on save so the next `initialDraft` picks them up.
- `README.md` should mention the 7-day Safari storage eviction (spec §10) when the install hint lands.
- Build size is 75 kB gzip JS (React 19 + the shell); well under the 100 kB target but leaves little headroom — keep
  the engine dependency-free.
