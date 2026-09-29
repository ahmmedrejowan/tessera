# What's new in Tessera

## 0.2.0: the second preview (29 September 2026)

Still a preview, and the last one before the finished version. Two things in it are worth knowing
about before you rely on them: backups and sync have never been restored or paired by anybody but
their tests. Keep a copy of anything you cannot lose.

- **A copy into a game never writes over your work.** Where the game already has a file under a
  name a copy wants, the two are compared byte for byte with SHA-256. The same file is left alone
  and nothing is written. A different file stops and asks: keep what the game has, write over it,
  or keep both, with Tessera's copy coming in beside yours as "name (2)". Keeping yours is what is
  offered first, and it is what an agent gets unless it is told otherwise.
- **Taking a pack into the library brings its records with it.** A pack read where it lies has its
  files renamed when it is copied in, and the star, the collections, the pack's own part-license
  rules and every game that had taken from it now follow the rename instead of pointing at a name
  that no longer exists.
- **A game's page** has the same head as a pack's, and three tabs: what has been copied in, the
  credits file, and its settings. The credits are shown both ways at once, the markdown beside what
  it comes out as, so a missing credit line is visible before anybody else reads it.
- **One queue for everything that writes to the library.** Importing, deleting, restoring, taking a
  pack in and adding files take turns in the order they were asked for, so two of them can no
  longer land in each other's folders.
- **What every file contains** is worked out in the background and remembered, which is what finds
  duplicates, recognizes an asset a game already has, and answers "have I got this already".
- **American spelling throughout**, with libraries written by the first preview still read as they
  are and moved over on their next save.
- **While something is on its way** the window draws the shape of the page rather than a spinner,
  and says so if opening the library is taking long enough to suggest your computer is waiting for
  an answer about folder permission.
- **The version is beside the name** at the top left, so a problem report can say which one.

## 0.1.0: the first preview (25 September 2026)

The first working version, published as a preview: everything below is in the app today, and the
parts that touch somebody's own files have been held to it. Treat it as a preview all the same,
keep a copy of anything you cannot lose, and tell me what breaks.

- **Libraries**, as many as you like, each its own folder of ordinary files and folders. The
  switcher at the top right moves between them; each keeps its own settings, backups and sync.
- **Packs kept whole**: your download is copied in as it is, archives included, and read inside
  for what it holds: models, textures, sprites, UI, audio, music, fonts and HDRIs.
- **License and source on record**: read from the pack's own files where possible, with a page
  snapshot and an archive.org copy kept as proof. Anything unclear waits in Review.
- **Adding**: drag packs in, choose files or a folder, or paste links; a full page opens with
  everything Tessera could work out already filled in, and batches are filled in once for many.
- **Add to a pack you already have**: more files into a pack in the library, from its page or by
  dropping them on it, with a place inside the pack and terms of their own if they came from
  somewhere else.
- **Starred, archived, binned**: star anything worth coming back to; archive a pack you want kept
  but out of the way; deleting means the library's own bin, which puts things back where they were.
- **AI agents**: while Tessera is open it answers agents on this computer alone, with 65 tools
  covering everything the window can do. You choose what they may reach; the app's own settings and
  deleting for good start switched off. Every call is listed, and every change is in Activity.
- **Update checks and error reports**, both on your say-so and neither carrying anything about you.
- **Sites you've settled**: tell Tessera a site's packs are CC0 and its next ones fill themselves.
- **Downloads**: bring links, one or a list; asset pages from Kenney, Poly Haven, ambientCG,
  OpenGameArt, GitHub releases, Google Drive and Dropbox lead to the file behind them. Pause,
  carry on, retry, and a few at a time.
- **Finding**: search across packs, assets and tags, with filters by type, format, source,
  creator, license, genre, style and tags. Collections, and saved searches that keep themselves up
  to date.
- **Game projects**: Unity, Godot, Unreal or any folder: assets arrive with their textures, a
  license file per pack and a CREDITS.md kept up to date.
- **Backups and sync**: encrypted backups with Kopia to a drive, a cloud drive, cloud storage or
  a server; sync between your own computers with Syncthing.
- **Previews**: 3D models, images, HDRIs, sounds and fonts, shown in the app.
- **Where it runs**: macOS on Apple Silicon and Intel, Windows 10 and 11, and Linux as an
  AppImage, a .deb or an .rpm.
