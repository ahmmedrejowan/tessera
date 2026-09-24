/**
 * Fetching the optional helper programs, remembering where the window was, and the tools an agent
 * can use on the app itself.
 *
 * The downloads here are answered by a stand-in holding real archives built on the spot, so the
 * unpacking, the checksum and the refusals are all exercised for real without reaching GitHub.
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { TOOLS, bundledTool, expectedHash, installTool } from '../src/main/tools/install';
import { signInError } from '../src/main/backup/rclone';
import { loadWindowState, defaultSize, trackWindowState } from '../src/main/windowState';
import { tempDir } from './helpers';
import { writeZip } from './zipfixture';
import { callTool, running } from './library';

describe('which file a helper program publishes', () => {
  it('names the right one for each system and chip', () => {
    expect(TOOLS.rclone.asset('darwin', 'arm64', 'v1.75.1')).toBe('rclone-v1.75.1-osx-arm64.zip');
    expect(TOOLS.rclone.asset('win32', 'x64', 'v1.75.1')).toBe('rclone-v1.75.1-windows-amd64.zip');
    expect(TOOLS.rclone.asset('linux', 'x64', 'v1.75.1')).toBe('rclone-v1.75.1-linux-amd64.zip');

    expect(TOOLS.syncthing.asset('darwin', 'arm64', 'v2.1.5')).toBe('syncthing-macos-arm64-v2.1.5.zip');
    expect(TOOLS.syncthing.asset('win32', 'x64', 'v2.1.5')).toBe('syncthing-windows-amd64-v2.1.5.zip');
    expect(TOOLS.syncthing.asset('linux', 'arm64', 'v2.1.5')).toBe('syncthing-linux-arm64-v2.1.5.tar.gz');

    expect(TOOLS.kopia.asset('darwin', 'arm64', 'v0.23.1')).toBe('kopia-0.23.1-macOS-arm64.tar.gz');
    expect(TOOLS.kopia.asset('win32', 'x64', 'v0.23.1')).toBe('kopia-0.23.1-windows-x64.zip');
    expect(TOOLS.kopia.asset('linux', 'x64', 'v0.23.1')).toBe('kopia-0.23.1-linux-x64.tar.gz');
  });

  it('says there is nothing for a chip a project does not build for', () => {
    expect(TOOLS.rclone.asset('darwin', 'mips' as string, 'v1')).toBeNull();
    expect(TOOLS.kopia.asset('win32', 'arm64', 'v1')).toBeNull();
    expect(TOOLS.syncthing.asset('aix' as NodeJS.Platform, 'x64', 'v1')).toBeNull();
  });

  it('knows where a fetched program ends up', () => {
    const where = bundledTool('/data', 'kopia');
    expect(where).toContain(join('tools', 'kopia'));
  });
});

describe('the checksums a release publishes', () => {
  it('finds the line for one file', () => {
    const a = 'a'.repeat(64);
    const b = 'b'.repeat(64);
    const c = 'C'.repeat(64);
    const sums = [`${a}  other.zip`, `${b}  wanted.zip`, `${c} *third.zip`].join('\n');
    expect(expectedHash(sums, 'wanted.zip')).toBe(b);
    // A listing may mark a file as binary, and may shout its hash; neither changes the answer.
    expect(expectedHash(sums, 'third.zip')).toBe(c.toLowerCase());
    expect(expectedHash(sums, 'not-listed.zip')).toBeNull();
  });

  it('reads them out of a signed listing, which is plain text inside', () => {
    const d = 'd'.repeat(64);
    const signed = ['-----BEGIN PGP SIGNED MESSAGE-----', 'Hash: SHA256', '', `${d}  syncthing-linux-amd64-v2.1.5.tar.gz`, '-----BEGIN PGP SIGNATURE-----', 'nonsense'].join('\n');
    expect(expectedHash(signed, 'syncthing-linux-amd64-v2.1.5.tar.gz')).toBe(d);
  });
});

/** A stand-in for GitHub: a release, a zip holding the program, and its checksums. */
async function releaseServing(options: { name: string; inside: string; body?: Buffer; hash?: string; missing?: boolean }) {
  const zip = join(tempDir(), options.name);
  await writeZip(zip, { [options.inside]: '#!/bin/sh\necho a program\n' });
  const bytes = options.body ?? readFileSync(zip);
  const hash = options.hash ?? createHash('sha256').update(bytes).digest('hex');
  const sums = `${hash}  ${options.name}\n`;

  const fetcher = async (url: string): Promise<Response> => {
    if (url.includes('/releases/latest')) {
      if (options.missing) return { ok: false, status: 404, statusText: 'Not Found' } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v1.0.0', assets: [{ name: options.name, browser_download_url: 'https://example.test/tool' }, { name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' }] }),
      } as Response;
    }
    if (url.endsWith('/sums')) return { ok: true, status: 200, text: async () => sums } as Response;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': String(bytes.length) }),
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array(bytes));
          c.close();
        },
      }),
    } as Response;
  };
  return { fetcher, hash, bytes };
}

describe('fetching a helper program', () => {
  it('takes the right file, checks it, unpacks it and says which version', async () => {
    const dataDir = tempDir();
    const stages: string[] = [];
    // The file it looks for is named after this very computer, so the stand-in is told the same.
    const wanted = TOOLS.rclone.asset(process.platform, process.arch, 'v1.0.0');
    expect(wanted).toBeTruthy();

    const served = await releaseServing({ name: wanted!, inside: `rclone-v1.0.0/${process.platform === 'win32' ? 'rclone.exe' : 'rclone'}` });
    const version = await installTool('rclone', dataDir, served.fetcher, (p) => stages.push(p.stage));

    expect(version).toBe('v1.0.0');
    expect(existsSync(bundledTool(dataDir, 'rclone'))).toBe(true);
    expect(stages).toContain('finding');
    expect(stages).toContain('downloading');
    expect(stages).toContain('checking');
    expect(stages).toContain('done');
  });

  it('refuses a download whose checksum is not the published one', async () => {
    const wanted = TOOLS.rclone.asset(process.platform, process.arch, 'v1.0.0')!;
    const served = await releaseServing({ name: wanted, inside: 'rclone-v1.0.0/rclone', hash: 'a'.repeat(64) });
    await expect(installTool('rclone', tempDir(), served.fetcher, () => undefined)).rejects.toThrow();
  });

  it('says so plainly when the release cannot be read at all', async () => {
    const served = await releaseServing({ name: 'x.zip', inside: 'x', missing: true });
    await expect(installTool('rclone', tempDir(), served.fetcher, () => undefined)).rejects.toThrow();
  });

  it('says so when the release has nothing for this computer', async () => {
    const served = await releaseServing({ name: 'rclone-v1.0.0-haiku-sparc.zip', inside: 'rclone' });
    await expect(installTool('rclone', tempDir(), served.fetcher, () => undefined)).rejects.toThrow();
  });
});

describe('signing in to cloud storage', () => {
  it('turns what rclone complained about into something worth reading', () => {
    expect(signInError('Failed to configure token: oauth2: cannot fetch token').length).toBeGreaterThan(10);
    expect(signInError('')).toBeTruthy();
    expect(signInError('couldn\'t fetch token - maybe it has expired? - refresh with "rclone config reconnect"')).toBeTruthy();
  });
});

describe('where the window was', () => {
  it('has a size to fall back on', () => {
    expect(defaultSize().width).toBeGreaterThan(400);
    expect(defaultSize().height).toBeGreaterThan(300);
  });

  it('has nothing to remember the first time', async () => {
    expect(await loadWindowState(tempDir())).toBeNull();
  });

  it('ignores a position that makes no sense', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'window.json'), JSON.stringify({ x: 1, y: 2, width: 10, height: 10, maximized: false }));
    expect(await loadWindowState(dir)).toBeNull();
  });

  it('remembers where the window was, and gives it back', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'window.json'), JSON.stringify({ x: 40, y: 40, width: 1200, height: 800, maximized: false }));
    const state = await loadWindowState(dir);
    expect(state).toMatchObject({ width: 1200, height: 800, maximized: false });
  });

  it('writes it down as the window is moved and closed', async () => {
    const dir = tempDir();
    const listeners: Record<string, () => void> = {};
    const win = {
      isDestroyed: () => false,
      isMaximized: () => false,
      getNormalBounds: () => ({ x: 20, y: 30, width: 1000, height: 700 }),
      on: (event: string, fn: () => void) => void (listeners[event] = fn),
    };
    trackWindowState(win as never, dir);
    expect(Object.keys(listeners).sort()).toEqual(['close', 'move', 'resize']);

    listeners.close!();
    await new Promise((r) => setTimeout(r, 30));
    expect(JSON.parse(readFileSync(join(dir, 'window.json'), 'utf8'))).toMatchObject({ x: 20, y: 30, width: 1000, height: 700 });
  });
});

describe('what an agent may do to the app itself', () => {
  it('reads and changes settings, and reads the library again', async () => {
    const app = await running([{ name: 'Mini Arcade', files: { 'Models/arcade.obj': 'o arcade\n' } }]);

    expect(await callTool(app, 'list_libraries', {})).toBeTruthy();
    expect(await callTool(app, 'get_settings', {})).toBeTruthy();
    expect(await callTool(app, 'set_settings', { theme: 'dark' })).toBeTruthy();
    expect(await callTool(app, 'read_library_again', {})).toBeTruthy();
  });

  it('closes the library, and says so afterwards', async () => {
    const app = await running();
    await callTool(app, 'close_library', {});
    const status = (await callTool(app, 'library_status', {})) as { open: boolean };
    expect(status.open).toBe(false);
  });

  it('makes a library where it is told to', async () => {
    const app = await running();
    const where = join(tempDir(), 'A new one');
    mkdirSync(where, { recursive: true });
    const made = await callTool(app, 'create_library', { path: where, name: 'A new one' });
    expect(made).toBeTruthy();
    expect(existsSync(join(where, 'tessera-library.json'))).toBe(true);
  });
});

describe('reading inside an archive', () => {
  it('reads a file out of a zip, and the same file again from what it kept', async () => {
    const { readCachedEntry, closeAllZips } = await import('../src/main/index/zipCache');
    const zip = join(tempDir(), 'kit.zip');
    await writeZip(zip, { 'Models/thing.obj': 'o thing\n', 'readme.txt': 'about it' });

    const first = await readCachedEntry(zip, zip, 'Models/thing.obj', 1_000_000);
    expect(first.toString('utf8')).toBe('o thing\n');
    // The second read of the same archive comes from what was kept open, not from disk again.
    const second = await readCachedEntry(zip, zip, 'readme.txt', 1_000_000);
    expect(second.toString('utf8')).toBe('about it');
    await expect(readCachedEntry(zip, zip, 'not-in-there.obj', 1_000_000)).rejects.toThrow();
    closeAllZips();
  });

  it('refuses an archive that is not one, rather than half-reading it', async () => {
    const { readCachedEntry, closeAllZips } = await import('../src/main/index/zipCache');
    const notAZip = join(tempDir(), 'broken.zip');
    writeFileSync(notAZip, 'this is not a zip at all');
    await expect(readCachedEntry(notAZip, notAZip, 'anything', 1000)).rejects.toThrow();
    closeAllZips();
  });
});

void createWriteStream;
