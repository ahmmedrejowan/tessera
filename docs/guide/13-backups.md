# Backups

A library is your own work, gathered over years. Tessera can keep encrypted copies of it somewhere
else, and put them back if the worst happens.

Backups use [Kopia](https://kopia.io), which Tessera fetches for you the first time, checksum
verified. Each library is backed up on its own.

## Setting one up

**Settings**, then **Backups**, then **Set up**. Choose where the copies go:

- **A folder**: this computer, an external drive, or a folder a cloud client already syncs.
- **A cloud drive**: Google Drive, OneDrive, Dropbox, Box, pCloud, or iCloud Drive through its
  folder.
- **Cloud storage**: Amazon S3, Backblaze B2, Cloudflare R2, Wasabi, DigitalOcean Spaces, Google
  Cloud Storage, Azure, or any other S3-compatible service.
- **Your own server**: SFTP or WebDAV.

### A folder your cloud app syncs, or signing in?

Both reach the same cloud, and they are not the same thing.

Choose **a folder** inside Google Drive, Dropbox, OneDrive or iCloud and Tessera writes the backup
into it. Your cloud app uploads it afterwards, on its own schedule and behind anything else it has
queued. Tessera is finished when the files are written, which can be a long time before they are
anywhere but this computer, and neither app can tell you when that changes. If you do this, set the
cloud app to keep files online rather than copied here as well, or the backup takes the same space
again on your disk: **Stream files** in Google Drive, **Files On-Demand** in OneDrive,
**Online-only** in Dropbox, **Optimize Mac Storage** for iCloud.

Choose **a cloud drive** and sign in, and Tessera uploads it itself. The progress you see is the
upload, when it says the backup is done the copy is really in the cloud, and nothing on your disk
is doubled. For a cloud you have signed into, this is the one to take.

Then set a password. It encrypts the backup, and **it is the only way in**. Tessera can generate
one, save it to your keychain, and print a recovery kit that holds everything needed to restore on
a computer that has never seen this library.

## Pausing, and letting go

Two different answers to "not right now", and the Backups screen keeps them apart.

**Pause** stops Tessera backing up on its own. Where the backups go, the password and how often are
all kept, so starting again carries on rather than beginning a new set. **Back up now** still works
while it is paused. This is the one for a slow connection, a trip, or a week of heavy work.

**Disconnect** lets go of the place the backups go and forgets its password. The backups already
made are not deleted: they stay exactly where they are, and you can still restore from them with
**From a backup**, as long as you have the password. This is what to use before setting backups up
somewhere else. Setting them up again starts a new set from nothing, so the old ones sit there
until you delete them yourself.

Both ask first, and say what happened afterwards.

## While it runs

Backups happen while Tessera is open: every day, every few hours, or only when you press **Back up
now**. The activity bar shows progress, and the Backups screen shows when the last one finished
and how much was sent.

Only what changed is uploaded, so the second backup of a large library is quick.

## Restoring

**Restore** lists every snapshot with its date. Choose one, choose where it should land, and
Tessera writes it back beside your library rather than over it, so nothing is lost if you picked
the wrong one.

To restore on another computer you need the location, the password and, for some providers, the
key file: exactly what the recovery kit holds.

## What is backed up

The library folder: packs, their originals, their licenses and proof, and collections. Not the
library's own settings, which are kept on this computer, and not the search index or the
thumbnails, which are made again from the packs.
