# Games and projects

Linking a game tells Tessera where your project is, so assets can be copied in with the format that
engine prefers and the credits written for you.

## A game you have been making for years

Most projects are not new. `Assets/Art` is already full, your scenes already point at those
paths, and Unity has already assigned GUIDs. Copying the same assets in from the library would
give you a second copy at a new path that nothing references, and leave the first lot as
unlicensed as they were.

So Tessera can recognize what is already there instead. Open the game and choose **Find assets
already here**, name a folder (`Assets` works, it just takes longer), and Tessera matches what it
finds against your library **by content, not by name**. What matches is recorded at the path the
game already uses. Nothing is copied, nothing moves, no path changes, and your credits file then
covers what the game actually ships.

Two things worth knowing:

- An asset you re-exported, edited or converted will not match, because it is no longer the file
  the license was recorded against. That is deliberate.
- Taking a recognized asset back out of the game forgets the record and leaves the file alone.
  Tessera never wrote it, so it never deletes it.

The same offer appears when you link a pack into a game, because that is the moment you would
otherwise make the second copy.

## Linking one

**Projects**, then **Link a game**, and choose the folder. Tessera recognizes:

- **Unity**, by `ProjectSettings/ProjectVersion.txt`. Assets land in `Assets/ThirdParty` by
  default, and Tessera notices whether the project has a glTF importer.
- **Godot**, by `project.godot`. Assets land in `assets/third_party`.
- **Unreal**, by its `.uproject`. Assets land in `Content/ThirdParty`.
- **Any folder**, for anything else. Assets land in `assets`.

You can change the folder assets go into, and where the credits file is written, at any time.

Before anything is written, Tessera shows what is going: how many assets and files, how big, and
the exact folder they will land in. Turn that off from the dialog or in Settings if you would
rather not be asked; a license problem still stops for an answer. Assets are only ever copied into
a game, never moved, because the library has to keep the pack whole for the record to mean
anything.

## What a copy does

- **A real copy**, not a link: the file is written into your project, so the project builds on a
  computer that has never heard of Tessera.
- **The right format**: Unity gets glTF when it can import it and FBX when it cannot; Godot gets
  glTF; Unreal gets FBX. Images are copied in a format the engine reads.
- **Everything it needs**: textures, materials and other files a model depends on come with it.
- **The credits**: `CREDITS.md` is rewritten from the record, with the packs that ask for credit
  first and the rest listed as thanks.

## What is written where

- In your game: the files themselves, the credits file, and `.tessera/manifest.json`, a record of
  every asset copied, which pack it came from, its license, its credit line and when it arrived.
- In Tessera: which games you have linked, where they are, and what each has taken.

## Keeping a game up to date

A game's page lists everything copied into it, grouped by pack. From there you can copy a pack
again after it changed, remove assets you no longer use, or unlink the game entirely, which leaves
your project exactly as it is and only forgets it here.
