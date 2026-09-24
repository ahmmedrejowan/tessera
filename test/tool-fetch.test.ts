/**
 * Fetching a helper program (rclone, Kopia, Syncthing).
 *
 * Tessera downloads these itself, so it is downloading a program onto somebody's computer and then
 * running it. The release is the project's own, and the file is checked against the sums that
 * release publishes: anything that does not match is thrown away rather than used. That is what is
 * held to account here, with a stand-in answering for GitHub and real archives on disk.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bundledTool, installTool, TOOLS, type InstallProgress } from '../src/main/tools/install';
import { tempDir } from './helpers';
import { makeZip } from './zipfixture';

const windows = process.platform === 'win32';
const exe = windows ? '.exe' : '';
const TAG = 'v9.9.9';

/** The release file this system would want, for a tool that ships zips everywhere. */
const zipName = () => TOOLS.rclone.asset(process.platform, process.arch, TAG)!;

/** A release, and the files it offers, as GitHub would answer for them. */
function gitHub(files: Record<string, Buffer | string>, options: { assets?: string[]; status?: number } = {}) {
  const names = options.assets ?? Object.keys(files);
  const asked: string[] = [];
  const fetcher = async (url: string): Promise<Response> => {
    asked.push(url);
    if (url.includes('api.github.com')) {
      return new Response(
        JSON.stringify({
          tag_name: TAG,
          assets: names.map((name) => ({ name, size: Buffer.from(files[name] ?? '').length, browser_download_url: `https://example.test/${name}` })),
        }),
      );
    }
    const name = url.split('/').pop()!;
    const body = files[name];
    // A status stands in for the archive itself failing; the sums are still handed over.
    if (body === undefined || (options.status && !/sums|checksums/i.test(name))) return new Response(null, { status: options.status ?? 404 });
    return new Response(typeof body === 'string' ? body : new Uint8Array(body));
  };
  return { fetcher, asked };
}

const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const sums = (entries: [string, Buffer | string][]) => entries.map(([name, body]) => `${sha(body)}  ${name}`).join('\n');

/** A zip holding the program where the release puts it: one folder, then the program. */
const release = (program: string) => makeZip({ [`${zipName().replace(/\.zip$/, '')}/${program}`]: 'the program, pretend' });

describe('fetching a helper program', () => {
  it('checks the download against the release sums, unpacks it and says which version it is', async () => {
    const dir = tempDir();
    const zip = await release(`rclone${exe}`);
    const { fetcher } = gitHub({ [zipName()]: zip, SHA256SUMS: sums([[zipName(), zip]]) });

    const stages: InstallProgress['stage'][] = [];
    const version = await installTool('rclone', dir, fetcher, (p) => void stages.push(p.stage));

    expect(version).toBe(TAG);
    const where = bundledTool(dir, 'rclone');
    expect(existsSync(where)).toBe(true);
    expect(readFileSync(where, 'utf8')).toBe('the program, pretend');
    // The version is written beside it, so the app knows what it has without running it.
    expect(readFileSync(join(where, '..', 'VERSION'), 'utf8')).toBe(TAG);
    expect(stages).toContain('downloading');
    expect(stages[stages.length - 1]).toBe('done');
  });

  it('replaces a copy that is already there', async () => {
    const dir = tempDir();
    const zip = await release(`rclone${exe}`);
    const { fetcher } = gitHub({ [zipName()]: zip, SHA256SUMS: sums([[zipName(), zip]]) });
    const where = bundledTool(dir, 'rclone');
    mkdirSync(join(where, '..'), { recursive: true });
    writeFileSync(where, 'an older copy');

    await installTool('rclone', dir, fetcher, () => undefined);
    expect(readFileSync(where, 'utf8')).toBe('the program, pretend');
  });

  it('throws away a download that does not match the published sum', async () => {
    const dir = tempDir();
    const zip = await release(`rclone${exe}`);
    const { fetcher } = gitHub({ [zipName()]: zip, SHA256SUMS: sums([[zipName(), 'something else entirely']]) });

    await expect(installTool('rclone', dir, fetcher, () => undefined)).rejects.toThrow(/didn’t match/);
    expect(existsSync(bundledTool(dir, 'rclone'))).toBe(false);
  });

  it('will not use a download it cannot check', async () => {
    const dir = tempDir();
    const zip = await release(`rclone${exe}`);
    const { fetcher } = gitHub({ [zipName()]: zip, SHA256SUMS: sums([['something-else.zip', zip]]) });
    await expect(installTool('rclone', dir, fetcher, () => undefined)).rejects.toThrow(/couldn’t be checked/);
  });

  it('says so when the release has no file for this system', async () => {
    const dir = tempDir();
    const { fetcher } = gitHub({ SHA256SUMS: 'nothing here' }, { assets: ['SHA256SUMS'] });
    await expect(installTool('rclone', dir, fetcher, () => undefined)).rejects.toThrow(/Couldn’t find/);
  });

  it('says so when the download itself fails', async () => {
    const dir = tempDir();
    const zip = await release(`rclone${exe}`);
    const { fetcher } = gitHub({ [zipName()]: zip, SHA256SUMS: sums([[zipName(), zip]]) }, { status: 503 });
    await expect(installTool('rclone', dir, fetcher, () => undefined)).rejects.toThrow(/download failed \(503\)/);
  });

  it('says so when the program is not inside the download', async () => {
    const dir = tempDir();
    const zip = await release('something-else');
    const { fetcher } = gitHub({ [zipName()]: zip, SHA256SUMS: sums([[zipName(), zip]]) });
    await expect(installTool('rclone', dir, fetcher, () => undefined)).rejects.toThrow(/wasn’t in the download/);
  });
});

describe.skipIf(windows)('a release that comes as a tarball', () => {
  /** A .tar.gz with the program one folder down, the way Kopia and Syncthing ship. */
  async function tarball(program: string): Promise<Buffer> {
    const work = tempDir();
    const inside = join(work, 'kopia-9.9.9-here');
    mkdirSync(inside, { recursive: true });
    writeFileSync(join(inside, program), 'the program, pretend');
    writeFileSync(join(inside, 'README.md'), 'about it');
    const out = join(work, 'release.tar.gz');
    await new Promise<void>((done, fail) => {
      const p = spawn('tar', ['-czf', out, '-C', work, 'kopia-9.9.9-here'], { stdio: 'ignore' });
      p.on('exit', (code) => (code === 0 ? done() : fail(new Error(`tar stopped with ${code}`))));
      p.on('error', fail);
    });
    return readFileSync(out);
  }

  it('unpacks it and finds the program inside', async () => {
    const dir = tempDir();
    const name = TOOLS.kopia.asset(process.platform, process.arch, TAG)!;
    const tar = await tarball('kopia');
    const { fetcher } = gitHub({ [name]: tar, 'checksums.txt': sums([[name, tar]]) });

    expect(await installTool('kopia', dir, fetcher, () => undefined)).toBe(TAG);
    expect(readFileSync(bundledTool(dir, 'kopia'), 'utf8')).toBe('the program, pretend');
  });

  it('says so when the tarball holds everything but the program', async () => {
    const dir = tempDir();
    const name = TOOLS.kopia.asset(process.platform, process.arch, TAG)!;
    const tar = await tarball('not-kopia');
    const { fetcher } = gitHub({ [name]: tar, 'checksums.txt': sums([[name, tar]]) });
    await expect(installTool('kopia', dir, fetcher, () => undefined)).rejects.toThrow(/wasn’t in the download/);
  });
});
