# Your library

A library is a folder. Tessera writes a predictable structure inside it and nothing else, so the
folder can be backed up, synced, moved to a drive or opened by hand at any time.

```
My Library/
  tessera-library.json     what this library is: its name, its id, its preferences
  packs/
    food-kit/
      pack.json            the record: name, license, source, creator, tags, version
      original/            your download, exactly as it arrived (archives stay archives)
      licence/             proof: license files, the page snapshot, receipts
  collections/             each collection as its own small file
```

Nothing is hidden and nothing is a database you cannot read. The index Tessera searches is kept
separately, in the application's own folder, and can be rebuilt from the library at any time.

## More than one library

Make as many as you like: one per game, one for work, one on a drive you carry. The switcher at the
top right moves between them, and each remembers where you were.

Each library keeps its own packs, collections, preferences, backups and sync. What is shared by
every library on the computer is Tessera's own settings: the games you have linked, the rules for
sites, download preferences, the agent switches and the theme.

## Moving or renaming one

Move the folder wherever you like and open it again from the switcher. Renaming the folder is fine;
the library's name is stored inside it and can be changed in Settings.

## Preferences a library carries

- **Name**, shown in the switcher and the top bar.
- **Packs Tessera is sure about**: when a download states its own license and comes from a site
  Tessera knows, it goes straight into the library. Turn this off and everything waits in Review.
- **Bin**: how long deleted things are kept before they go for good.
- **Backups** and **sync**, each set up per library.
