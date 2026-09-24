# How Tessera is tested

Two suites, both run on every push, on macOS, Windows and Linux.

```bash
npm test                 # the unit suite
npm test -- --coverage   # with a coverage report in coverage/
npm run test:e2e         # the built app, driven the way a person drives it
```

## What is tested, and how

**Against the real thing wherever that is honest.** A library test makes a real folder on disk and
reads it with the real indexer. A backup test runs the real Kopia. A sign-in test spawns a small
script standing in for rclone, so the spawning, the output parsing and the failure paths are all
exercised; only the program at the end of the path is pretend. The agent door is started as a real
HTTP server and spoken to over a socket.

**The window's side without a window.** `test/fake-electron.ts` is enough of Electron to register
the app's handlers and record what they asked the desktop to do. Every channel of the contract in
`src/shared/ipc.ts` is called the way the window calls it, over a real library. What is checked is
that the contract holds: a channel that is declared is answered, a refusal comes back as a
`UserError` with a code rather than as a crash, and what the window sent reaches the service
unchanged.

**Both sides of every change.** A test that edits a pack checks what the library says afterwards
*and* what is on disk, because the folder is the truth and the index is only a quick way of asking
it questions. The two have to agree.

**What the disk refuses.** A file that has gone, a folder that will not take a write, a read-only
pack, a name already taken, a library that has closed, a file that vanishes between the plan and
the copy. The rule the tests hold the app to is the same in each case: say so plainly, and leave
nothing half-done.

## What is not covered, and why

`src/main/index.ts`, `menu.ts`, `drag.ts` and `thumbs/renderWindow.ts` are left out of the coverage
figures. They can only run inside Electron: they build windows, menus, the drag-and-drop source and
the hidden window thumbnails are drawn in. Driving the built app is what covers them, and the
end-to-end suite does exactly that.

`snapshotPage` needs a real browser window for the same reason.

## Where it stands

| | |
|---|---|
| Statements | 90% |
| Lines | 94% |
| Functions | 87% |
| Branches | 80% |

697 tests, over 60 files.

The thresholds in `vitest.config.ts` sit a little under these, as a floor: a change that quietly
stops testing something fails the build rather than going unnoticed. They are checked on every
push, on Linux. Raise them as the number rises; never lower them to make a build pass.

**Why branches sit lower than the rest.** Every `?.`, every `??`, every default argument and each
side of every ternary counts as a branch, and this code is deliberately full of them: a missing
field falls back rather than throwing, a failed read is caught rather than propagated. What is
still uncovered is mostly the half of a fork that belongs to another system: the Windows way of
asking who has a port while the tests run on a Mac, the Linux keyring while they run on Windows.
Each of those is covered on the system it belongs to; no single run can cover them all. The rest
are failures of somebody else's program that would take a fake of it, per failure, to force. Where
a failure is one people will actually meet, there is a test for it: Kopia refusing, rclone
refusing, a download the site will not hand over, a folder that has gone, an index that will not
open, a copy that stops halfway.

## Testing on the other systems

CI runs the whole suite on macOS, Windows and Linux, and installs Kopia and rclone on each so the
backup tests run rather than skipping. The end-to-end suite runs on Linux under a headless display:
one run is enough to catch a broken screen.

A few things still want a person, and are listed in `docs/check-by-hand.md`: restoring from a real
cloud account, pairing two computers with Syncthing, and a library on an external drive that is then
pulled out.

## Writing a new test

- Name the test for the behaviour, not the function. "puts a pack back where it came from", not
  "restoreFromBin works".
- Make a test own the folders it writes into when what it is testing keeps working after the test
  ends. The shared `tempDir()` helper clears up after every test, which a download queue or a
  folder watcher will lose a race against.
- Wait for a condition, never for a duration. A retry waits seconds, and a loaded machine waits
  longer.
- When a test fails intermittently, it has found something. Two of the faults fixed in this
  codebase were first seen as a test that failed about one run in five.
