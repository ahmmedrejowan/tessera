# What's new in Tessera

## 1.0.1: a library of real size (9 October 2026)

A fix release, written while moving a library of 564 packs and 141,609 files into 1.0.0. Nothing
here is new; all of it is 1.0.0 failing at a size the first release had never been given.

### Browsing is no longer a freeze

Choosing a license or a kind while browsing **packs** locked the window, for seconds or longer.
A pack records its own license, but the filter reached into every asset in the library to answer a
question already written on the pack: a tenth of a second's work done as a seven second scan, and
once for every heading in the filter list. It reads the pack now. Filtering by source or creator
was never affected, which is what made it so hard to see.

### Scrolling is smooth

A grid of tens of thousands of things told the rest of the app about every row the scroll crossed,
and the app redrew every tile each time. It now notices a new page rather than a new row.

### Reading what your files contain

Tessera works out the contents of every file so it can tell you what you already have. On a large
library this took around an hour, and for all of it the window was slow and said nothing about why.

- It is **visible work** now, with a count and progress, next to everything else.
- Three quarters of a library sits inside zips, and a zip already records a checksum for each file
  it holds. That is taken rather than worked out again, so most files are never read at all, and
  full checksums are kept for the few that need telling apart.
- It gives way between files, so the window stays answerable while it runs.

### Updating keeps what it already worked out

**This is the important one.** Opening a 1.0.0 library in a newer version threw away every
checksum it had and spent the hour again, quietly, because the part that must survive an update
was being recreated instead of carried forward. It is carried forward now.

### Smaller things

- `brew install --cask` really does clear the download flag now. The notes claimed it already did;
  it did not, and Gatekeeper stopped the first launch exactly as for a hand-downloaded dmg.
- A pack whose files could not be drawn kept being asked for, for ever, instead of being noted and
  left alone, which held a core at nothing.
- A license recorded for part of a pack can be taken away again.
- Agent tools say the things that are only obvious once you have got them wrong, chiefly that
  adding several packs answers in name order rather than the order you asked.

## 1.0.0: the first release (30 September 2026)

Tessera keeps every game asset you have collected in one place, with its license and its source on
record, and puts it into your game with the credits written for you.

This is the first version I am willing to call finished. Two previews came before it; what changed
between them and this is at the bottom. Everything here has been used, not only tested: the backups
were made and restored onto a computer that had never seen the library, and every file came back
byte for byte.

### Your library

A library is an ordinary folder of ordinary files. No database you cannot open, no format only
Tessera can read: your packs are in there exactly as they arrived, and if Tessera vanished tomorrow
you would still have everything. Keep as many libraries as you like, on internal drives, external
ones or a network share, and switch between them from the top right. Each carries its own settings,
backups and sync.

Packs too big or too many to copy can be **read where they lie** instead, indexed in place with
nothing written to their folder, and taken into the library later if you change your mind.

### Getting things in

Drag packs onto the window, choose files or a folder, or paste a link and let Tessera fetch it.
Asset pages from Kenney, Poly Haven, ambientCG, OpenGameArt, GitHub releases, Google Drive and
Dropbox are followed to the file behind them. Downloads pause, resume and retry, a few at a time.

Your download is copied in as it arrived, archives included, and read **inside** for what it holds:
models, textures, sprites, UI, audio, music, fonts and HDRIs. Nothing is unpacked, renamed or
re-encoded. Add more files to a pack you already have, with a place inside it and terms of their
own if they came from somewhere else.

### The license, and the proof

This is the part the rest is built around. Tessera reads the license and the source from the pack's
own files where it can, and keeps a page snapshot and an archive.org copy as proof of what the
terms were on the day you got it. A pack whose terms are unclear waits in **Review** rather than
joining the library on a guess, and parts of a bundle can carry terms of their own.

Tell Tessera that a site's packs are CC0 and the next one from that site fills itself in.

### Finding it again

Search across packs, assets and tags, with filters for type, format, source, creator, license,
genre, style and tags, and sorting that makes sense for each. Collections gather things by hand, or
by a rule that keeps itself up to date. Star what you keep coming back to; archive what you want
kept but out of the way.

Tested at 400 packs and 120,000 files: the first page of assets in 37 ms, a search in 62 ms.

### Looking at it

3D models, images, HDRIs, sprites, sounds and fonts, previewed in the window without unpacking
anything, including files inside archives. Contents are read once and remembered, in the background
and out of your way.

### Into your game

Link a Unity, Godot or Unreal project, or any folder. Assets arrive in the format that engine reads
best, with the textures and materials they depend on, a license file for each pack beside them, and
a `CREDITS.md` kept up to date as you add and remove things.

A game you have been making for years is handled too: **Find assets already here** matches what is
in your project against your library by content rather than by name, and records them where they
are, so your credits cover what you actually ship without a second copy of anything.

Nothing is ever written over without asking. Where your game already has a file under a name a copy
wants, the two are compared byte for byte and only a genuinely different file stops to ask: keep
yours, write over it, or keep both.

### Keeping it safe

Encrypted backups through Kopia, to a drive, a cloud drive, cloud storage or your own server, with
a recovery kit that holds everything needed to restore on a computer that has never seen the
library. Pause them for a while without letting go of anything, or disconnect and keep the backups
you have. Sync a library between your own computers with Syncthing, with nothing in the middle.

Deleting means the library's own bin, which puts things back where they were.

### AI agents

While Tessera is open it answers agents on this computer alone, with 65 tools covering everything
the window can do. You choose what they may reach, and the app's own settings and deleting for good
start switched off. Every call is listed and every change is in Activity, so you can see what was
done in your name.

### Where it runs

macOS on Apple Silicon and Intel, Windows 10 and 11, and Linux as an AppImage, a .deb or an .rpm.
Install with Homebrew, winget, Scoop, Chocolatey or the AUR, or download it directly.

### What changed since the previews

- A copy into a game compares contents with SHA-256 before it writes, and a name already taken is
  a question rather than a silent skip.
- Taking a pack into the library brings its records with it: stars, collections, part-license rules
  and every game that had taken from it.
- A game's page has the same head as a pack's, with tabs for what it has taken, its credits file
  shown as both markdown and the result, and its settings.
- One queue for everything that writes to the library, so two operations can no longer land in each
  other's folders.
- Backups can be paused without being disconnected, and both say what they will do before they do
  it and what happened afterwards.
- Choosing a cloud folder for backups says what that means, and suggests a folder that can actually
  be written to.
- The shape of the page arrives while it loads, rather than a spinner that says nothing.

### Said plainly

- The builds are **not signed**. macOS says it cannot verify the app; the way past it is System
  Settings, Privacy & Security, Open Anyway. Windows shows a SmartScreen warning.
- **Linux** is built and tested on every change, and the app is driven end to end there by the test
  suite, but no person has yet sat down and used it. Changes made outside Tessera are not noticed
  on Linux while it is open.
- A library has **one backup place**. Setting up a second replaces the first.
- Backing up **into a folder your cloud app syncs** means Tessera is finished when the files are
  written; your cloud app uploads them afterwards, on its own schedule. Signing in to the provider
  instead uploads from Tessera and can tell you when it is done.

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
