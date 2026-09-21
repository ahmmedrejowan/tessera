import { stat } from 'node:fs/promises';
import yauzl, { type Entry, type ZipFile } from 'yauzl';

/**
 * Open archives kept for a short while, each with a name → entry map, so reading many files from
 * one archive (thumbnails of a whole pack) doesn't reopen it and rescan its entries every time.
 */

interface Open {
  zip: ZipFile;
  entries: Map<string, Entry>;
  /** For a zip on disk: its size and time when opened, to notice it changing. */
  stamp: string;
  lastUsed: number;
  /** Reads in progress; the archive isn't closed under them. */
  busy: number;
}

const MAX_OPEN = 8;
const IDLE_MS = 30_000;

const cache = new Map<string, Promise<Open>>();
let sweeper: NodeJS.Timeout | null = null;

async function load(source: string | Buffer, stamp: string): Promise<Open> {
  const zip =
    typeof source === 'string'
      ? await yauzl.openPromise(source, { lazyEntries: true, autoClose: false })
      : await yauzl.fromBufferPromise(source, { lazyEntries: true, autoClose: false });
  const entries = new Map<string, Entry>();
  await new Promise<void>((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', () => resolve());
    zip.on('entry', (e: Entry) => {
      if (!e.fileName.endsWith('/')) entries.set(e.fileName, e);
      zip.readEntry();
    });
    zip.readEntry();
  });
  return { zip, entries, stamp, lastUsed: Date.now(), busy: 0 };
}

/** Close archives idle for a while, and the least recently used ones beyond the limit. */
async function sweep(): Promise<void> {
  const now = Date.now();
  const open: [string, Open][] = [];
  for (const [key, p] of [...cache.entries()]) {
    const o = await p.catch(() => null);
    if (o) open.push([key, o]);
  }
  open.sort((a, b) => b[1].lastUsed - a[1].lastUsed);
  open.forEach(([key, o], i) => {
    if (o.busy === 0 && (now - o.lastUsed > IDLE_MS || i >= MAX_OPEN) && cache.has(key)) {
      cache.delete(key);
      o.zip.close();
    }
  });
  if (!cache.size && sweeper) {
    clearInterval(sweeper);
    sweeper = null;
  }
}

/**
 * Read one entry. `key` identifies the archive (its path, or its ref when it sits inside another
 * archive); `source` is the path or the archive's bytes.
 */
export async function readCachedEntry(
  key: string,
  source: string | (() => Promise<Buffer>),
  name: string,
  maxBytes: number,
): Promise<Buffer> {
  // An archive on disk is checked for changes; one inside another archive is keyed by its parent's stamp.
  const stamp = typeof source === 'string' ? await stat(source).then((s) => `${s.size}:${s.mtimeMs}`) : 'nested';
  let pending = cache.get(key);
  if (pending) {
    const o = await pending.catch(() => null);
    if (!o || o.stamp !== stamp) {
      cache.delete(key);
      if (o && o.busy === 0) o.zip.close();
      pending = undefined;
    }
  }
  if (!pending) {
    pending = (async () => load(typeof source === 'string' ? source : await source(), stamp))();
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
    if (!sweeper) sweeper = setInterval(() => void sweep(), 10_000);
    if (cache.size > MAX_OPEN) void sweep();
  }
  const o = await pending;
  const entry = o.entries.get(name);
  if (!entry) throw new Error(`${name} isn't in the archive`);
  if (entry.uncompressedSize > maxBytes) throw new Error(`${name} is too large to read at once`);
  o.busy++;
  o.lastUsed = Date.now();
  try {
    const stream = await o.zip.openReadStreamPromise(entry);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  } finally {
    o.busy--;
    o.lastUsed = Date.now();
  }
}

/** Close everything (a library closing, tests). */
export function closeAllZips(): void {
  for (const p of cache.values()) void p.then((o) => o.zip.close(), () => undefined);
  cache.clear();
}
