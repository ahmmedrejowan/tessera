/**
 * Getting an optional tool (Syncthing, Kopia) for the user: the official build for this system,
 * from the project's GitHub releases, checked against the release's published SHA-256 sums and
 * unpacked into Tessera's own data folder. No installer, no admin rights; removing Tessera's data
 * removes it too.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yauzl from 'yauzl';
import { UserError } from '../errors';

import type { ToolName } from '@shared/types';

export type { ToolName };

interface ToolSpec {
  /** GitHub owner/repo. */
  repo: string;
  /** The release file for a platform and CPU, or null when there's none. */
  asset(platform: NodeJS.Platform, arch: string, tag: string): string | null;
  /** The release file listing SHA-256 sums. */
  sums: string;
}

const CPU: Record<string, string> = { x64: 'amd64', arm64: 'arm64', ia32: '386', arm: 'arm' };

export const TOOLS: Record<ToolName, ToolSpec> = {
  // syncthing-macos-arm64-v2.1.5.zip, syncthing-windows-amd64-v2.1.5.zip, syncthing-linux-amd64-v2.1.5.tar.gz
  syncthing: {
    repo: 'syncthing/syncthing',
    sums: 'sha256sum.txt.asc',
    asset(platform, arch, tag) {
      const cpu = CPU[arch];
      if (!cpu) return null;
      if (platform === 'darwin') return `syncthing-macos-${cpu}-${tag}.zip`;
      if (platform === 'win32') return `syncthing-windows-${cpu}-${tag}.zip`;
      if (platform === 'linux') return `syncthing-linux-${cpu}-${tag}.tar.gz`;
      return null;
    },
  },
  // kopia-0.23.1-macOS-arm64.tar.gz, kopia-0.23.1-windows-x64.zip, kopia-0.23.1-linux-x64.tar.gz
  kopia: {
    repo: 'kopia/kopia',
    sums: 'checksums.txt',
    asset(platform, arch, tag) {
      const cpu = ({ x64: 'x64', arm64: 'arm64', arm: 'arm' } as Record<string, string>)[arch];
      const v = tag.replace(/^v/, '');
      if (!cpu) return null;
      if (platform === 'darwin' && cpu !== 'arm') return `kopia-${v}-macOS-${cpu}.tar.gz`;
      if (platform === 'win32' && cpu === 'x64') return `kopia-${v}-windows-x64.zip`;
      if (platform === 'linux') return `kopia-${v}-linux-${cpu}.tar.gz`;
      return null;
    },
  },
};

/** The hash for `file` in a sha256sum listing (the signed .asc file is plain text inside). */
export function expectedHash(sums: string, file: string): string | null {
  for (const line of sums.split('\n')) {
    const m = /^([0-9a-f]{64})\s+\*?(\S+)\s*$/i.exec(line.trim());
    if (m && m[2] === file) return m[1]!.toLowerCase();
  }
  return null;
}

/** Where Tessera keeps its own copy of a tool. */
export const bundledTool = (dataDir: string, tool: ToolName) => join(dataDir, 'tools', tool, process.platform === 'win32' ? `${tool}.exe` : tool);

type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export interface InstallProgress {
  stage: 'finding' | 'downloading' | 'checking' | 'unpacking' | 'done';
  received: number;
  total: number;
  version?: string;
}

function unzipOne(zip: string, wanted: (name: string) => boolean, to: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    yauzl.open(zip, { lazyEntries: true }, (err, file) => {
      if (err || !file) return reject(err ?? new Error('Couldn’t open the download.'));
      file.on('entry', (entry: yauzl.Entry) => {
        if (!wanted(entry.fileName)) return file.readEntry();
        file.openReadStream(entry, (e, stream) => {
          if (e || !stream) return reject(e ?? new Error('Couldn’t read the download.'));
          const out = createWriteStream(to);
          stream.pipe(out);
          out.on('finish', () => {
            file.close();
            resolve(true);
          });
          out.on('error', reject);
        });
      });
      file.on('end', () => resolve(false));
      file.readEntry();
    });
  });
}

function untar(archive: string, dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('tar', ['-xzf', archive, '-C', dir], { stdio: 'ignore' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tar stopped with ${code}`))));
    p.on('error', reject);
  });
}

/** The program at the top of the unpacked release (its etc/ folder holds files with the same name). */
async function findFile(dir: string, name: string): Promise<string | null> {
  const top = await readdir(dir, { withFileTypes: true });
  const direct = top.find((e) => e.isFile() && e.name === name);
  if (direct) return join(dir, direct.name);
  for (const sub of top.filter((e) => e.isDirectory())) {
    if ((await readdir(join(dir, sub.name))).includes(name)) return join(dir, sub.name, name);
  }
  return null;
}

const TITLE: Record<ToolName, string> = { syncthing: 'Syncthing', kopia: 'Kopia' };

/** Download, check and unpack a tool into `dataDir/tools/<tool>`; returns its version. */
export async function installTool(tool: ToolName, dataDir: string, fetcher: Fetch, onProgress: (p: InstallProgress) => void): Promise<string> {
  const spec = TOOLS[tool];
  const title = TITLE[tool];
  onProgress({ stage: 'finding', received: 0, total: 0 });
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Tessera' };
  const release = (await (await fetcher(`https://api.github.com/repos/${spec.repo}/releases/latest`, { headers })).json()) as { tag_name?: string; assets?: { name: string; size: number; browser_download_url: string }[] };
  const version = release.tag_name;
  const name = version ? spec.asset(process.platform, process.arch, version) : null;
  const asset = release.assets?.find((a) => a.name === name);
  const sums = release.assets?.find((a) => a.name === spec.sums);
  if (!version || !name) throw new UserError('tool-unsupported', `There’s no ${title} download for this system. Install it with your package manager instead.`);
  if (!asset || !sums) throw new UserError('tool-no-download', `Couldn’t find ${title}’s download. Try again later, or install it yourself.`);

  const expected = expectedHash(await (await fetcher(sums.browser_download_url, { headers })).text(), name);
  if (!expected) throw new UserError('tool-no-checksum', `${title}’s download couldn’t be checked, so it wasn’t used.`);

  const work = await mkdtemp(join(tmpdir(), `tessera-${tool}-`));
  try {
    const archive = join(work, name);
    const res = await fetcher(asset.browser_download_url, { headers: { 'User-Agent': 'Tessera' } });
    if (!res.ok || !res.body) throw new UserError('tool-download-failed', `The download failed (${res.status}). Check the connection and try again.`);
    const hash = createHash('sha256');
    const out = createWriteStream(archive);
    let received = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      received += value.byteLength;
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
      onProgress({ stage: 'downloading', received, total: asset.size, version });
    }
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));

    onProgress({ stage: 'checking', received, total: asset.size, version });
    if (hash.digest('hex') !== expected) throw new UserError('tool-bad-download', `The download didn’t match ${title}’s published checksum, so it wasn’t used.`);

    onProgress({ stage: 'unpacking', received, total: asset.size, version });
    const target = bundledTool(dataDir, tool);
    await mkdir(join(target, '..'), { recursive: true });
    const exe = process.platform === 'win32' ? `${tool}.exe` : tool;
    if (name.endsWith('.zip')) {
      if (!(await unzipOne(archive, (n) => n.split('/').length === 2 && n.split('/')[1] === exe, `${target}.new`))) throw new UserError('tool-bad-download', `${title} wasn’t in the download.`);
    } else {
      const dir = join(work, 'x');
      await mkdir(dir);
      await untar(archive, dir);
      const found = await findFile(dir, exe);
      if (!found) throw new UserError('tool-bad-download', `${title} wasn’t in the download.`);
      await copyFile(found, `${target}.new`);
    }
    await chmod(`${target}.new`, 0o755);
    if (existsSync(target)) await rm(target, { force: true });
    await copyFile(`${target}.new`, target);
    await chmod(target, 0o755);
    await rm(`${target}.new`, { force: true });
    await writeFile(join(target, '..', 'VERSION'), version);
    onProgress({ stage: 'done', received, total: asset.size, version });
    return version;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
