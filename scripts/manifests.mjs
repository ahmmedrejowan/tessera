// Every package manager's description of one release, written from the release itself.
//
//   node scripts/manifests.mjs v0.2.0 [outDir]
//
// Reads the published release from GitHub, takes each file's checksum out of the SHA256SUMS files
// published beside them, and writes a Homebrew cask, a Scoop manifest, an Arch PKGBUILD and a
// Chocolatey package. Nothing is invented: if a file or its checksum is missing the run fails
// rather than describing something that is not there.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.GITHUB_REPOSITORY ?? 'ahmmedrejowan/tessera';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = `https://github.com/${REPO}`;
const DESC = 'Desktop library for game assets, with their licences and sources on record';

const tag = process.argv[2];
const outDir = process.argv[3] ?? join(ROOT, 'dist-manifests');
if (!tag) {
  console.error('which release? node scripts/manifests.mjs v0.2.0');
  process.exit(1);
}
const version = tag.replace(/^v/i, '');

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'tessera-manifests',
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

/** The release, and every file it published. */
async function release() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, { headers });
  if (!res.ok) throw new Error(`no release ${tag}: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * What each file's checksum is, from the SHA256SUMS files the build published. Reading them is
 * better than hashing the downloads again: it is the same number the release page shows, so a
 * package manager and a person checking by hand cannot disagree.
 */
async function checksums(assets) {
  const sums = new Map();
  for (const asset of assets.filter((a) => /^SHA256SUMS/i.test(a.name))) {
    const res = await fetch(asset.browser_download_url, { headers: { 'user-agent': 'tessera-manifests' } });
    if (!res.ok) throw new Error(`could not read ${asset.name}: ${res.status}`);
    for (const line of (await res.text()).split('\n')) {
      const [hash, name] = line.trim().split(/\s+\*?/);
      if (hash && name) sums.set(name, hash);
    }
  }
  return sums;
}

/** One file of the release, with its checksum, or a clear complaint. */
function file(assets, sums, name) {
  const asset = assets.find((a) => a.name === name);
  if (!asset) throw new Error(`${tag} has no ${name}`);
  const sha256 = sums.get(name);
  if (!sha256) throw new Error(`no checksum published for ${name}`);
  return { name, url: asset.browser_download_url, sha256 };
}

const name = (os, arch, ext) => `Tessera-${version}-${os}-${arch}.${ext}`;

// ---- Homebrew: brew install --cask, which also clears the quarantine flag on the way in ----
function cask(f) {
  const arm = f(name('mac', 'arm64', 'dmg'));
  const intel = f(name('mac', 'x64', 'dmg'));
  return `cask "tessera" do
  arch arm: "arm64", intel: "x64"

  version "${version}"
  sha256 arm:   "${arm.sha256}",
         intel: "${intel.sha256}"

  url "${HOME}/releases/download/v#{version}/Tessera-#{version}-mac-#{arch}.dmg",
      verified: "github.com/${REPO}/"
  name "Tessera"
  desc "${DESC}"
  homepage "${HOME}"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on :macos

  app "Tessera.app"

  zap trash: [
    "~/Library/Application Support/Tessera",
    "~/Library/Logs/Tessera",
    "~/Library/Preferences/com.rejowan.tessera.plist",
    "~/Library/Saved Application State/com.rejowan.tessera.savedState",
  ]
end
`;
}

// ---- Scoop: the portable archive, so nothing is installed system wide ----
function scoop(f) {
  const x64 = f(name('win', 'x64', 'zip'));
  const arm = f(name('win', 'arm64', 'zip'));
  return `${JSON.stringify(
    {
      version,
      description: DESC,
      homepage: HOME,
      license: 'GPL-3.0-or-later',
      architecture: {
        '64bit': { url: x64.url, hash: x64.sha256 },
        arm64: { url: arm.url, hash: arm.sha256 },
      },
      bin: 'Tessera.exe',
      shortcuts: [['Tessera.exe', 'Tessera']],
      persist: [],
      checkver: { github: HOME },
      autoupdate: {
        architecture: {
          '64bit': { url: `${HOME}/releases/download/v$version/Tessera-$version-win-x64.zip` },
          arm64: { url: `${HOME}/releases/download/v$version/Tessera-$version-win-arm64.zip` },
        },
        hash: { url: `${HOME}/releases/download/v$version/SHA256SUMS-Windows.txt` },
      },
      notes: 'Windows may warn that it protected your PC the first time. Choose More info, then Run anyway.',
    },
    null,
    2,
  )}\n`;
}

// ---- Arch: the Debian package unpacked, which is what electron-builder already lays out ----
function pkgbuild(f) {
  const deb = f(name('linux', 'amd64', 'deb'));
  return `# Maintainer: K M Rejowan Ahmmed <hello@rejowan.com>
pkgname=tessera-bin
pkgver=${version}
pkgrel=1
pkgdesc="${DESC}"
arch=('x86_64')
url="${HOME}"
license=('GPL-3.0-or-later')
depends=('gtk3' 'nss' 'alsa-lib' 'libxss')
optdepends=('kopia: encrypted backups' 'rclone: backups to cloud storage' 'syncthing: sync between your own computers')
provides=('tessera')
conflicts=('tessera')
options=('!strip')
source=("\${pkgname}-\${pkgver}.deb::${deb.url}")
sha256sums=('${deb.sha256}')

package() {
  bsdtar -xf data.tar.* -C "\${pkgdir}"
  # The Debian package puts the app under /opt and the launcher in /usr/bin; both are right here.
  chmod -R g-w "\${pkgdir}"
}
`;
}

function srcinfo(f) {
  const deb = f(name('linux', 'amd64', 'deb'));
  return `pkgbase = tessera-bin
\tpkgdesc = ${DESC}
\tpkgver = ${version}
\tpkgrel = 1
\turl = ${HOME}
\tarch = x86_64
\tlicense = GPL-3.0-or-later
\tdepends = gtk3
\tdepends = nss
\tdepends = alsa-lib
\tdepends = libxss
\tprovides = tessera
\tconflicts = tessera
\toptions = !strip
\tsource = tessera-bin-${version}.deb::${deb.url}
\tsha256sums = ${deb.sha256}

pkgname = tessera-bin
`;
}

// ---- Chocolatey: the installer, run quietly ----
function chocoNuspec() {
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://schemas.microsoft.com/packaging/2015/06/nuspec.xsd">
  <metadata>
    <id>tessera</id>
    <version>${version}</version>
    <packageSourceUrl>${HOME}</packageSourceUrl>
    <owners>ahmmedrejowan</owners>
    <title>Tessera</title>
    <authors>K M Rejowan Ahmmed</authors>
    <projectUrl>${HOME}</projectUrl>
    <iconUrl>https://raw.githubusercontent.com/${REPO}/main/build/icon.png</iconUrl>
    <licenseUrl>${HOME}/blob/main/LICENSE</licenseUrl>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <projectSourceUrl>${HOME}</projectSourceUrl>
    <docsUrl>${HOME}/wiki</docsUrl>
    <bugTrackerUrl>${HOME}/issues</bugTrackerUrl>
    <tags>gamedev assets unity godot unreal electron</tags>
    <summary>${DESC}</summary>
    <description>${DESC}. Keep every pack you collect, with its licence and source on record, find the piece you need in seconds, and copy it into your game with the credits written for you.</description>
    <releaseNotes>${HOME}/releases/tag/${tag}</releaseNotes>
  </metadata>
  <files>
    <file src="tools\\**" target="tools" />
  </files>
</package>
`;
}

function chocoInstall(f) {
  const x64 = f(name('win', 'x64', 'exe'));
  const arm = f(name('win', 'arm64', 'exe'));
  return `$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName   = 'tessera'
  fileType      = 'exe'
  url64bit      = '${x64.url}'
  checksum64    = '${x64.sha256}'
  checksumType64= 'sha256'
  silentArgs    = '/S'
  validExitCodes= @(0)
}

# Windows on Arm takes its own build.
if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') {
  $packageArgs.url64bit   = '${arm.url}'
  $packageArgs.checksum64 = '${arm.sha256}'
}

Install-ChocolateyPackage @packageArgs
`;
}

const data = await release();
const assets = data.assets ?? [];
const sums = await checksums(assets);
const f = (n) => file(assets, sums, n);

const written = [
  ['homebrew/Casks/tessera.rb', cask(f)],
  ['scoop/bucket/tessera.json', scoop(f)],
  ['aur/PKGBUILD', pkgbuild(f)],
  ['aur/.SRCINFO', srcinfo(f)],
  ['chocolatey/tessera.nuspec', chocoNuspec()],
  ['chocolatey/tools/chocolateyinstall.ps1', chocoInstall(f)],
];

for (const [where, body] of written) {
  const path = join(outDir, where);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  console.log(`  ${path}`);
}
console.log(`\n${written.length} manifests for ${tag}`);
