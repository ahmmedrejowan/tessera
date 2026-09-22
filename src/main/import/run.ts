import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat, utimes } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isIgnored } from '@shared/assets';
import type { ImportItem, ImportResult, SiteRule } from '@shared/types';
import { listPackFiles } from '../index/files';
import type { LibraryIndex } from '../index/indexer';
import { detectPack } from '../library/detect';
import { PACK_DIRS } from '../library/layout';
import { createPack, writePack } from '../library/packs';
import { log } from '../log';

/** Copy one file, reporting bytes as they go, and keep its modified time. */
async function copyFile(src: string, dst: string, onBytes: (n: number) => void, signal?: AbortSignal): Promise<void> {
  const counter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      onBytes(chunk.length);
      done(null, chunk);
    },
  });
  await pipeline(createReadStream(src), counter, createWriteStream(dst, { flags: 'wx' }), signal ? { signal } : {});
  const s = await stat(src);
  await utimes(dst, s.atime, s.mtime);
}

/** Copy a file or a folder tree, skipping OS clutter. */
async function copyTree(src: string, dst: string, onBytes: (n: number) => void, signal?: AbortSignal): Promise<void> {
  const s = await stat(src);
  if (!s.isDirectory()) return copyFile(src, dst, onBytes, signal);
  await mkdir(dst, { recursive: true });
  for (const e of await readdir(src, { withFileTypes: true })) {
    if (isIgnored(e.name)) continue;
    if (e.isDirectory() || e.isFile()) await copyTree(join(src, e.name), join(dst, e.name), onBytes, signal);
  }
}

export interface ImportDeps {
  root: string;
  index: LibraryIndex;
  skipInboxWhenSure: boolean;
  /** The user's own rules for sites, used while working out each pack's licence. */
  siteRules?: SiteRule[];
  /** Being added through the add page: every pack waits (unfinished) until the user decides. */
  stage?: boolean;
  /** Bytes copied so far out of the total, and the pack being added. */
  onProgress: (done: number, total: number, current: string) => void;
  signal?: AbortSignal;
}

/**
 * Add packs to the library. Each becomes a folder with its download copied, untouched, into
 * `original/`; what can be read from its files (licence, site, creator) is recorded. Packs that
 * name their licence inside the download and come from a known site can go straight into the
 * library; the rest wait in the Inbox. The user's originals are never moved or changed.
 */
export async function runImport(items: ImportItem[], d: ImportDeps): Promise<ImportResult> {
  const total = items.reduce((n, i) => n + i.size, 0);
  let done = 0;
  const result: ImportResult = { added: [], failed: [] };

  for (const item of items) {
    if (d.signal?.aborted) break;
    d.onProgress(done, total, item.name);
    const before = done;
    let packDir: string | null = null;
    try {
      const pack = await createPack(d.root, item.name);
      packDir = pack.dir;
      const original = join(pack.dir, PACK_DIRS.original);
      for (const src of item.sources) {
        await copyTree(src, join(original, basename(src)), (n) => {
          done += n;
          d.onProgress(done, total, item.name);
        }, d.signal);
      }
      const { files } = await listPackFiles(pack.dir);
      const found = await detectPack(pack.dir, files, { downloadName: basename(item.sources[0]!), rules: d.siteRules ?? [], url: item.url });
      // Sure: the licence was read in the pack or set by the user's rule, and where it came from is known.
      const sure = !!found.licence && !!found.licenceSure && (!!found.site || !!found.url);
      const status = sure && d.skipInboxWhenSure && !d.stage ? 'library' : 'inbox';
      const meta = await writePack(pack.dir, {
        ...pack.meta,
        status,
        source: { ...pack.meta.source, site: found.site, url: found.url, creator: found.creator },
        licence: { ...pack.meta.licence, id: found.licence, notes: found.licenceFrom ? `Licence found in ${found.licenceFrom}.` : '' },
      });
      await d.index.syncPack({ ...pack, meta });
      result.added.push({ id: meta.id, item: item.id, name: meta.name, status });
    } catch (e) {
      log.error('import', `could not add ${item.name}`, e);
      result.failed.push({ name: item.name, error: e instanceof Error ? e.message : String(e) });
      // Nothing half-copied is left behind.
      if (packDir) await rm(packDir, { recursive: true, force: true }).catch(() => undefined);
      done = before + item.size;
    }
  }
  d.onProgress(total, total, '');
  return result;
}
