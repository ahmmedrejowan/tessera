# Adding packs

A pack is one download: a zip, a folder, or a few files you got together. Tessera copies it in
exactly as it arrived and reads inside to list what it holds. Archives stay archives.

Your own file stays where it is: the library works on its own copy. The Add page says which
library the pack is going into, and offers to remove the original once the copy is safely in.
That copy is always made and read back first, so nothing can be taken until the pack is there,
and canceling always leaves your file alone. A folder you pointed at is never emptied, and an
agent never moves anything. A download Tessera fetched for you stays in Downloads until you add
it, and then follows the same answer as anything else.

## Copy, move, or index where they are

Adding asks one question before it writes anything, and the three answers do very different
things to your disk:

- **Copy into the library.** The library holds its own copy, backed up and synced with everything
  else. Your originals stay exactly where they are. This is the right answer for a download, and
  it is the default.
- **Move into the library.** The same, but the originals are removed once the copy is safely in
  and has been read back. Not offered for a folder you pointed at: adding a folder never empties
  it.
- **Index where they are.** Nothing is copied and nothing moves. Tessera reads the files where
  they sit and keeps the record here: the license, the tags, the collections, all of it. It never
  writes in that folder, ever, so it works on a read-only drive or a network share.

That third answer is for somebody who already has a lot of assets arranged the way they like
them, or more of them than they want a second copy of. It comes with one real cost, said on the
card and again on the pack: **the files are not backed up and not synced**, because they are not
in the library. The record is. If you change your mind, a pack's page has "Take it into the
library", which copies the files in and leaves the folder they came from untouched.

Only a whole folder can be indexed where it lies. An archive or a handful of loose files has no
folder of its own to stand for the pack, so those are copied in.

If the drive is not plugged in, the pack says so, keeps everything it knows about its files, and
offers to find the folder again. Nothing is deleted because a drive was away.

## The ways in

- **Drag and drop.** Drop zips, folders or loose files anywhere on the window.
- **The + button** (`⌘O` / `Ctrl+O`):
  - *Choose files…*: every zip you choose becomes its own pack; loose files chosen together become
    one pack.
  - *Choose a folder…*: one pack, or several if the folder turns out to hold a pack in each
    subfolder. Tessera looks and decides, and tells you which it did before anything is added.
  - *Download from a link…*: see [Downloads](/docs/downloads).
- **A folder of packs** (`⌘⇧O` / `Ctrl+Shift+O`, or the button on Home): every zip and folder
  inside becomes a pack, without Tessera deciding for you.
- **Downloads**: paste a link and let Tessera fetch it. See [Downloads](/docs/downloads).
- **An agent**: an assistant on your computer can add packs through the tools you allow. See
  [AI agents](/docs/agents).

## What happens next

Before anything is copied, Tessera shows you the plan: every pack it is about to add, what is
inside each, and anything it already recognizes. A download that is already in the library is
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
