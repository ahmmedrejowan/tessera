# Sync

Sync keeps one library the same on two or more of your own computers, over your own network,
through [Syncthing](https://syncthing.net). There is no account, no server in the middle, and
nothing goes through anybody else's service.

Sync is not a backup. It copies what you did, including a deletion. Keep backups as well.

## Setting it up

**Settings**, then **Sync**. Tessera can fetch Syncthing for you (about 12 MB, checksum verified,
no installer and no administrator password), or use one you already have.

On the first computer, turn sync on. On the second, use **Receive from another computer** on the
welcome screen, or pair from Settings. Each computer shows a short code to confirm the other, so
only computers you approve join.

## What syncs

The library folder itself: packs, originals, licenses, collections and the library's settings. Each
computer keeps its own index and thumbnails, which are rebuilt locally.

## While it runs

The Sync screen shows the computers paired, what is being sent or received, and when each was last
seen. Sync runs while Tessera is open, and pauses while another library is open if you ask it to.

## Unpairing

Unpair a computer and nothing is deleted on either side; they simply stop talking. Turning sync off
leaves both copies exactly as they are.
