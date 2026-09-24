# Reporting something

If you find a way to make Tessera lose someone's files, read something it has no business reading,
or let something outside a person's computer reach in, please tell me before telling anyone else.

**hello@rejowan.com**, with "Tessera security" in the subject. Say what you did and what happened;
a rough note is better than no note. I read these myself, and I will tell you what I have done and
when a fix is out. If you would like credit in the release notes, say so.

Please do not open a public issue for these.

## What counts

Tessera is a desktop app that works on your own files. The things worth reporting are:

- A way for something that is not on this computer to reach the app.
- A way for a web page, or any program that should not have it, to use the agent door on
  127.0.0.1 or the tools behind it.
- A path, an archive entry, or a pack name that makes Tessera read or write outside the library,
  its own data folder, or a place the person chose.
- A way to make Tessera delete or overwrite something that was not meant to go.
- Anything that sends a person's data anywhere without their say-so.

## What does not

- Anything that needs someone to already be running a program on the computer as you. A program
  you control can read the library folder itself; Tessera is not a boundary against that.
- The app being unsigned on macOS and Windows, and the warnings that follow. That is known, and
  in the README.
- Helper programs (Kopia, rclone, Syncthing) have their own projects; report theirs to them.

## Versions

Tessera is one person's project with one supported version: the newest release. Fixes go into the
next release, and a serious one gets a release of its own.
