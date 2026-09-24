// The notes for one release, from CHANGELOG.md, so the release page says what the app says.
//   node scripts/release-notes.mjs v0.2.0 > notes.md
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const tag = (process.argv[2] ?? '').replace(/^v/i, '') || JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version;
const changelog = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8');

/** The section for this version: from its heading to the next one. */
const sections = changelog.split(/^## /m).slice(1);
const section = sections.find((s) => s.split('\n')[0]?.startsWith(tag));
const what = section ? section.split('\n').slice(1).join('\n').trim() : '';

const unsigned = `## Installing

These builds are not notarised by Apple or signed with a Windows certificate, so each system asks
once, the first time you open Tessera.

**macOS** says it cannot verify the app is free from malware. Press Done, then open System
Settings, Privacy & Security, scroll to Security, and press Open Anyway beside Tessera. Confirm
with Touch ID or your password, then press Open. On macOS 14 and earlier, right-click Tessera and
choose Open instead.

**Windows** says "Windows protected your PC". Choose More info, then Run anyway.

**Linux** says nothing. \`chmod +x Tessera-*.AppImage\`, \`sudo dpkg -i tessera_*.deb\`, or
\`sudo rpm -i tessera-*.rpm\`.

Take the file that matches your computer: \`arm64\` for Apple Silicon, \`x64\` for Intel. The
SHA256SUMS files beside them are the checksums of everything built here.`;

process.stdout.write(what ? `## What's new\n\n${what}\n\n${unsigned}\n` : `${unsigned}\n`);
