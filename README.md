<div align="center">
  <img src="https://raw.githubusercontent.com/ahmmedrejowan/tessera/main/build/icon.png" alt="Tessera" width="120" height="120">

<h3>A desktop library for game assets</h3>

  <p>
    Keep every pack you collect, with its license and source on record. Find the piece you need in
    seconds, and copy it into your game with the credits written for you.
  </p>

[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue.svg?style=flat)](https://github.com/ahmmedrejowan/tessera/releases)
[![License](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-44-47848f.svg)](https://www.electronjs.org/)
[![CI](https://github.com/ahmmedrejowan/tessera/actions/workflows/ci.yml/badge.svg)](https://github.com/ahmmedrejowan/tessera/actions/workflows/ci.yml)

[tessera.rejowan.com](https://tessera.rejowan.com)

  <a href="https://www.youtube.com/watch?v=ToopqlN9PU4">
    <img src="https://i.ytimg.com/vi/ToopqlN9PU4/maxresdefault.jpg" alt="Watch Tessera in forty seconds" width="640">
  </a>

  <p><a href="https://www.youtube.com/watch?v=ToopqlN9PU4"><b>Watch it in forty seconds</b></a></p>
</div>

---

## Features

- **Packs kept whole** - your download is copied in as it came, zips included, and read inside for what it holds
- **License and source on record** - read from the pack's own files where possible, with a page snapshot kept as proof
- **Review** - anything without a license or a source waits there, and cannot reach a game until it has both
- **Find anything** - search across packs, assets and tags, with filters by type, format, site, creator, license, genre, style and tags
- **See it properly** - 3D models, images, HDRIs, sprites, sounds and fonts previewed in the app
- **Collections** - gather packs and files for one game, with rules that refuse what does not fit
- **Games** - link assets into Unity, Godot, Unreal or any folder, in the format that engine prefers, with a CREDITS.md kept up to date
- **Add to a pack later** - drop more files into a pack you already have, in the folder of your choosing
- **Starred, archived, binned** - keep what matters to hand, put the rest out of the way, and never lose anything to a mis-click
- **AI agents** - 65 tools over MCP, on this computer only, with what they may do in your hands
- **Backups and sync** - encrypted backups with Kopia, sync between your own computers with Syncthing, both optional
- **Yours, offline** - no accounts, no telemetry, no analytics. Your library is ordinary folders you can open at any time

![The first screen](docs/images/01-welcome.png)

---

## Download

![GitHub Release](https://img.shields.io/github/v/release/ahmmedrejowan/tessera)
[![Downloads](https://img.shields.io/github/downloads/ahmmedrejowan/tessera/total.svg)](https://github.com/ahmmedrejowan/tessera/releases)

### With a package manager

| Your computer | What to type |
|---------------|--------------|
| macOS, Homebrew | `brew tap ahmmedrejowan/tessera && brew install --cask tessera` |
| Windows, Chocolatey | `choco install tessera` |
| Windows, Scoop | `scoop bucket add tessera https://github.com/ahmmedrejowan/scoop-tessera && scoop install tessera` |
| Windows, winget | `winget install Rejowan.Tessera` — **not yet**, see below |
| Arch, Manjaro | `yay -S tessera-bin` — **not yet**, see below |

The winget submission passes every check and is waiting on a moderator at
[microsoft/winget-pkgs#441739](https://github.com/microsoft/winget-pkgs/pull/441739). A PKGBUILD is
written on every release but nothing is published to the AUR yet. Both commands are given so you
know what they will be, not because they work today.

Homebrew 7 asks before it loads anything from a tap that is not its own. If it does, run
`brew trust --cask ahmmedrejowan/tessera/tessera` and install again.

A package manager is worth preferring: each of them clears the download flag as it installs, so
neither macOS nor Windows asks you to allow anything.

### Or take the file

| Your computer | Download |
|---------------|----------|
| macOS, Apple Silicon (M1 and newer) | [Tessera-mac-arm64.dmg](https://github.com/ahmmedrejowan/tessera/releases/latest) |
| macOS, Intel | [Tessera-mac-x64.dmg](https://github.com/ahmmedrejowan/tessera/releases/latest) |
| Windows 10 and 11 | [Tessera-win-x64.exe](https://github.com/ahmmedrejowan/tessera/releases/latest) |
| Windows on Arm | [Tessera-win-arm64.exe](https://github.com/ahmmedrejowan/tessera/releases/latest) |
| Linux, portable | [Tessera-linux.AppImage](https://github.com/ahmmedrejowan/tessera/releases/latest) |
| Debian and Ubuntu | [tessera.deb](https://github.com/ahmmedrejowan/tessera/releases/latest) |
| Fedora and openSUSE | [tessera.rpm](https://github.com/ahmmedrejowan/tessera/releases/latest) |

Every file, with its checksum and what changed, is on the
[releases page](https://github.com/ahmmedrejowan/tessera/releases/latest).

These builds are not notarised by Apple or signed with a Windows certificate, so each system asks
once, the first time you open Tessera. Nothing is wrong with the download. Installing with Homebrew
skips this on a Mac entirely.

**macOS** says it cannot verify the app is free from malware.

The quickest way, once Tessera is in Applications, is one line in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Tessera.app
```

That removes the flag macOS puts on anything a browser downloaded, which is the whole reason for
the warning. It is the same thing Homebrew does for you. Running it says nothing and does nothing
if the flag has already gone. You are switching off a check, so do it for software you mean to
trust: the checksums on the releases page, and `gh attestation verify`, are there to make that
judgement an informed one.

Or click through it instead, which needs no Terminal:

1. Double-click Tessera, then press **Done** on the warning.
2. Apple menu, **System Settings**, **Privacy & Security**.
3. Scroll to **Security**. There is a line saying Tessera was blocked.
4. Press **Open Anyway**, and confirm with Touch ID or your password.
5. Press **Open** on the last box.

From then on it opens like anything else. On macOS 14 and earlier you can instead right-click
Tessera in Applications and choose **Open**, then **Open** again.

**Windows** says "Windows protected your PC". Choose **More info**, then **Run anyway**. The
equivalent one-liner, before you run the installer, is PowerShell's

```powershell
Unblock-File .\Tessera-win-x64.exe
```

which takes off the mark Windows puts on a downloaded file. SmartScreen usually reacts to that
mark, so the prompt normally does not appear; a publisher it has never heard of can still be
questioned, and **More info** then **Run anyway** always works.

**Linux** says nothing. `chmod +x Tessera-*.AppImage`, or `sudo dpkg -i Tessera-*.deb`, or
`sudo rpm -i Tessera-*.rpm`.

Every release lists the SHA256 of each file, so you can check a download is the one that was built.
Each file also carries a signed record of the commit and the workflow that produced it:

```bash
gh attestation verify Tessera-*.dmg -R ahmmedrejowan/tessera
```

---

## Screenshots

| Home | Every pack |
|------|------------|
| ![Home](docs/images/02-home.png) | ![Browsing by pack](docs/images/12-packs.png) |

| Browsing the assets | A pack's own page |
|---------------------|-------------------|
| ![Browse](docs/images/03-browse.png) | ![A pack](docs/images/04-pack.png) |

| What is inside a pack | The viewer |
|-----------------------|------------|
| ![The files in a pack](docs/images/05-pack-files.png) | ![The viewer](docs/images/06-viewer.png) |

| Games | One game |
|-------|----------|
| ![Games](docs/images/08-games.png) | ![A game's page](docs/images/13-project.png) |

| Collections | Review |
|-------------|--------|
| ![Collections](docs/images/07-collections.png) | ![Review](docs/images/15-review.png) |

| Downloads | One library, or several |
|-----------|-------------------------|
| ![Downloads](docs/images/16-downloads.png) | ![The library switcher](docs/images/14-libraries.png) |

| Backups | Sync |
|---------|------|
| ![Backups](docs/images/17-backups.png) | ![Sync](docs/images/18-sync.png) |

| Settings | AI agents |
|----------|-----------|
| ![Settings](docs/images/09-settings.png) | ![AI agents](docs/images/10-agents-settings.png) |

| Connecting an agent | The first screen |
|---------------------|------------------|
| ![Connecting](docs/images/11-agents.png) | ![The first screen](docs/images/01-welcome.png) |

---

## Using it

1. **Make a library.** The first screen asks where it should live. It is an ordinary folder: your
   packs go in `packs/`, one folder each, exactly as they were downloaded.
2. **Put something in it.** Drag a zip or a folder onto the window, use the + button, or paste a
   link into Downloads. Tessera reads the pack, including inside archives, and fills in what it can.
3. **Answer the license question.** A pack with no license or no source waits in Review until it
   has both. That is the whole point: it can never leave for a game unaccounted for.
4. **Find things.** Search across packs, files and tags, or narrow by kind, format, creator,
   license, style. Double-click anything to see it properly.
5. **Gather.** A collection holds packs and files for one game, and can refuse anything that does
   not fit its rules.
6. **Link it into a game.** Tell Tessera where the game folder is; it copies the assets in, in the
   format that engine prefers, with a license file beside them and CREDITS.md kept up to date.

Then, when you want it: [the guide](docs/guide/) with pictures, the
[questions people ask](docs/faq.md), and the [wiki](https://github.com/ahmmedrejowan/tessera/wiki).
The same words are in the app, under Help.

---

## Architecture

Three parts, and a contract between them:

```
src/
├── main/                      # Everything that touches the disk, the network or another program
│   ├── ipc/                   # One file per area; every channel of the contract is answered here
│   ├── index/                 # The SQLite index: files, classifying, queries, facets
│   ├── library/               # The library on disk: packs, layout, collections, the bin
│   ├── import/                # Planning and running an import
│   ├── downloads/             # The download queue and the sites it knows
│   ├── projects/              # Games: engines, copying in, credits, dependencies
│   ├── backup/                # Kopia, rclone, storage targets, the recovery kit
│   ├── sync/                  # Syncthing
│   ├── mcp/                   # The agent door: the server, its tools, the skill file
│   ├── thumbs/                # Previews, drawn in a hidden window
│   └── index.ts               # The composition root: builds the services, starts the app
│
├── preload/                   # The only bridge: window.tessera
│
├── renderer/                  # The window. It never touches a file itself
│   └── src/
│       ├── pages/             # One folder per place in the app
│       ├── components/        # The shared pieces every page is built from
│       ├── viewer/            # The full-screen file viewer
│       ├── state/             # Zustand stores and TanStack Query hooks
│       └── theme/             # Material 3 tokens, light and dark, from one seed color
│
└── shared/                    # What both sides agree on
    ├── ipc.ts                 # The contract: every channel, typed
    ├── pack.ts                # What a pack is, and what its license says
    ├── assets.ts              # Kinds, types, classifying
    └── licenses.ts            # The licenses Tessera knows
```

**How it fits together.** The window asks; the main process answers. Nothing in the renderer opens
a file, spawns a program or reaches the network: it calls a channel, and one handler in
`src/main/ipc` answers it. `index.ts` builds the services once and hands each group of handlers the
part of the app it needs, so a handler cannot reach for anything it was not given. A test reads the
contract and the handlers and fails if a channel is missing, answered twice, or answered without
being declared.

**The library is the truth.** The index holds nothing that is not in the library folder, so it can
be thrown away and built again at any time, and is, if it ever will not open.

### Tech stack

- **Shell**: Electron 44 with electron-vite, three processes (main, preload, renderer)
- **Language**: TypeScript, strict, with the IPC contract typed end to end
- **UI**: React 19, MUI 9, Material 3 tokens generated from one seed color
- **State**: Zustand for what the window remembers, TanStack Query for what it asks for
- **Index**: `node:sqlite` with FTS5, one index per library
- **3D**: three.js, with a hidden window for thumbnails
- **Validation**: Zod 4, for settings, pack files and every agent tool
- **Agents**: Model Context Protocol over local HTTP
- **Tests**: Vitest, and Playwright driving the built app

---

## Requirements

- **Node**: 24 or newer, to build
- **Systems**: macOS 11+, Windows 10+, Linux with glibc 2.28 or newer
- Nothing else. Kopia, rclone and Syncthing are fetched only if you turn on backups or sync.

---

## Build and run

```bash
git clone https://github.com/ahmmedrejowan/tessera.git
cd tessera
npm install
npm run dev          # the app, with the window reloading as you save
npm run dist         # installers for this computer, in release/
```

Node 24 or newer, and git. Kopia, rclone and Syncthing are not needed to build: the app only
fetches them if you turn on backups or sync.

`npm run dist` builds for the system it runs on, and only that one. What it needs and what it
leaves in `release/`:

| On | Also needs | You get |
|----|-----------|---------|
| macOS | Xcode command line tools (`xcode-select --install`) | `.dmg` and `.zip`, Apple Silicon and Intel, signed ad hoc |
| Windows | nothing further, there is no native code to compile | an installer and a portable `.zip`, x64 and Arm |
| Linux | `rpm` as well, if you want the `.rpm` on a Debian-like system | `.AppImage`, `.deb` and `.rpm` |

`npm run package` is the quicker one: an unpacked app in `release/`, no installers.

A build from a clean clone is the same build the release workflow publishes, which is the point of
the checksums and the `gh attestation verify` line above: you can check that for yourself rather
than take it on trust.

## Testing

```bash
npm test                 # the unit suite
npm test -- --coverage   # with a coverage report in coverage/
npm run test:e2e         # end to end, against the built app
npm run typecheck        # both TypeScript projects
```

Around 740 checks across the two suites, covering 90% of the statements and 80% of the branches in
the main process. They work against real folders, a real index, a real Kopia and a real HTTP server
rather than mocks, and [docs/testing.md](docs/testing.md) explains how, what is deliberately not
covered, and how to add one.

CI runs the typecheck, the whole suite and a packaged build on macOS, Windows and Linux for every
push, installs Kopia and rclone on each so the backup tests run there too, and holds coverage to a
floor so a change that quietly stops testing something fails the build.

---

## Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) explains how the code is laid out and
what a change should look like; open an issue first if it is more than a small fix.

1. Fork the repository
2. Make your branch (`git checkout -b better-thing`)
3. `npm run typecheck && npm test`
4. Commit, push, and open a pull request

---

## License

```
Copyright (C) 2026 K M Rejowan Ahmmed

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.
```

> **Note**
> This is a copyleft license. Anything built on it stays free in the same way.

The separate programs Tessera can fetch (Kopia, rclone, Syncthing) keep their own licenses, and so
do the assets you keep in your library.

---

## Community

- [Discussions](https://github.com/ahmmedrejowan/tessera/discussions) - ask anything, share what you have built
- [Issues](https://github.com/ahmmedrejowan/tessera/issues) - something wrong, or an idea
- [Releases](https://github.com/ahmmedrejowan/tessera/releases) - every version, with its notes
- [Security](SECURITY.md) - please email rather than opening an issue
- [Privacy](PRIVACY.md) - what stays here, and what leaves only when you ask

---

<p align="center">
  <a href="https://www.producthunt.com/products/tessera-11">
    <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1261930&amp;theme=dark" alt="Find Tessera on Product Hunt" width="250" height="54" />
  </a>
</p>
