# When something looks wrong

## macOS says it cannot verify the app

The build is not signed with a paid Apple certificate. Press **Done**, then open **System
Settings**, **Privacy & Security**, scroll to Security and press **Open Anyway** beside Tessera.
Only the first time. On macOS 14 and earlier, right-click Tessera and choose **Open** instead.

## Windows says it protected your PC

Same reason. Choose **More info**, then **Run anyway**. Only the first time.

## A pack is missing from search

Check **Review**: a pack waiting there is deliberately out of search until it has a license and a
source. Check **Archive** too, and whether a filter is still on.

## Thumbnails are missing or grey

They are drawn in the background and cached. Settings, Previews and index, can build them for the
whole library, retry the ones that failed, or clear them and start again. A format nothing can draw
shows its file type instead.

## Something changed on disk and Tessera did not notice

It watches the library folder, but a big change made while it was closed can be missed. Settings,
Previews and index, **Read the library again** reads every pack from scratch.

## A download will not fetch

Some pages need a browser to click through. Open the page yourself, copy the link to the file, and
paste that instead. Sites Tessera knows are listed on the [Downloads](/docs/downloads) page.

## A backup or sync will not start

Both need a helper program: Kopia for backups, Syncthing for sync. Settings, Helpers, shows whether
each is there, its version, and a button to fetch it again.

## Reporting a problem

Settings, Privacy and problems, **Report a problem** opens an issue with your system, the version
and the recent log already filled in. Nothing is sent until you press send, and you can read
exactly what it contains first.
