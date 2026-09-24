# Helping with Tessera

Thank you for looking. Tessera is one person's project, written to be read: the code should tell
you what it is doing and why, and so should anything you add to it.

## Before writing code

Open an issue first if it is more than a small fix. A change that fits the app is easier to agree
on in a paragraph than in a pull request, and it saves you work that might not be merged.

Good first things: a site Tessera should know how to fetch from, an engine it should recognise, a
format it should preview, a licence it should know, a rough edge in the wording.

## Running it

```
npm install
npm run dev        # the app, with the window reloading as you save
npm test           # the unit tests
npm run test:e2e   # the end to end tests, against a built app
npm run typecheck  # both TypeScript projects
npm run dist       # installers for this computer, in release/
```

Node 24 or newer. No other tools are needed; Kopia, rclone and Syncthing are only fetched if you
turn on backups or sync.

## How the code is laid out

`AGENTS.md` explains the shape of it: the main process (files, index, services), the preload
bridge, and the window. The short version:

- **`src/main`** owns everything that touches the disk, the network or another program.
- **`src/renderer`** is the window. It never touches a file itself; it asks through `window.tessera`.
- **`src/shared`** is what both sides agree on: the IPC contract, the pack format, licences, words.
- Every channel in `src/shared/ipc.ts` has exactly one handler in `src/main/ipc/`.

## What a change should look like

- **Plain English, in the app's voice.** Labels, errors, help and commit messages are written for
  a person who is not a programmer. No jargon where a word will do, no em dashes anywhere.
- **Comments say why, not what.** The code says what.
- **Tests for what could break.** A new tool, a new format, a new rule: a test with a name that
  reads as a sentence about behaviour, not about the code.
  [docs/testing.md](docs/testing.md) explains how the suites are put together, what is deliberately
  left out of them, and the two rules worth knowing before writing one: wait for a condition rather
  than a duration, and let a test own the folders it writes into.
- **Nothing that loses files.** Deleting means the library's bin. A write that could half-finish
  should be atomic, or recoverable.
- **No new runtime dependency** without a good reason. There are four.

Before you open a pull request: `npm run typecheck && npm test`. CI runs both on macOS, Windows and
Linux, builds the app on each, and holds coverage to a floor, so a change that quietly stops testing
something fails rather than going unnoticed.

## Licence

Tessera is GPL-3.0-or-later. By contributing you agree your work goes out under the same terms.
