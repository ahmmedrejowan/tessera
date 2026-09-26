# Getting started

Tessera is a library for the game assets you collect: models, textures, sprites, UI, audio, music,
fonts and HDRIs. It keeps your copy of every pack whole, with its license and where it came from on
record, so you can find one piece in seconds and send it into a game with the credits written.

It runs on your own computer and works on your own files. Nothing is uploaded, no account is made,
and your library stays ordinary folders you can open in Finder or Explorer whenever you like.

## Installing it

Take the file for your system from the [install page](/install), or use a package manager:

| System | What to type |
|--------|--------------|
| macOS | `brew tap ahmmedrejowan/tessera && brew install --cask tessera` |
| Windows, Scoop | `scoop bucket add tessera https://github.com/ahmmedrejowan/scoop-tessera` then `scoop install tessera` |

The builds are not signed with paid Apple or Microsoft certificates, so macOS and Windows each ask
once the first time you open it. The install page spells out exactly what each one says and which
button to press.

## The first screen

Tessera opens on a welcome screen with three ways in:

- **Create a library.** Choose an empty folder. Tessera writes its own structure inside it and
  nothing else.
- **Open a library.** Point it at a folder that already holds one, including one that arrived on a
  drive or through sync.
- **Receive from another computer.** Pairs with a computer that already has the library and copies
  it over your own network, through Syncthing.

If you would rather look around before adding anything of your own, Home offers three small CC0
sample packs.

## The window

- **The rail down the left** is the library: Home, Browse, Collections, Projects, Review,
  Downloads, Archive and Bin, with About and Settings at the bottom.
- **The bar along the top** holds the search box, the notifications bell, the keyboard shortcuts,
  Help, and the library switcher at the right.
- **The + button** at the top of the rail adds packs: downloads, a folder, or a folder of packs.

## The first few minutes

1. Add a pack or two: drag a zip onto the window, or press **+**.
2. Look at what arrived in **Browse**: every model, sprite and sound Tessera found inside.
3. Answer anything waiting in **Review**, which is where a pack goes when its license or source is
   not clear from the download itself.
4. Turn on **backups** in Settings. A library is your own work, and one copy is no copy.
