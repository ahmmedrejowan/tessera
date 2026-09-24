# Privacy

Tessera is a desktop application. Your library, its index, previews and settings are files on your
own computer, and nothing about them is collected by anyone.

## What stays on this computer

- Your library folder, exactly where you put it, as ordinary files.
- Tessera's own data folder: the index, previews, downloads waiting to be added, logs, and the
  list of libraries with their settings.
- Backup passwords, in the system keychain, or, if you chose that, in a file only you can read.

## What leaves this computer, and only when you ask

- **Downloads.** Tessera fetches the links you bring, from the sites those links point at. It
  sends nothing but the request for the file.
- **Page snapshots.** Made on this computer, from the page a pack came from.
- **archive.org copies.** While that switch is on, Tessera asks the Internet Archive to keep a
  public copy of the page a pack came from. Only the address is sent.
- **Update checks.** A read of the project's published release list. No identifier, no version
  report, nothing about your library.
- **Backups.** Only to the place you set up, encrypted before they leave, with your password.
- **Sync.** Directly between computers you have paired, over your own network.
- **Error reports.** Never sent without your say-so, and only to a Sentry-compatible service run
  for Tessera. You see exactly what a report contains first; names of files, packs and folders are
  removed, and nothing says who you are. A build made without that setting cannot send one at all.
- **Helper programs.** If you turn on backups or sync, Tessera offers to fetch Kopia, rclone or
  Syncthing from their own projects' releases on github.com, and checks what it downloaded against
  the checksum published with it. Nothing about you is sent with the request.

## What it opens on this computer

- **A door for AI agents**, while the app is open: an address on this computer alone
  (127.0.0.1, port 7458 by default). Nothing on your network or the internet can reach it, a web
  page cannot use it, and you choose which tools an agent may call. It can be switched off in
  Settings, and every call it answers is listed in the app.

## Files outside your library

Tessera reads and writes outside the library only where you point it:

- Files and folders you add, from wherever you chose them.
- A game's folder, when you link assets into it: the assets, a licence file beside them, and the
  credits file.
- The place you set up for backups.
- Its own helper programs, and the usual places those are installed, when it looks for them.
- An agent's settings file, when you press Set it up on the AI agents page. It reads the file,
  adds Tessera's own entry, and keeps a copy of the old one beside it.

## What Tessera never does

- No accounts, no telemetry, no analytics, no advertising identifiers.
- No reading of your disk at large: only the library, its own data folder, and what you point it at.
- No selling or sharing of anything, because there is nothing collected to share.

## Getting in touch

Questions about any of this: hello@rejowan.com.
