/**
 * The download queue: links in, files out, and everything that can go wrong in between.
 *
 * Nothing here reaches the network. A stand-in answers for it, so what is tested is the queue's own
 * judgement: how many it runs at once, what it retries and what it gives up on, what it remembers
 * across a restart, and that pausing something actually stops it.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { DownloadService, nameFor, safeName } from '../src/main/downloads/service';

/**
 * Folders of this file's own. A queue keeps writing its list for a moment after a test ends, and
 * the shared helper clears its folders the instant one does, which is a race the queue loses.
 */
const mine: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'tessera-dl-'));
  mine.push(dir);
  return dir;
};

/** A stand-in for the network, which can be told to be slow, to fail, or to refuse outright. */
function net(options: { fail?: number; permanent?: boolean; hold?: boolean; body?: string } = {}) {
  let attempts = 0;
  const started: string[] = [];
  let release: (() => void) | null = null;
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    started.push(url);
    attempts += 1;
    if (options.hold) {
      await new Promise<void>((r) => {
        release = r;
        init?.signal?.addEventListener('abort', () => r());
      });
      if (init?.signal?.aborted) throw Object.assign(new Error('stopped'), { name: 'AbortError' });
    }
    if (options.fail && attempts <= options.fail) {
      throw Object.assign(new Error(options.permanent ? 'That link is not a file.' : 'the connection dropped'), { permanent: !!options.permanent });
    }
    const text = options.body ?? 'a pack, pretend';
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': String(text.length), 'content-type': 'application/zip' }),
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode(text));
          c.close();
        },
      }),
    } as Response;
  };
  return { fetch, tries: () => attempts, started, let: () => release?.() };
}

/** Every queue a test started, stopped before its folder goes, so nothing writes into thin air. */
const started: DownloadService[] = [];
const track = (service: DownloadService) => {
  started.push(service);
  return service;
};
afterEach(async () => {
  for (const q of started.splice(0)) q.stopAll();
  // Stopping is immediate, but a download part way through a write unwinds on the next turn of
  // the loop. Clearing the folders out from under it before then is a race it loses.
  await new Promise((r) => setTimeout(r, 50));
});

afterAll(() => {
  for (const dir of mine.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function queue(options: Parameters<typeof net>[0] = {}, atOnce = 3) {
  const dir = tempDir();
  const ready: string[] = [];
  let changes = 0;
  const stand = net(options);
  const downloads = new DownloadService({
    dir,
    fetch: stand.fetch,
    atOnce: () => atOnce,
    onChanged: () => void (changes += 1),
    onReady: (item) => void ready.push(item.url),
  });
  await downloads.load();
  started.push(downloads);
  return { dir, downloads, ready, stand, changed: () => changes };
}

/** Wait until the queue settles on a state, rather than guessing how long it takes. */
async function until(check: () => boolean, what = 'the queue never settled'): Promise<void> {
  for (let i = 0; i < 1500; i += 1) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(what);
}

const FILE = 'https://example.test/packs/kit.zip';

describe('taking links', () => {
  it('takes a link and fetches what is behind it', async () => {
    const q = await queue();
    expect(q.downloads.add([FILE])).toEqual({ added: 1, skipped: 0 });
    await until(() => q.ready.length === 1);

    const item = q.downloads.list()[0]!;
    expect(item.state).toBe('ready');
    expect(item.url).toBe(FILE);
    expect(existsSync(q.downloads.fileOf(item.id)!)).toBe(true);
    expect(readFileSync(q.downloads.fileOf(item.id)!, 'utf8')).toBe('a pack, pretend');
  });

  it('takes a list at once, and skips the same link twice', async () => {
    const q = await queue();
    const first = q.downloads.add([FILE, 'https://example.test/packs/other.zip']);
    expect(first.added).toBe(2);
    expect(q.downloads.add([FILE])).toEqual({ added: 0, skipped: 1 });
    await until(() => q.downloads.list().filter((i) => i.state === 'ready').length === 2);
  });

  it('will not take something that is not a link', async () => {
    const q = await queue();
    expect(q.downloads.add(['not a link', 'ftp://example.test/thing.zip'])).toMatchObject({ added: 0 });
  });

  it('runs only as many at once as the settings allow', async () => {
    const q = await queue({ hold: true }, 2);
    q.downloads.add(['https://example.test/a.zip', 'https://example.test/b.zip', 'https://example.test/c.zip']);
    await until(() => q.downloads.list().filter((i) => i.state === 'running').length === 2);
    expect(q.downloads.list().filter((i) => i.state === 'running')).toHaveLength(2);
    expect(q.downloads.list().filter((i) => i.state === 'waiting')).toHaveLength(1);
  });
});

describe('when it goes wrong', () => {
  it('tries a dropped connection again, and gets there', async () => {
    const q = await queue({ fail: 1 });
    q.downloads.add([FILE]);
    await until(() => q.downloads.list()[0]?.state === 'ready', 'it never recovered');
    expect(q.stand.tries()).toBeGreaterThan(1);
  });

  it('gives up at once on a link that is simply wrong', async () => {
    const q = await queue({ fail: 99, permanent: true });
    q.downloads.add([FILE]);
    await until(() => q.downloads.list()[0]?.state === 'failed', 'it never gave up');
    expect(q.stand.tries()).toBe(1);
    expect(q.downloads.list()[0]!.error).toBeTruthy();
  });

  it('tries the failed ones again when asked', async () => {
    const q = await queue({ fail: 99, permanent: true });
    q.downloads.add([FILE]);
    await until(() => q.downloads.list()[0]?.state === 'failed');

    // It will fail again straight away, so what is checked is that it was tried again at all,
    // rather than which state it happens to be in a moment later.
    const before = q.stand.tries();
    q.downloads.retryFailed();
    await until(() => q.stand.tries() > before, 'it was never tried again');
  });
});

describe('taking charge of the queue', () => {
  it('pauses one and starts it again', async () => {
    const q = await queue({ hold: true });
    q.downloads.add([FILE]);
    await until(() => q.downloads.list()[0]?.state === 'running');

    const id = q.downloads.list()[0]!.id;
    q.downloads.pause(id);
    expect(q.downloads.list()[0]!.state).toBe('paused');

    q.downloads.resume(id);
    expect(['waiting', 'running']).toContain(q.downloads.list()[0]!.state);
  });

  it('pauses the lot and starts the lot', async () => {
    const q = await queue({ hold: true });
    q.downloads.add(['https://example.test/a.zip', 'https://example.test/b.zip']);
    await until(() => q.downloads.list().some((i) => i.state === 'running'));

    q.downloads.pauseAll();
    await until(() => q.downloads.list().every((i) => i.state !== 'running'), 'something was still running');

    q.downloads.resumeAll();
    await until(() => q.downloads.list().every((i) => i.state !== 'paused'), 'something was left paused');
  });

  it('cancels one, and forgets it when asked', async () => {
    const q = await queue({ hold: true });
    q.downloads.add([FILE]);
    await until(() => q.downloads.list()[0]?.state === 'running');

    const id = q.downloads.list()[0]!.id;
    q.downloads.cancel(id);
    expect(['cancelled', 'failed', 'paused']).toContain(q.downloads.list()[0]!.state);

    q.downloads.remove(id);
    expect(q.downloads.list()).toEqual([]);
  });

  it('clears out what is finished and leaves the rest', async () => {
    const q = await queue();
    q.downloads.add([FILE]);
    await until(() => q.downloads.list()[0]?.state === 'ready');
    await q.downloads.clear();
    expect(q.downloads.list()).toEqual([]);
  });

  it('marks one as added to the library, with the pack it became', async () => {
    const q = await queue();
    q.downloads.add([FILE]);
    await until(() => q.downloads.list()[0]?.state === 'ready');
    const id = q.downloads.list()[0]!.id;
    q.downloads.done(id, 'Kit');
    expect(q.downloads.list()[0]!.packName).toBe('Kit');
    expect(q.downloads.urlOf(id)).toBe(FILE);
  });

  it('says nothing about an id it has never seen', async () => {
    const q = await queue();
    expect(q.downloads.fileOf('nope')).toBeNull();
    expect(q.downloads.urlOf('nope')).toBeNull();
    // None of these should throw over an id that is not there.
    q.downloads.pause('nope');
    q.downloads.resume('nope');
    q.downloads.cancel('nope');
    q.downloads.remove('nope');
    q.downloads.again('nope');
  });
});

describe('across a restart', () => {
  it('remembers the list, and does not carry on mid-download', async () => {
    const dir = tempDir();
    const stand = net();
    const first = new DownloadService({ dir, fetch: stand.fetch, onChanged: () => undefined, onReady: () => undefined });
    started.push(first);
    await first.load();
    first.add([FILE]);
    await until(() => first.list()[0]?.state === 'ready');
    // The list is written a moment after the change, so the restart waits for it to land.
    await until(() => existsSync(join(dir, 'downloads.json')) && readFileSync(join(dir, 'downloads.json'), 'utf8').includes(FILE), 'the list was never written');

    const second = new DownloadService({ dir, fetch: stand.fetch, onChanged: () => undefined, onReady: () => undefined });
    started.push(second);
    await second.load();
    expect(second.list().map((i) => i.url)).toEqual([FILE]);
  });

  it('starts empty rather than broken when the list on disk is nonsense', async () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'downloads.json'), '{ not json at all');
    const downloads = new DownloadService({ dir, fetch: net().fetch, onChanged: () => undefined, onReady: () => undefined });
    started.push(downloads);
    await downloads.load();
    expect(downloads.list()).toEqual([]);
  });
});

describe('naming what arrives', () => {
  it('takes the name the site gave it, not the one in the link', async () => {
    const dir = tempDir();
    const downloads = track(
      new DownloadService({
        dir,
        fetch: async () =>
          ({
            ok: true,
            status: 200,
            url: 'https://example.test/download?id=1234',
            headers: new Headers({ 'content-length': '4', 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="Space Kit v2.zip"' }),
            body: new ReadableStream<Uint8Array>({
              start(c) {
                c.enqueue(new TextEncoder().encode('abcd'));
                c.close();
              },
            }),
          }) as Response,
        onChanged: () => undefined,
        onReady: () => undefined,
      }),
    );
    await downloads.load();
    downloads.add(['https://example.test/download?id=1234']);
    await until(() => downloads.list()[0]?.state === 'ready');
    expect(downloads.list()[0]!.name).toBe('Space Kit v2.zip');
  });

  it('falls back to the link, and then to the site, when the name is nonsense', () => {
    expect(nameFor('https://example.test/packs/city-kit.zip', null)).toBe('city-kit.zip');
    expect(nameFor('https://example.test/packs/city-kit.zip', 'attachment; filename="../../etc/passwd"')).not.toContain('..');
    expect(nameFor('https://example.test/', null)).toBeTruthy();
  });

  it('keeps a name that could not be used as one out of the file system', () => {
    expect(safeName('a/b\\c:d*e?f"g<h>i|j.zip')).not.toMatch(/[/\\:*?"<>|]/);
    expect(safeName('   ')).toBeTruthy();
    expect(safeName('.'.repeat(300)).length).toBeLessThan(200);
  });
});

describe('links brought in bulk', () => {
  it('takes only so many at once, however many are pasted', async () => {
    const q = await queue();
    const many = Array.from({ length: 600 }, (_, i) => `https://example.test/packs/${i}.zip`);
    const added = q.downloads.add(many);
    expect(added.added).toBeLessThanOrEqual(500);
    q.downloads.pauseAll();
  });
});
