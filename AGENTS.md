# Working on Tessera

Notes for anyone, person or agent, changing this repository.

## What it is

A cross-platform desktop app (macOS, Windows, Linux) that stores and organises game asset packs,
records each pack's licence and source, previews what's inside, and copies assets into game
projects with their licences and credits.

## Running it

```
npm install
npm run dev          # the app with hot reload
npm test             # unit tests (vitest)
npm run typecheck
npm run package      # an unpacked app in release/ for this platform
npm run dist         # installers for this platform
```

Development runs keep their settings in a separate data folder (`<userData>-dev`), so they never
touch an installed copy. `TESSERA_USER_DATA=<folder>` points the app at any data folder, and
`TESSERA_E2E=1` exposes test hooks on `window.__tessera` for scripted UI checks.

## How it fits together

- **`src/main`**, the Electron main process.
  - `library/`, the library folder format (`tessera-library.json`, `packs/<name>/{pack.json,
    original/, licence/}`, `collections/*.json`), pack records, and detecting a pack's licence
    and source from its own files.
  - `index/`, the SQLite index (`node:sqlite`, no native modules) mirroring the library:
    classifying files, grouping variants, facets, full-text search, reading files inside zips
    (with a small cache of open archives).
  - `import/`: planning and running imports (downloads are copied in untouched).
  - `downloads/`, the queue for links the user brings: a few at a time, resumable, kept in
    `userData/downloads`; a finished one goes through `import/` like any other pack.
  - `thumbs/`, the thumbnail queue and cache; drawing happens in a hidden render window.
  - `projects/`: linked game projects: engine detection, copying with dependencies, the
    per-project manifest and CREDITS.md.
  - `libraryService.ts`, the open library: opening, watching, syncing, and the operations the
    window asks for. `index.ts` wires IPC handlers to the services.
  - `libraries.ts`: every library this computer knows (`settings.libraries`, by library id):
    each keeps its own settings (Review rule, downloads rule, sync, backups); moving old app-wide
    settings over. Site rules (`settings.siteRules`) are the app's, not a library's.
  - `backup/`, `sync/`: Kopia backups and Syncthing sync, both per library: they read a
    library's record, and run for libraries that aren't open when their settings allow.
  - `protocol.ts`: `tessera://` serves pack files and thumbnails to windows (with ranges).
  - `reports/`: errors nobody expected: kept locally in `logs/errors.jsonl`, cleaned by
    `scrub.ts` (paths, names, addresses), and sent to a Sentry-compatible service only with the
    user's consent (`sentry.ts` posts envelopes by hand; no SDK).
- **`src/preload`**: `index.ts` exposes the typed bridge (`window.tessera`); `worker.ts` is the
  render window's bridge.
- **`src/shared`**: types and pure logic used on both sides: the IPC contract (`ipc.ts`), pack
  and collection schemas (zod), licences, sources, asset classification.
- **`src/renderer`**, the React app (MUI themed with Material 3 tokens from a seed colour).
  `src/worker/` is the hidden render window (three.js) that draws thumbnails.

### Messages to the user

Three levels, and nothing in between:

- **Dialog** (`ask()` in `renderer/src/notices/dialogs.ts`): only when the user has to decide
  something before carrying on, or data is at risk. One dialog at a time, queued.
- **Toast** (`notify.*` / `failed(e)` in `notices/store.ts`): everything else. Bottom right, over
  the page; info and success fade, warnings and errors stay until closed. Repeats are counted.
- **Inline**: only for a problem tied to a field in a form, or lasting state shown where it
  belongs (a Settings row, the Inbox banner on a pack).

Never put an error banner into a page's layout.

Forms and dialogs keep their size whatever they say:

- A dialog has a fixed size for all its states (setup dialogs share `DIALOG_WIDTH`/`HEIGHT`);
  content that could outgrow it scrolls inside.
- A field's own problem goes in its helper line, whose space is always kept (`helperText=' '`).
- Anything else a form needs to say goes in its one `StatusSlot`, which reserves its height even
  when empty. One message at a time, most important first.
- Parts that don't apply stay in place, disabled or hidden (`visibility: hidden`), rather than
  being removed.
- Keep setup text short: a title, one line under it, and labels. Say more only where it prevents
  a mistake. Every toast and error dialog lands in the message
history in the top bar.

### Error reports

Off unless the user agrees (Settings › Privacy, or the question after an error). A build only
knows where to send reports when `TESSERA_REPORTS_DSN` is set at build time (a release secret);
setting it in the environment works for development. Anything added to a report must go through
the scrubber, and `test/scrub.test.ts` should gain a case for any new kind of text sent.

The library folder is the source of truth. The index and thumbnails live in the app's data folder
(`libraries/<id>/`) and can be deleted and rebuilt at any time.

Settings come in two kinds, and new ones must pick one: a library's own (in its record, shown
under "This library" in Settings) or the app's (theme, error reports, paired computers, helpers;
shown under "Tessera"). Projects are the app's: a project records, per copied asset, the library
it came from.

## Ground rules

- **Cross-platform from the start.** No hardcoded paths, no OS-only tools on required paths.
  Refs inside packs use forward slashes; convert at the file-system boundary.
- **Optional integrations stay optional.** Backups (kopia) and device sync (Syncthing) are off
  until the user turns them on. The app must work fully with neither installed.
- **Never touch a user's originals.** Imported files are stored as they arrived; previews and
  derived files go in a cache that can be deleted and rebuilt.
- **No personal data in the repo.** No real user paths, names, IDs or keys in code, tests, fixtures
  or docs.
- **Keep code, comments, commit messages and docs about the project itself**, not about the tools
  used to write it.
- **Commits:** small, with a short imperative subject that says what changed and why it matters;
  no trailers.
- **Tests** live in `test/` and run under plain Node, without Electron. Keep main-process logic
  free of `electron` imports where possible, so it stays testable.

## Docs

Longer documentation and user instructions will live in `docs/`.
