import yauzl, { type Entry, type ZipFile } from 'yauzl';

/**
 * Reading zip archives in place — packs are kept exactly as downloaded, so their contents are
 * listed and read straight from the archive, never extracted into the library.
 */

export interface ZipEntryInfo {
  /** Path inside the archive, with forward slashes. */
  name: string;
  size: number;
  mtimeMs: number;
}

type Source = string | Buffer;

const open = (source: Source): Promise<ZipFile> =>
  typeof source === 'string'
    ? yauzl.openPromise(source, { lazyEntries: true, autoClose: false })
    : yauzl.fromBufferPromise(source, { lazyEntries: true });

/** Walk every entry, calling `visit` until it returns `false`. */
async function eachEntry(zip: ZipFile, visit: (e: Entry) => boolean | Promise<boolean>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', () => resolve());
    zip.on('entry', (entry: Entry) => {
      Promise.resolve(visit(entry)).then(
        (more) => (more ? zip.readEntry() : resolve()),
        reject,
      );
    });
    zip.readEntry();
  });
}

/** The files in an archive (folders left out). */
export async function listZip(source: Source): Promise<ZipEntryInfo[]> {
  const zip = await open(source);
  const out: ZipEntryInfo[] = [];
  try {
    await eachEntry(zip, (e) => {
      if (!e.fileName.endsWith('/')) out.push({ name: e.fileName, size: e.uncompressedSize, mtimeMs: e.getLastModDate().getTime() });
      return true;
    });
  } finally {
    zip.close();
  }
  return out;
}

export class EntryTooLargeError extends Error {
  constructor(name: string, size: number, max: number) {
    super(`${name} is ${Math.round(size / 1e6)} MB, more than the ${Math.round(max / 1e6)} MB that can be read at once`);
  }
}

/** Read one file out of an archive into memory. */
export async function readZipEntry(source: Source, name: string, maxBytes = 512 * 1024 * 1024): Promise<Buffer> {
  const zip = await open(source);
  try {
    let found: Buffer | null = null;
    await eachEntry(zip, async (e) => {
      if (e.fileName !== name) return true;
      if (e.uncompressedSize > maxBytes) throw new EntryTooLargeError(name, e.uncompressedSize, maxBytes);
      const stream = await zip.openReadStreamPromise(e);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      found = Buffer.concat(chunks);
      return false;
    });
    if (!found) throw new Error(`${name} isn't in the archive`);
    return found;
  } finally {
    zip.close();
  }
}

/** Read several files from one archive in a single pass; missing names are simply absent. */
export async function readZipEntries(source: Source, names: Iterable<string>, maxBytes = 512 * 1024 * 1024): Promise<Map<string, Buffer>> {
  const wanted = new Set(names);
  const out = new Map<string, Buffer>();
  if (!wanted.size) return out;
  const zip = await open(source);
  try {
    await eachEntry(zip, async (e) => {
      if (wanted.has(e.fileName) && e.uncompressedSize <= maxBytes) {
        const stream = await zip.openReadStreamPromise(e);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(chunk as Buffer);
        out.set(e.fileName, Buffer.concat(chunks));
      }
      return out.size < wanted.size;
    });
  } finally {
    zip.close();
  }
  return out;
}

export const isZip = (name: string) => /\.zip$/i.test(name);
