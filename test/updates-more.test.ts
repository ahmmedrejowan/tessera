/**
 * Looking for a newer Tessera, and fetching it. Nothing here reaches the network: the feed and the
 * download are answered by a stand-in, so what is tested is the app's own judgement about what a
 * release says, not GitHub's.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Updates } from '../src/main/updates';
import { tempDir } from './helpers';

const FEED = 'https://example.test/releases/latest';

/** A release as the feed would describe it. */
const release = (over: Record<string, unknown> = {}) => ({
  tag_name: 'v2.0.0',
  html_url: 'https://example.test/releases/v2.0.0',
  body: 'What is new\n\nThings\nAnd more things',
  published_at: '2026-02-01T00:00:00.000Z',
  draft: false,
  assets: [
    { name: 'Tessera-2.0.0-mac-arm64.dmg', browser_download_url: 'https://example.test/arm.dmg', size: 4 },
    { name: 'Tessera-2.0.0-mac-x64.dmg', browser_download_url: 'https://example.test/intel.dmg', size: 4 },
    { name: 'Tessera-2.0.0-win-x64.exe', browser_download_url: 'https://example.test/win.exe', size: 4 },
    { name: 'Tessera-2.0.0-linux-x86_64.AppImage', browser_download_url: 'https://example.test/linux.AppImage', size: 4 },
  ],
  ...over,
});

/** A stand-in for the network: the feed, and the files a release publishes. */
function answering(body: unknown, options: { status?: number; file?: Uint8Array } = {}) {
  const asked: string[] = [];
  const fetch = async (url: string): Promise<Response> => {
    asked.push(url);
    if (url === FEED) {
      return {
        ok: (options.status ?? 200) < 400,
        status: options.status ?? 200,
        json: async () => body,
      } as Response;
    }
    const bytes = options.file ?? new Uint8Array([1, 2, 3, 4]);
    return {
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes);
          c.close();
        },
      }),
    } as Response;
  };
  return { fetch, asked };
}

/** The macOS file this very computer would be handed: the test runs on all three systems. */
const MAC = `Tessera-2.0.0-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}.dmg`;

const make = (over: Partial<ConstructorParameters<typeof Updates>[0]> = {}) => {
  const changes: number[] = [];
  const { fetch, asked } = answering(release());
  const updates = new Updates({
    version: '1.0.0',
    dir: tempDir(),
    platform: 'darwin',
    auto: () => false,
    feed: FEED,
    fetch,
    onChanged: () => void changes.push(1),
    ...over,
  });
  return { updates, changes, asked };
};

describe('checking for a newer version', () => {
  it('says a newer one is out, with its notes and where to read them', async () => {
    const { updates, changes } = make();
    const status = await updates.check();
    expect(status.latest).toBe('2.0.0');
    expect(status.newer).toBe(true);
    expect(status.url).toBe('https://example.test/releases/v2.0.0');
    expect(status.notes).toContain('What is new');
    expect(status.error).toBeNull();
    expect(status.lastCheckedAt).toBeTruthy();
    expect(changes.length).toBeGreaterThan(0);
  });

  it('says nothing is newer when this build is the newest', async () => {
    const { updates } = make({ version: '2.0.0' });
    expect((await updates.check()).newer).toBe(false);
  });

  it('has nowhere to look while no releases are published', async () => {
    const { updates } = make({ feed: '' });
    const status = await updates.check();
    expect(status.canCheck).toBe(false);
    expect(status.error).toContain('nowhere to check');
  });

  it('says so plainly when the list cannot be read', async () => {
    const { fetch } = answering(null, { status: 404 });
    const { updates } = make({ fetch });
    expect((await updates.check()).error).toContain('No releases');
  });

  it('takes the newest published release when the feed is a list', async () => {
    // GitHub's "latest" leaves previews out, so the app asks for the list and chooses itself.
    const { fetch } = answering([
      release({ tag_name: 'v3.0.0', draft: true }),
      release({ tag_name: 'v2.5.0', prerelease: true }),
      release({ tag_name: 'v2.0.0' }),
    ]);
    const { updates } = make({ fetch });
    const status = await updates.check();
    // The draft is skipped; a preview is not, because a preview is what people are running.
    expect(status.latest).toBe('2.5.0');
    expect(status.newer).toBe(true);
  });

  it('says so plainly when the list is empty', async () => {
    const { fetch } = answering([]);
    const { updates } = make({ fetch });
    expect((await updates.check()).error).toContain('No releases');
  });

  it('will not compare with a draft', async () => {
    const { fetch } = answering(release({ draft: true }));
    const { updates } = make({ fetch });
    expect((await updates.check()).error).toContain('No finished release');
  });

  it('joins a check already running rather than starting a second', async () => {
    const { updates } = make();
    const [a, b] = await Promise.all([updates.check(), updates.check()]);
    expect(a.lastCheckedAt).toBe(b.lastCheckedAt);
  });

  it('hands back the same answer it last worked out', async () => {
    const { updates } = make();
    await updates.check();
    expect(updates.get().latest).toBe('2.0.0');
  });
});

describe('fetching the installer', () => {
  it('takes the file for this computer and says where it put it', async () => {
    const dir = tempDir();
    const { updates } = make({ dir, platform: 'darwin' });
    await updates.check();
    const status = await updates.download();
    expect(status.installer).toBe(join(dir, MAC));
    expect(existsSync(status.installer!)).toBe(true);
    expect(readFileSync(status.installer!)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(status.downloading).toBe(false);
  });

  it('takes the Windows one on Windows, and the Linux one on Linux', async () => {
    for (const [platform, expected] of [
      ['win32', 'Tessera-2.0.0-win-x64.exe'],
      ['linux', 'Tessera-2.0.0-linux-x86_64.AppImage'],
    ] as const) {
      const { updates } = make({ platform, dir: tempDir() });
      await updates.check();
      expect((await updates.download()).installer).toContain(expected);
    }
  });

  it('does not fetch again what is already there and whole', async () => {
    const dir = tempDir();
    const { updates } = make({ dir });
    await updates.check();
    await updates.download();
    const first = statSync(join(dir, MAC)).mtimeMs;
    await new Promise((r) => setTimeout(r, 20));
    await updates.download();
    expect(statSync(join(dir, MAC)).mtimeMs).toBe(first);
  });

  it('fetches again when what is there is the wrong size', async () => {
    const dir = tempDir();
    const { updates } = make({ dir });
    await updates.check();
    writeFileSync(join(dir, MAC), 'half of it');
    await updates.download();
    expect(readFileSync(join(dir, MAC))).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it('says so when the release has nothing for this computer', async () => {
    const { fetch } = answering(release({ assets: [{ name: 'notes.txt', browser_download_url: 'https://example.test/notes.txt', size: 1 }] }));
    const { updates } = make({ fetch });
    await updates.check();
    expect((await updates.download()).error).toContain('no installer for this computer');
  });

  it('says so when the file will not come down', async () => {
    const asked: string[] = [];
    const fetch = async (url: string): Promise<Response> => {
      asked.push(url);
      if (url === FEED) return { ok: true, status: 200, json: async () => release() } as Response;
      return { ok: false, status: 503, body: null } as unknown as Response;
    };
    const { updates } = make({ fetch });
    await updates.check();
    const status = await updates.download();
    expect(status.error).toContain('503');
    expect(status.downloading).toBe(false);
  });
});

describe('checking on a schedule', () => {
  it('stops when told to, and can be told twice', () => {
    const { updates } = make();
    updates.startSchedule(() => false);
    updates.startSchedule(() => false);
    updates.stop();
    updates.stop();
    expect(updates.get().current).toBe('1.0.0');
  });
});
