# Package managers

Tessera is published to a package manager on every system it runs on, so people do not have to
download a file and argue with their computer about whether to trust it. This folder explains how
that works and what it needs from you.

Nothing here is written by hand. `scripts/manifests.mjs` reads a published release and its
`SHA256SUMS` files and writes every manifest from them, and
[`.github/workflows/packages.yml`](../.github/workflows/packages.yml) runs it the moment a release
is published and sends each one where it belongs.

To see what it would write, without publishing anything:

```bash
node scripts/manifests.mjs v0.1.0        # into dist-manifests/
```

## What is published where

| Manager | System | What people type | Needs |
|---------|--------|------------------|-------|
| Homebrew | macOS | `brew install --cask ahmmedrejowan/tessera/tessera` | `TAP_TOKEN` |
| Scoop | Windows | `scoop install tessera` after adding the bucket | `TAP_TOKEN` |
| winget | Windows | `winget install Rejowan.Tessera` | `WINGET_TOKEN` |
| Chocolatey | Windows | `choco install tessera` | `CHOCO_API_KEY` |
| AUR | Arch Linux | `yay -S tessera-bin` | `AUR_SSH_KEY` |

Every job skips itself, quietly and successfully, when its secret is missing. The workflow is safe
to have in place long before any of these accounts exist.

**Homebrew is the important one.** `brew install --cask` clears the download flag as it installs,
so macOS opens Tessera without sending anyone to Privacy & Security. It is the closest thing to a
notarised build that costs nothing.

## Setting each one up

### Homebrew and Scoop

Two repositories hold the descriptions, and the workflow pushes to both:

- `ahmmedrejowan/homebrew-tessera`, which is what `brew tap ahmmedrejowan/tessera` fetches
- `ahmmedrejowan/scoop-tessera`

Make a fine-grained personal access token with **contents: read and write** on those two
repositories only, and save it as the repository secret `TAP_TOKEN`. That is the whole setup.

Once Tessera has a following, the cask can be offered to `homebrew/homebrew-cask` itself, and then
`brew install --cask tessera` works with no tap at all. Homebrew asks for some evidence that people
use a thing before accepting it, which is a fair rule; the tap works in the meantime and the
command keeps working afterwards.

### winget

1. Fork `microsoft/winget-pkgs` to your account. Leave it alone afterwards; the workflow uses it.
2. Make a classic token with the `public_repo` scope, and save it as `WINGET_TOKEN`.

The workflow opens a pull request against Microsoft's repository for each release. The first one is
looked over by a person, later ones are usually automatic. The identifier is `Rejowan.Tessera`.

### Chocolatey

1. Make an account at community.chocolatey.org and take the API key from your profile.
2. Save it as `CHOCO_API_KEY`.

The first version of a new package waits for a moderator. Later versions usually go straight
through.

### AUR

1. Make an account at aur.archlinux.org and add an SSH public key to it.
2. Save the private half as `AUR_SSH_KEY`.

The package is `tessera-bin`: it takes the `.deb` the release already builds and unpacks it, which
is what almost every Electron application on the AUR does.

## What is deliberately not here

**Flathub and Snap.** Both would mean running Tessera inside a sandbox, and the sandbox fights two
things the app is built around. A library can live in any folder on any disk, including an external
one, and a game project can live anywhere too, so the app would need blanket filesystem permission,
which is exactly what reviewers refuse and what would make the confinement meaningless. Tessera
also fetches and runs Kopia, rclone and Syncthing when you turn backups or sync on, and a sandboxed
build cannot do that. The AppImage, the `.deb` and the `.rpm` cover Linux without pretending.

**An apt or yum repository of our own.** It would mean a signing key to look after and a server to
keep up, to save Debian and Fedora users one download. The AUR covers Arch, and the `.deb` and
`.rpm` are one click on the release page.

**The Mac App Store.** It needs the ninety-nine dollars a year, and sandbox rules that rule out
most of what the app does.
