# Questions people ask

The [step by step guide](guide.md) covers how to use Tessera. This is the rest: the things people
want to know before they trust an app with a collection they have spent years building.

## Getting started

**What is Tessera for?**
Keeping the game assets you collect, with their licences and sources on record, so you can find a
piece in seconds and drop it into a game with its credits written for you.

**Does it work offline?**
Yes, entirely. The only things that use the network are ones you start: downloads, backups, sync,
an update check, and fetching a helper program.

**Which systems?**
macOS, Windows and Linux. The same app, the same library format; a library copies between them.

**Is it free?**
Yes, and free software: GPL-3.0-or-later. You can read how it works, change it, and pass it on.

**Can I install it with a package manager?**
Yes, on every system. macOS: `brew tap ahmmedrejowan/tessera && brew install --cask tessera`.
Windows: `winget install Rejowan.Tessera`, or Scoop, or Chocolatey. Arch Linux: `yay -S
tessera-bin`. On a Mac, Homebrew is the easiest route, because it clears the download flag as it
installs and macOS then opens Tessera without asking you to allow it.

**Why does macOS say it cannot verify Tessera is free from malware?**
Because the build is not notarised by Apple, which costs ninety-nine dollars a year that a free
program would rather not spend. The app is not damaged and nothing has gone wrong with the
download. Press Done on the warning, then open System Settings, Privacy & Security, scroll to
Security, and press Open Anyway beside Tessera. Confirm with Touch ID or your password, then press
Open. Only the first time. On macOS 14 and earlier, right-clicking Tessera and choosing Open does
the same thing.

**macOS says Tessera is damaged instead. What now?**
That means the download was flagged on the way in rather than the signature being unrecognised.
Clear the flag and open it again:

```bash
xattr -dr com.apple.quarantine /Applications/Tessera.app
```

## Your files

**Where does Tessera put my packs?**
In the library folder you chose, under `packs/`, one folder per pack, with the download inside
exactly as it came. Ordinary files: open the folder any time.

**Does it change my files?**
No. A download is copied in as it is. Archives are kept as archives and read inside rather than
unpacked. What Tessera adds is a small `pack.json` beside each pack.

**Can I move my library?**
Yes. Close Tessera, move the folder, then open it from the switcher at the top right. The index is
rebuilt on its own.

**What if I add or remove files by hand?**
Tessera watches the folder and notices. If something looks stale, Settings, Previews and index,
Read the library again.

**How big can a library get?**
Bigger than you will make it. A test library of 400 packs and 120,000 files searches in under a
tenth of a second and opens in under three seconds.

**Do I need to keep the zips?**
Tessera keeps them, on purpose: the original download is the thing your licence was granted for,
and a zip read from the inside costs nothing.

## Licences

**Why does a pack wait in Review?**
Because it has no licence, or nothing saying where it came from. A pack in Review cannot be copied
into a game, which is the point: the app should never be the reason you shipped something you
could not account for.

**Where does the licence come from?**
Read from the pack's own files where possible (`LICENSE.txt`, a readme, the site's page), or from
a rule you set for a site, or typed in by you. It says which of those it was.

**Can one file in a pack have different terms?**
Yes. A file or a folder can carry its own licence, and the most exact rule wins for any file.

**What happens when I put an asset in a game?**
The files are copied in, a licence file goes beside them, and `CREDITS.md` is kept up to date with
what each pack asks for. A licence that forbids commercial use is not blocked, but it is flagged,
because that is a choice only you can make.

**Does Tessera check licences for me legally?**
No. It records what the pack says and shows it to you plainly. It is a filing system, not a lawyer.

## Privacy and safety

**What leaves my computer?**
Only what you start: downloads from the sites you point at, backups to the place you set up, sync
between your own computers, an update check that reads a list of releases, and an error report if
you choose to send one. No accounts, no telemetry, no analytics. `PRIVACY.md` is the full answer.

**What is the port 7458 thing?**
The door for AI agents, open only while the app is. It listens on this computer alone: nothing on
your network or the internet can reach it, and a web page cannot use it either. Settings, AI
agents turns it off.

**Can an agent delete my library?**
Deleting means the library's bin, which keeps everything. Emptying it for good needs a group of
tools that starts switched off and is marked in red. Every call an agent makes is listed in the
app.

**Are my backups readable by anyone else?**
No. Kopia encrypts them with your password before they leave. Keep the password: without it the
backup cannot be opened, by you or by anyone.

## When something looks wrong

**A pack shows no pictures.**
Previews are drawn in the background; a big pack takes a while. Settings, Previews and index shows
how far it has got. Some files have nothing to draw, a `.blend` for instance, and still search and
copy correctly.

**Search is not finding something I know is there.**
Check the scope: Review is separate from the library, and archived packs are out of browsing on
purpose. Failing that, read the library again from Settings.

**The app will not open my library.**
If the index is the problem, Tessera throws it away and builds it again by itself. If the folder
has moved or is on a drive that is not connected, the welcome screen says so and offers to find it.

**Something went wrong and I want to report it.**
Help, then Report a problem. It gathers what happened, this session's errors and the recent log,
shows you the lot, and sends nothing until you say so. Names of files, packs and folders are taken
out first.

**Where are the logs?**
Help, then About, then Show the log folder.

## The project

**Who makes this?**
One person. That is why it says no to features rather than half-doing them.

**Can I help?**
Yes: `CONTRIBUTING.md`. Issues and pull requests are welcome; a note before a big change saves
everyone work.

**How do I know a download is really yours?**
Every release lists the SHA256 of every file.
