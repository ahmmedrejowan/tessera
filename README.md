# Tessera

[tessera.rejowan.com](https://tessera.rejowan.com)

A desktop library for game assets. Keep every pack you collect: models, textures, sprites, UI,
audio, music, fonts, HDRIs: in one place, with its licence and source on record, find the piece
you need in seconds, and copy it into your game with its credits written for you.

- **Keeps downloads as they are**, zips included, and reads inside them.
- **Knows the licence**: read from the pack's own files, checked before anything goes into a game.
- **Finds anything**: filters by type, format, source, creator, licence, genre, style and tags;
  search across every file; formats of one asset grouped together.
- **Shows it properly**: 3D models, images, HDRIs, sounds and fonts, previewed in the app.
- **Collections** across packs, and saved searches.
- **Game projects**: Unity, Godot, Unreal or any folder, the right format, textures included, a
  licence file per pack and an up-to-date CREDITS.md.
- **Optional** encrypted backups (Kopia) and sync between computers (Syncthing).

Runs on macOS, Windows and Linux.

Status: in development.

![Home](docs/images/02-home.png)

## Installing

Downloads are on the [releases page](https://github.com/ahmmedrejowan/tessera/releases): a `.dmg`
for macOS, a `.exe` for Windows, and an `.AppImage` or `.deb` for Linux. Take the one that matches
your computer (`arm64` for Apple Silicon, `x64` for Intel).

Tessera is free software and the builds are not signed with a paid certificate, so each system
asks once whether you meant it:

- **macOS**: move Tessera to Applications, then right-click it and choose **Open**, and **Open**
  again in the box that appears. Double-clicking the first time says the app "cannot be opened";
  right-click and Open is the way past it, and only the first time.
- **Windows**: SmartScreen says "Windows protected your PC". Choose **More info**, then
  **Run anyway**.
- **Linux**: `chmod +x Tessera-*.AppImage` and run it, or `sudo dpkg -i tessera_*.deb`.

Each release lists the SHA256 of every file, so you can check a download is the one that was built.

There is a [step by step guide](docs/guide.md), with pictures, and the app has the same thing under
Help.

## Building

```
npm install
npm run dev        # run with hot reload
npm test
npm run dist       # installers for this platform, in release/
```

Node 24 or newer. `AGENTS.md` explains how the code fits together, and `CONTRIBUTING.md` how to
help.

## Licence

Tessera is free software under the **GNU General Public License, version 3 or later**: use it
for anything, read how it works, change it, and pass it on, as long as what you pass on stays
free in the same way. The full text is in `LICENSE`, and the app shows it under About.

The separate programs Tessera can fetch (Kopia, rclone, Syncthing) stay under their own licences,
and so do the assets you keep in your library.
