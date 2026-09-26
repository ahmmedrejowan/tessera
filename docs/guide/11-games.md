# Games and projects

Linking a game tells Tessera where your project is, so assets can be copied in with the format that
engine prefers and the credits written for you.

## Linking one

**Projects**, then **Link a game**, and choose the folder. Tessera recognises:

- **Unity**, by `ProjectSettings/ProjectVersion.txt`. Assets land in `Assets/ThirdParty` by
  default, and Tessera notices whether the project has a glTF importer.
- **Godot**, by `project.godot`. Assets land in `assets/third_party`.
- **Unreal**, by its `.uproject`. Assets land in `Content/ThirdParty`.
- **Any folder**, for anything else. Assets land in `assets`.

You can change the folder assets go into, and where the credits file is written, at any time.

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
