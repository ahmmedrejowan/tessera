import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { hostLabel, linksIn, nameFromUrl } from '../src/shared/links';
import { DownloadService, linksInFiles, nameFor, safeName } from '../src/main/downloads/service';
import type { DownloadItem } from '../src/shared/types';

/**
 * Folders of this file's own, cleared once at the end. A queue keeps writing its list for a moment
 * after a test finishes, and a folder taken away underneath it is a race the queue loses.
 */
const mine: string[] = [];
const tempDir = (prefix = 'tessera-dl-') => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  mine.push(dir);
  return dir;
};

/** Every queue a test started, stopped before the next one begins. */
const started: DownloadService[] = [];
const track = (service: DownloadService) => {
  started.push(service);
  return service;
};

afterEach(() => {
  for (const service of started.splice(0)) service.stopAll();
});
afterAll(() => {
  for (const dir of mine.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * Wait for the list to settle on what the test is looking for. A dropped connection is waited out
 * before another go, and those waits are seconds, so this has to be patient enough for them.
 */
async function until(check: () => boolean, what: string, goes = 1500): Promise<void> {
  for (let i = 0; i < goes; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`gave up waiting for ${what}`);
}

const body = (text: string) => new Response(text, { headers: { 'content-length': String(Buffer.byteLength(text)), 'content-type': 'application/zip' } });

describe('links the user brings', () => {
  it('finds web links in a list, a bookmarks file or a shortcut, and leaves the rest', () => {
    expect(linksIn('https://kenney.nl/assets/a.zip\nhttps://polyhaven.com/b.zip')).toEqual(['https://kenney.nl/assets/a.zip', 'https://polyhaven.com/b.zip']);
    // Repeats, comments, trailing punctuation and things that aren't links.
    expect(linksIn('# my list\nhttps://a.example/x.zip,\nhttps://a.example/x.zip\nftp://b.example/y.zip\nnot a link')).toEqual(['https://a.example/x.zip']);
    expect(linksIn('<DT><A HREF="https://a.example/pack.zip" ADD_DATE="1">Pack</A>')).toEqual(['https://a.example/pack.zip']);
    expect(linksIn('[InternetShortcut]\nURL=https://a.example/pack.zip')).toEqual(['https://a.example/pack.zip']);
    expect(linksIn('file:///Users/me/secret.zip http://localhost/x')).toEqual([]);
  });

  it('reads links out of files that were dropped', async () => {
    const d = tempDir('tessera-links-');
    writeFileSync(join(d, 'list.txt'), 'https://a.example/one.zip\nhttps://a.example/two.zip');
    writeFileSync(join(d, 'more.json'), JSON.stringify({ packs: [{ url: 'https://b.example/three.zip' }] }));
    expect(await linksInFiles([join(d, 'list.txt'), join(d, 'more.json'), join(d, 'missing.txt')])).toEqual([
      'https://a.example/one.zip',
      'https://a.example/two.zip',
      'https://b.example/three.zip',
    ]);
  });

  it('names a download after what the site says, else after the link', () => {
    expect(nameFor('https://a.example/x', 'attachment; filename="City Kit.zip"')).toBe('City Kit.zip');
    expect(nameFor('https://a.example/x', "attachment; filename*=UTF-8''caf%C3%A9%20pack.zip")).toBe('café pack.zip');
    expect(nameFor('https://a.example/packs/city-kit.zip?v=2', null)).toBe('city-kit.zip');
    expect(nameFor('https://a.example/', null)).toBe('a.example');
    expect(safeName('../../etc/passwd')).toBe('etc passwd');
    expect(nameFromUrl('https://a.example/a%20b.zip')).toBe('a b.zip');
    expect(hostLabel('https://www.kenney.nl/assets')).toBe('kenney.nl');
  });
});

describe('the download queue', () => {
  it('fetches a link, keeps the file and says it is ready', async () => {
    const dir = tempDir('tessera-dl-');
    const ready: DownloadItem[] = [];
    const service = track(new DownloadService({
      dir,
      fetch: () => Promise.resolve(body('a zip, more or less')),
      onChanged: () => undefined,
      onReady: (item) => ready.push(item),
    }));
    expect(service.add(['https://a.example/packs/city-kit.zip'])).toEqual({ added: 1, skipped: 0 });
    await until(() => ready.length === 1, 'the download to finish');
    const item = service.list()[0]!;
    expect(item.state).toBe('ready');
    expect(item.name).toBe('city-kit.zip');
    expect(item.host).toBe('a.example');
    expect(readFileSync(item.file!, 'utf8')).toBe('a zip, more or less');
    expect(readdirSync(join(dir, item.id))).toEqual(['city-kit.zip']);

    // The same link again while it's in the list is not fetched twice.
    expect(service.add(['https://a.example/packs/city-kit.zip'])).toEqual({ added: 0, skipped: 1 });
    // Once it's in the library the row says so, and the file stays until the list is cleared.
    service.done(item.id, 'City Kit');
    expect(service.list()[0]).toMatchObject({ state: 'added', packName: 'City Kit' });
    await service.clear();
    expect(service.list()).toEqual([]);
  });

  it('says so when a link opens a page instead of a file, and never keeps it', async () => {
    const dir = tempDir('tessera-dl-');
    const service = track(new DownloadService({
      dir,
      fetch: () => Promise.resolve(new Response('<html>Download</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } })),
      onChanged: () => undefined,
      onReady: () => undefined,
    }));
    service.add(['https://a.example/assets/city-kit']);
    await until(() => service.list()[0]?.state === 'failed', 'the page to be refused');
    expect(service.list()[0]!.error).toMatch(/opens a web page/);
    // A wrong link is not tried again by itself.
    expect(service.list()[0]!.tries).toBe(1);
  });

  it('tries again by itself and carries on where it stopped', async () => {
    const dir = tempDir('tessera-dl-');
    const whole = 'one two three four';
    const asked: (string | null)[] = [];
    let attempt = 0;
    const service = track(new DownloadService({
      dir,
      fetch: (_url, init) => {
        asked.push(new Headers(init?.headers).get('range'));
        attempt++;
        if (attempt === 1) {
          // The first few bytes arrive, then the connection drops.
          const stream = new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode(whole.slice(0, 7)));
              setTimeout(() => c.error(new Error('the connection dropped')), 10);
            },
          });
          return Promise.resolve(new Response(stream, { headers: { 'content-length': String(whole.length), 'content-type': 'application/zip' } }));
        }
        return Promise.resolve(new Response(whole.slice(7), { status: 206, headers: { 'content-length': String(whole.length - 7), 'content-type': 'application/zip' } }));
      },
      onChanged: () => undefined,
      onReady: () => undefined,
    }));
    service.add(['https://a.example/packs/big.zip']);
    // The dropped connection is not the user's problem: it waits a moment and asks for the rest.
    await until(() => service.list()[0]?.state === 'ready', 'the rest to arrive', 600);
    expect(asked).toEqual([null, 'bytes=7-']);
    expect(service.list()[0]!.tries).toBe(2);
    expect(readFileSync(service.list()[0]!.file!, 'utf8')).toBe(whole);
  });
});

describe('what happens after a download finishes', () => {
  it('is the app’s answer now, and takes it from whichever library had one', async () => {
    const { SettingsStore } = await import('../src/main/settings');
    const record = { id: 'lib1', name: 'Lib', path: '/tmp/lib', lastOpenedAt: '2026-01-01T00:00:00.000Z', skipInboxWhenSure: true, sync: { enabled: false, mode: 'full', whileClosed: true }, backup: null };

    const kept = tempDir('tessera-prefs-');
    writeFileSync(join(kept, 'settings.json'), JSON.stringify({ libraries: { lib1: { ...record, autoAddDownloads: false } } }));
    expect((await new SettingsStore(kept).load()).afterDownload).toBe('ask');

    const fresh = tempDir('tessera-prefs-');
    writeFileSync(join(fresh, 'settings.json'), JSON.stringify({ libraries: { lib1: record } }));
    expect((await new SettingsStore(fresh).load()).afterDownload).toBe('add');
  });
});
