# Working on Tessera

Notes for anyone — person or agent — changing this repository.

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

- **`src/main`** — the Electron main process.
  - `library/` — the library folder format (`tessera-library.json`, `packs/<name>/{pack.json,
    original/, licence/}`, `collections/*.json`), pack records, and detecting a pack's licence
    and source from its own files.
  - `index/` — the SQLite index (`node:sqlite`, no native modules) mirroring the library:
    classifying files, grouping variants, facets, full-text search, reading files inside zips
    (with a small cache of open archives).
  - `import/` — planning and running imports (downloads are copied in untouched).
  - `thumbs/` — the thumbnail queue and cache; drawing happens in a hidden render window.
  - `projects/` — linked game projects: engine detection, copying with dependencies, the
    per-project manifest and CREDITS.md.
  - `libraryService.ts` — the open library: opening, watching, syncing, and the operations the
    window asks for. `index.ts` wires IPC handlers to the services.
  - `protocol.ts` — `tessera://` serves pack files and thumbnails to windows (with ranges).
- **`src/preload`** — `index.ts` exposes the typed bridge (`window.tessera`); `worker.ts` is the
  render window's bridge.
- **`src/shared`** — types and pure logic used on both sides: the IPC contract (`ipc.ts`), pack
  and collection schemas (zod), licences, sources, asset classification.
- **`src/renderer`** — the React app (MUI themed with Material 3 tokens from a seed colour).
  `src/worker/` is the hidden render window (three.js) that draws thumbnails.

The library folder is the source of truth. The index and thumbnails live in the app's data folder
and can be deleted and rebuilt at any time.

## Ground rules

- **Cross-platform from the start.** No hardcoded paths, no OS-only tools on required paths.
  Refs inside packs use forward slashes; convert at the file-system boundary.
- **Optional integrations stay optional.** Backups (kopia) and device sync (Syncthing) are off
  until the user turns them on. The app must work fully with neither installed.
- **Never touch a user's originals.** Imported files are stored as they arrived; previews and
  derived files go in a cache that can be deleted and rebuilt.
- **No personal data in the repo.** No real user paths, names, IDs or keys in code, tests, fixtures
  or docs.
- **Keep code, comments, commit messages and docs about the project itself** — not about the tools
  used to write it.
- **Commits:** small, with a short imperative subject that says what changed and why it matters;
  no trailers.
- **Tests** live in `test/` and run under plain Node, without Electron. Keep main-process logic
  free of `electron` imports where possible, so it stays testable.

## Docs

Longer documentation and user instructions will live in `docs/`.
