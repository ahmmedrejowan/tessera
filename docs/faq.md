# Questions people ask

The [guide](guide/01-getting-started.md) covers how to use Tessera. This is the rest: the things people
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

**Do I need an account?**
No. There is nothing to sign up for, nothing to sign in to, and no server that knows you exist.

**How much disk space does it need?**
The application is about 250 MB installed. Your library is as big as the packs you put in it:
Tessera copies each download in once and adds a small record beside it. Thumbnails and the search
index are a few percent on top, and both can be cleared and made again.

**Which computers does it run on?**
macOS on Apple silicon and Intel, Windows on x64 and Arm, and Linux on x86-64 as an AppImage, a
.deb or an .rpm. There is no mobile or web version, and none is planned: it works on your own files
on your own computer.

**Is it free?**
Yes, and free software: GPL-3.0-or-later. You can read how it works, change it, and pass it on.

**Can I install it with a package manager?**
On a Mac and on Windows with Scoop, yes:
`brew tap ahmmedrejowan/tessera && brew install --cask tessera`, or
`scoop bucket add tessera https://github.com/ahmmedrejowan/scoop-tessera` then
`scoop install tessera`. Homebrew 7 asks before it loads anything from a tap that is not its own;
if it does, run `brew trust --cask ahmmedrejowan/tessera/tessera` and install again. Homebrew is
the easiest route on a Mac, because it clears the download flag as it installs and macOS then opens
Tessera without asking you to allow it. winget, Chocolatey and the AUR do not carry it yet.

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

## How it compares

**How is this different from a folder of zips?**
A folder knows file names. Tessera knows which pack a file belongs to, who made it, where it came
from, what it allows, and which of your games already use it. It can also look inside the zips, so
one search covers everything you have downloaded without unpacking any of it.

**How is it different from an engine's asset store?**
A store sells you things. Tessera keeps what you already have, from anywhere: a store, a bundle, a
jam, a friend, or something you made. It never needs the store to be online, or the account you
bought with.

**Is it an asset manager like Eagle or Bridge?**
It is close, but built for game assets and their terms: models with their formats and triangle
counts, sounds, fonts, HDRIs, licences, credits, and a way into Unity, Godot and Unreal. It is not
a general image organiser.

**Does it work with version control?**
Yes, because it changes nothing about your project except the files it copies in. Those are
ordinary files: commit them, or ignore the folder and let each person link their own library.

**Can two games use one library?**
Yes. A library can feed as many games as you like, and a game can take from more than one library.
Each game's record says which library each asset came from.

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

## Formats

**Which kinds of file does it understand?**
Models in glTF, GLB, FBX, OBJ, DAE and STL; images and sprites in PNG, JPEG, WebP, SVG, TGA and
PSD; textures in the usual PBR sets; audio in OGG, WAV, MP3 and FLAC; fonts in TTF, OTF and WOFF;
HDRIs in HDR and EXR; and documents such as licences and readmes. Anything else is kept and listed
as a file: nothing is thrown away because it was not recognised.

**Can it preview a model without a game engine?**
Yes. Models turn in 3D in the window, with their triangle and vertex counts, materials, size and
animations, read straight out of the archive.

**Does it open .blend or .unitypackage?**
It keeps them and lists them, but it cannot look inside a .blend or a .unitypackage, so their
contents are not searchable. glTF, FBX and the other interchange formats are.

**What about packs that ship the same model in several formats?**
They are one asset with its formats listed, not three. When a game takes it, Tessera sends the
format that engine prefers.

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

## Games

**Which engines does it work with?**
Unity, Godot and Unreal are recognised by their own project files, and anything else can be linked
as a plain folder. Assets land in `Assets/ThirdParty`, `assets/third_party`, `Content/ThirdParty`
or `assets`, and you can change that per game.

**Does it modify my project?**
Only by writing the files you asked for, a `CREDITS.md`, and a small `.tessera/manifest.json` that
records what was copied and under what terms. It never touches your scenes, your settings or your
code.

**What if I move my game folder?**
Tell Tessera where it went on the Projects page. Nothing in the project itself depends on Tessera:
the files are real copies, so the game builds on a computer that has never heard of it.

**Do the credits update themselves?**
Yes. `CREDITS.md` is rewritten whenever what a game uses changes, with the packs that ask for
credit first and the rest listed as thanks.

## Backups and sync

**How do backups work?**
Tessera uses Kopia, a well-known open source backup program, and fetches it for you the first time.
Backups are encrypted on your computer before they leave it, and only what changed is sent.

**Where can a backup go?**
A folder, an external drive, Google Drive, OneDrive, Dropbox, Box, pCloud, iCloud Drive, Amazon S3,
Backblaze B2, Cloudflare R2, Wasabi, DigitalOcean Spaces, Google Cloud Storage, Azure, or your own
server over SFTP or WebDAV.

**What happens if I lose the backup password?**
Nothing can be restored. That is what encryption means. Tessera offers to save the password to your
system keychain and to print a recovery kit; keep the kit somewhere that is not the same computer.

**Is sync a backup?**
No. Sync copies what you did, including a deletion, to your other computers. Keep backups as well.

**Can I sync through Dropbox or Drive instead?**
You can keep a library in a synced folder, but two computers writing to it at once can confuse any
such service. Tessera's own sync, through Syncthing, is built for it and needs no account.

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

## AI agents

**What is MCP?**
The Model Context Protocol: a standard way for an AI assistant to use tools. Tessera answers it
locally, so an assistant on your computer can search your library and file things for you.

**Which assistants can use it?**
Any MCP client on the same computer. Settings shows the exact configuration to paste into the one
you use.

**Can an assistant reach my library from the internet?**
No. Tessera listens on 127.0.0.1 only. Nothing on your network and nothing on the web can reach it,
and it only answers while Tessera is open.

**What sort of thing can I ask it?**
"Find every CC0 footstep sound", "what is in Food Kit and under what licence", "file this pack
under CC BY 4.0 from opengameart.org", "copy the arcade pack into Bunny Dash", "which games use
Food Kit". Anything the window can do has a tool behind it.

**Can it do something I would not want?**
The groups that reach past the library, or cannot be undone, are off until you turn them on. Every
call is recorded and shown to you, and a call from a group that is off is refused.

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
Every release publishes the SHA-256 of every file, and the install page shows each one beside its
download. Each file also carries a signed record of the commit and the workflow that produced it,
which `gh attestation verify <file> -R ahmmedrejowan/tessera` checks.

**What licence is Tessera itself under?**
GPL-3.0-or-later. You can read it, change it, and pass it on under the same terms.

**How do I get updates?**
Tessera checks for a newer version and tells you; it never installs anything by itself. Where a
package manager carries it, `brew upgrade` or `scoop update` works as usual.

**Will there be a paid version?**
No. It is free software, and the things it depends on are free software too.
