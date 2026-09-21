# Working on Tessera

Notes for anyone — person or agent — changing this repository.

## What it is

A cross-platform desktop app (macOS, Windows, Linux) that stores and organises game asset packs,
records each pack's licence and source, previews what's inside, and copies assets into game
projects.

## Status

Early planning. The feature set is being designed before code is written; update this file as the
architecture settles.

## Ground rules

- **Cross-platform from the start.** No hardcoded paths, no OS-only tools on required paths. Anything
  platform-specific sits behind one interface with an implementation per platform.
- **Optional integrations stay optional.** Backups (kopia) and device sync (Syncthing) are off until
  the user turns them on. The app must work fully with neither installed.
- **Never touch a user's originals.** Imported files are stored as they arrived; previews and
  derived files go in a cache that can be deleted and rebuilt.
- **No personal data in the repo.** No real user paths, names, IDs or keys in code, tests, fixtures
  or docs.
- **Keep code, comments, commit messages and docs about the project itself** — not about the tools
  used to write it.
- **Commits:** a short imperative subject that says what changed and why it matters; no trailers.

## Docs

Longer documentation and user instructions will live in `docs/`.
