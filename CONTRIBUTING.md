# Helping with Tessera

Thank you for looking. Tessera is one person's project, written to be read: the code should tell
you what it is doing and why, and so should anything you add to it.

## Before writing code

Open an issue first if it is more than a small fix. A change that fits the app is easier to agree
on in a paragraph than in a pull request, and it saves you work that might not be merged.

Good first things: a site Tessera should know how to fetch from, an engine it should recognize, a
format it should preview, a license it should know, a rough edge in the wording.

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
- **`src/shared`** is what both sides agree on: the IPC contract, the pack format, licenses, words.
- Every channel in `src/shared/ipc.ts` has exactly one handler in `src/main/ipc/`.

## What a change should look like

- **Plain English, in the app's voice.** Labels, errors, help and commit messages are written for
  a person who is not a programmer. No jargon where a word will do, no em dashes anywhere.
- **Comments say why, not what.** The code says what.
- **Tests for what could break.** A new tool, a new format, a new rule: a test with a name that
  reads as a sentence about behavior, not about the code.
  [docs/testing.md](docs/testing.md) explains how the suites are put together, what is deliberately
  left out of them, and the two rules worth knowing before writing one: wait for a condition rather
  than a duration, and let a test own the folders it writes into.
- **Nothing that loses files.** Deleting means the library's bin. A write that could half-finish
  should be atomic, or recoverable.
- **No new runtime dependency** without a good reason. There are four.

## Which branch

`main` is what has been released. `dev` is where the next version is put together. Nobody pushes to
either, including me: everything arrives through a pull request.

- Branch off **`dev`**, and open your pull request **against `dev`**.
- `dev` goes into `main` as a single pull request when a version is released, and `main` is then
  tagged. `dev` is not deleted; it carries on.
- A fix for something that is broken in the released version can go straight at `main`. Say so in
  the pull request, because it has to be put into `dev` as well or the next release undoes it.

## Before you open one

`npm run typecheck && npm test`. The pull request then runs the whole thing on macOS, Windows and
Linux, builds and packages the app on each, drives the app end to end, and holds coverage to a
floor, so a change that quietly stops testing something fails rather than going unnoticed. All four
checks have to pass before it can go in. What runs after a merge to `main` is smaller, and only
confirms that `main` is still good with the change actually in it.

## License

Tessera is GPL-3.0-or-later. By contributing you agree your work goes out under the same terms.
