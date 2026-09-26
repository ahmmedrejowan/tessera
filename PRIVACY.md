# Privacy

This is the privacy policy for both halves of Tessera: the desktop application, and the website at
tessera.rejowan.com. It is written by the person who makes both, and it is short because there is
very little to say.

Tessera is a desktop application. Your library, its index, previews and settings are files on your
own computer, and nothing about them is collected by anyone. There is no account, no sign-in, no
telemetry and no profile. Nobody, including the author, can see what is in your library.

**Who is responsible.** K M Rejowan Ahmmed, the author of Tessera. Anything about this policy:
hello@rejowan.com.

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

## The website

tessera.rejowan.com is separate from the application and knows nothing about your library.

- **Hosting.** It is served by Vercel, which keeps ordinary request logs (address, time, page,
  user agent) for a short period to run and protect the service. They are not read by the author
  for any other purpose.
- **Analytics.** Vercel Web Analytics counts page views and the country and kind of device they
  came from. It sets no cookies, keeps no identifier that follows you between days or sites, and
  the counts are only ever seen in aggregate.
- **No cookies, no advertising, no third-party scripts.** The fonts, images and scripts are served
  from the site itself.
- **What the pages read.** The site asks GitHub for the list of releases and for the documents in
  this repository, from the server, so your browser never talks to GitHub unless you follow a link.
- **Downloads** go to GitHub's release files, under GitHub's own terms, and your browser makes
  that request directly.
- **Theme and other preferences**, if the site ever keeps one, live in your own browser's storage
  and are never sent anywhere.

## The builds are not signed, and what that means

Tessera's builds are not signed with a paid Apple Developer certificate or a Windows code-signing
certificate. Those cost money every year, and this is a free project.

What follows from that, honestly:

- **macOS and Windows each warn you once** the first time you open it. The install page shows
  exactly what each one says and which button to press.
- **The warning is about the certificate, not about the file.** Neither system has found anything
  wrong; they simply cannot tell you who published it.
- **You can check the file yourself.** Every release publishes the SHA-256 of every file, the
  install page shows each one beside its download, and every file carries a signed record of the
  commit and the workflow that built it:
  `gh attestation verify <file> -R ahmmedrejowan/tessera`.
- **Take builds only from the two official places**: the releases on
  github.com/ahmmedrejowan/tessera, or the download buttons on tessera.rejowan.com, which point at
  exactly those files. A copy from anywhere else is not something this project can vouch for.
- **Tessera never updates itself.** It tells you when a newer version exists and links to it;
  installing is always your own doing.
- **It never asks for administrator rights**, and it does not install a service, a driver, or
  anything that runs when the app is closed.

If the project is ever able to sign its builds, the warnings will go and this section will say so.

## Keeping things safe

- **Backup passwords** are kept in your system keychain, or, if you chose that, in a file only you
  can read. The backup itself is encrypted on this computer before it is sent anywhere.
- **The door for AI agents** is on 127.0.0.1 only, is off until you turn it on, and closes when the
  app does.
- **Helper programs** (Kopia, rclone, Syncthing) are fetched from their own projects' releases and
  checked against the checksum published with them.

## Children

Tessera is a tool for making games. It is not directed at children, and it collects nothing from
anybody, of any age.

## Your rights

Since neither the application nor the website collects personal data, there is nothing held about
you to see, correct, export or delete. Vercel's short-lived request logs are the only exception,
and they are not linked to a person by this project. If you believe something here is wrong, write
and it will be looked into.

## Changes to this policy

It lives in the project's repository, so every change is public and dated in the history. A change
that matters will also be noted in the release that carries it.

## Getting in touch

Questions about any of this: hello@rejowan.com.
