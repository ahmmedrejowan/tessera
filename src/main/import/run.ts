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
export async function copyTree(src: string, dst: string, onBytes: (n: number) => void, signal?: AbortSignal): Promise<void> {
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
  /**
   * Remove each original once its copy is safely in the library.
   *
   * Never a rename: the copy is made and read back first, so a failure at any point leaves the
   * person with the file they started with. This is the only thing in the app that takes something
   * away, so it is deliberately the slow way round.
   */
  move?: boolean;
  /**
   * Read the files where they are instead of copying them in. The library gets the record and
   * nothing else; not one byte is written into the folder they came from, then or ever.
   */
  keep?: boolean;
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
      const where = d.keep ? keptRoot(item) : null;
      const pack = await createPack(d.root, item.name);
      packDir = pack.dir;
      if (where) {
        // Nothing is copied. The pack folder holds the record and the licence proof; the files
        // stay where their owner put them, and are only ever read.
        await rm(join(pack.dir, PACK_DIRS.original), { recursive: true, force: true }).catch(() => undefined);
        done += item.size;
        d.onProgress(done, total, item.name);
      } else {
        const original = join(pack.dir, PACK_DIRS.original);
        for (const src of item.sources) {
          await copyTree(src, join(original, basename(src)), (n) => {
            done += n;
            d.onProgress(done, total, item.name);
          }, d.signal);
        }
      }
      const filesRoot = where ?? pack.dir;
      const { files } = await listPackFiles(filesRoot, where ?? join(pack.dir, PACK_DIRS.original));
      const found = await detectPack(filesRoot, files, { downloadName: basename(item.sources[0]!), rules: d.siteRules ?? [], url: item.url });
      // Sure: the licence was read in the pack or set by the user's rule, and where it came from is known.
      const sure = !!found.licence && !!found.licenceSure && (!!found.site || !!found.url);
      const status = sure && d.skipInboxWhenSure && !d.stage ? 'library' : 'inbox';
      const meta = await writePack(pack.dir, {
        ...pack.meta,
        status,
        kept: where ? { where, since: new Date().toISOString(), volume: volumeOf(where) } : null,
        source: { ...pack.meta.source, site: found.site, url: found.url, creator: found.creator },
        licence: { ...pack.meta.licence, id: found.licence, notes: found.licenceFrom ? `Licence found in ${found.licenceFrom}.` : '' },
      });
      await d.index.syncPack({ ...pack, meta });
      // Only now, with the copy in place and read back as a pack, is the original let go of.
      if (!where && movable(item, d)) await takeAway(item.sources);
      result.added.push({ id: meta.id, item: item.id, name: meta.name, status });
    } catch (e) {
      log.error('import', `could not add ${item.name}`, e);
      result.failed.push({ item: item.id, name: item.name, error: e instanceof Error ? e.message : String(e) });
      // Nothing half-copied is left behind.
      if (packDir) await rm(packDir, { recursive: true, force: true }).catch(() => undefined);
      done = before + item.size;
    }
  }
  d.onProgress(total, total, '');
  return result;
}

/**
 * The folder a pack indexed where it lies is read from.
 *
 * One folder, always: a pack is a folder of files, and a set of loose files picked out of a
 * folder would leave the pack meaning "these seven files" with nothing on disk to say so. So
 * loose files and archives are not offered this way, and the Add page does not show the choice
 * for them.
 */
export function keptRoot(item: ImportItem): string | null {
  if (item.kind !== 'folder') return null;
  return item.sources[0] ?? null;
}

/** Whether a pack could be indexed where it lies, for the Add page to know what to offer. */
export const canKeep = (item: ImportItem): boolean => keptRoot(item) !== null;

/** The volume a path is on, for a better message than "the folder could not be found". */
function volumeOf(path: string): string | null {
  // macOS mounts other drives under /Volumes/<name>; elsewhere the drive letter or the root.
  const m = /^\/Volumes\/([^/]+)/.exec(path) ?? /^([A-Za-z]:)\\/.exec(path);
  return m?.[1] ?? null;
}

/**
 * Whether this item's originals may be removed once it is in.
 *
 * Only when asked for, and only when it is a download rather than a folder someone lives in. A
 * whole folder that was picked by hand is left alone: "add my art folder" must never mean "empty
 * my art folder". A download Tessera fetched is treated like any other file, so it stays in
 * Downloads until it is added, and then goes or stays by the same answer as everything else.
 */
export function movable(item: ImportItem, d: ImportDeps): boolean {
  // While a pack is only staged the person can still cancel, and cancelling throws the copy away.
  // Nothing is taken until they keep it.
  if (d.stage) return false;
  if (!d.move) return false;
  return item.kind !== 'folder';
}

/** Remove the originals, one at a time. A file that will not go is left, and not worth failing over. */
async function takeAway(sources: string[]): Promise<void> {
  for (const src of sources) {
    await rm(src, { recursive: true, force: true }).catch((e: unknown) => log.warn('import', `could not remove ${src} after moving it in`, e));
  }
}
