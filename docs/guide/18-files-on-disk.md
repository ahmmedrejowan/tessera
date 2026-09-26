# Where everything lives

## Your library

The folder you chose. Inside it:

```
tessera-library.json   what this library is, and its preferences
packs/<pack>/          one folder per pack
  pack.json            its record: license, source, creator, tags, version
  original/            your download, exactly as it arrived
  licence/             license files, the page snapshot, receipts
collections/           one file per collection
.bin/                  what you deleted, until it is emptied
```

Everything there is ordinary files. Copy the folder to a drive, open it on another computer, or
read `pack.json` in a text editor: Tessera writes it to be read.

## Tessera's own folder

The search index, the thumbnails, the logs, the linked games and the app's settings:

- **macOS**: `~/Library/Application Support/Tessera`
- **Windows**: `%APPDATA%\Tessera`
- **Linux**: `~/.config/Tessera`

Nothing there is irreplaceable: the index and thumbnails are rebuilt from the library, and
`projects.json` is the list of games you linked.

## Your games

In each linked project: the copied files, `CREDITS.md`, and `.tessera/manifest.json`, which records
every asset copied, where it came from and under what license.

## Logs

`Logs/` inside Tessera's folder, one file per day. Settings, Privacy and problems, has a button to
open them.
