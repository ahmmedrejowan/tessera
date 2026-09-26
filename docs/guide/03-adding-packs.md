# Adding packs

A pack is one download: a zip, a folder, or a few files you got together. Tessera copies it in
exactly as it arrived and reads inside to list what it holds. Archives stay archives.

## The ways in

- **Drag and drop.** Drop zips, folders or loose files anywhere on the window.
- **The + button** (`⌘O` / `Ctrl+O`):
  - *Add downloads*: every zip you choose becomes its own pack; loose files chosen together become
    one pack.
  - *Add a folder*: the folder is one pack.
  - *Add a folder of packs* (`⌘⇧O` / `Ctrl+Shift+O`): every zip and folder inside becomes a pack.
- **Downloads**: paste a link and let Tessera fetch it. See [Downloads](/docs/downloads).
- **An agent**: an assistant on your computer can add packs through the tools you allow. See
  [AI agents](/docs/agents).

## What happens next

Before anything is copied, Tessera shows you the plan: every pack it is about to add, what is
inside each, and anything it already recognises. A download that is already in the library is
flagged so you do not add it twice.

While it copies, it reads each pack:

- **What is inside**, including inside archives: models, textures, sprites, UI, audio, music,
  fonts, HDRIs and documents.
- **The license**, from the pack's own license and readme files.
- **Where it came from**, from the file name, the download's link, or the site's own conventions.
- **The creator**, where the pack says.
- **A cover**, drawn from a preview image or from the pack's own models.

A pack whose license and source are clear goes straight into the library. Anything else waits in
[Review](/docs/review) until you answer.

## Adding to a pack you already have

Open the pack and press **Add files**. New files are copied into the same pack, read the same way,
and the pack's record is updated. This is how a pack that shipped in two downloads becomes one
pack.

## What Tessera never does

- It does not unpack your archives. What you downloaded stays exactly as it was.
- It does not rename or move your files inside the pack.
- It does not upload anything.
