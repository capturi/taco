# Taco

A **userscript** that overlays a GitHub Projects–style ticket UI on top of Jira Cloud
(`*.atlassian.net`). It adds a "Taco" button to Jira's sidebar (and a `Cmd/Ctrl+Shift+J`
hotkey) that toggles a full-screen React overlay for browsing, filtering, creating, and
inline-editing issues without leaving the page.

Ships as a single IIFE bundle (`dist/taco.user.js`) installed via a userscript manager
(Violentmonkey/Userscripts). Not an extension, not a web app.

## Commands

```bash
npm run dev      # vite build --watch → dist/taco.user.js
npm run build    # one-shot production build
npx tsc --noEmit # typecheck (there is NO test runner and NO linter configured)
```

`tsconfig.json` is strict with `noUnusedLocals` + `noUnusedParameters`, so unused imports
or vars fail the build — clean them up as you go. After editing, verify with `npx tsc --noEmit`.

> Known noise: editor/LSP sometimes reports `Cannot find module './CustomFiltersDialog'`.
> A full `tsc --noEmit` run does **not** report it — the file exists. Ignore that one.

## How it loads (entry path)

- `src/content/index.tsx` — injects the sidebar button, registers the hotkey, toggles the overlay.
- `src/content/mount.tsx` — mounts the React app into a **shadow DOM** host for style isolation.
  `overlay.css` is imported `?inline` and injected into the shadow root. Key events are
  stopped at the host so typing in Taco doesn't trigger Jira's global keyboard shortcuts.
- `src/ui/App.tsx` — top-level orchestrator (queries, filters, which dialog is open).

## Architecture

- **Data layer:** `src/api/jira.ts` (`JiraClient`) calls Jira REST with `fetch` +
  `credentials: 'include'` against `window.location.origin`. **Auth = the user's existing
  logged-in Jira session cookies.** There is no token/login flow. `src/api/types.ts` holds
  the domain types.
- **Caching:** TanStack Query, singletons in `src/ui/cache.ts`. The cache is persisted to
  IndexedDB (via `idb-keyval`) so issues/details render instantly across reloads while a
  background refetch lands fresh data.
- **UI:** `Toolbar`, `OverviewTable` (TanStack Table), `IssueDetail` (sidebar),
  `editors.tsx` (inline popover editors for status/assignee/sprint/domain/components/parent),
  `CreateIssueDialog`, `SettingsDialog`, `CustomFiltersDialog`, `IntroDialog` (first-run).
  `mutations.ts` does optimistic updates; `queries.ts` holds shared queries; `session.tsx`
  is a context carrying `me`/`assignees`/`statuses`/`epics` so editor cells don't re-render
  on unrelated App state changes.
- **Styling:** one file, `src/ui/overlay.css`. All classes are prefixed `taco-`.

## State & config

- User config lives in `localStorage` under **`taco.config`**, accessed via `useConfig()`
  (`src/lib/config.ts`, backed by `useSyncExternalStore`). `update(patch)` merges,
  `replace(next)` swaps wholesale (used by JSON import). New fields must be added to both the
  `Config` type and `DEFAULT_CONFIG`; stored configs are partial and merged over defaults.
- UI state (filters, groupKey) uses `usePersistedState` → `localStorage` key `taco.<key>`.
- **The config store reads localStorage once at module load and caches in memory.** Editing
  localStorage by hand requires a **page reload** to take effect. To reset for testing:
  clear `taco.*` keys and reload (no domains configured ⇒ the intro/onboarding modal appears).

## Domain conventions worth knowing

- **Product domains** are a Jira custom field (multi-select). The field id is auto-detected
  by name. When favorite domains are set, the JQL is augmented server-side
  (`augmentJqlWithFieldIn`) so only relevant issues are fetched. **Domains are required**:
  with none selected, nothing loads and onboarding is shown.
- **Components** are named `<domain-kebab>.<rest>` (e.g. `voice.backend`). `src/lib/strings.ts`
  has `toKebab`, `componentDomainPrefix`, `componentDomainRest`. Component pickers filter to
  the selected domain's prefix.

## Working notes

- This environment cannot run the userscript in a browser. Verify changes with `npx tsc --noEmit`;
  for UI/behavior changes, state clearly that visual verification needs the user to load
  `dist/taco.user.js` in Jira.
- Comments in this codebase explain *why* (constraints, gotchas), not *what*. Match that.
- Shadow DOM: document-level listeners must use `e.composedPath()` (not `e.target`) to detect
  clicks inside Taco — see the popover/menu outside-click handlers.
- Releases: pushing to `master` triggers `.github/workflows/release.yml`, which bumps the
  version and publishes `dist/taco.user.js` as a GitHub Release asset.
