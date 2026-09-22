# Tessera

A desktop library for game assets. Keep every pack you collect — models, textures, sprites, UI,
audio, music, fonts, HDRIs — in one place, with its licence and source on record, find the piece
you need in seconds, and copy it into your game with its credits written for you.

- **Keeps downloads as they are**, zips included, and reads inside them.
- **Knows the licence**: read from the pack's own files, checked before anything goes into a game.
- **Finds anything**: filters by type, format, source, creator, licence, genre, style and tags;
  search across every file; formats of one asset grouped together.
- **Shows it properly**: 3D models, images, HDRIs, sounds and fonts, previewed in the app.
- **Collections** across packs, and saved searches.
- **Game projects**: Unity, Godot, Unreal or any folder — the right format, textures included, a
  licence file per pack and an up-to-date CREDITS.md.
- **Optional** encrypted backups (Kopia) and sync between computers (Syncthing).

Runs on macOS, Windows and Linux.

Status: in development.

## Building

```
npm install
npm run dev        # run with hot reload
npm test
npm run dist       # installers for this platform, in release/
```

See `AGENTS.md` for how the code fits together.
