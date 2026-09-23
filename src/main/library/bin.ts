import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { assetPath } from '@shared/assets';
import type { BinEntry } from '@shared/types';
import { readJson, writeJson } from '../fsx';
import { DIRS } from './layout';

/**
 * The library's own wastebasket. Deleting puts things here, inside the library, so they travel
 * with it, restore to exactly where they were, and never depend on the computer's own bin.
 *
 * A pack goes in whole (its folder is moved). A loose file is moved on its own. A file that lives
 * inside a pack's archive cannot be moved out of it, so it is only recorded: the index hides it
 * until the entry is restored or the bin is emptied.
 */

const Entry = z.object({
  id: z.string().min(8),
  kind: z.enum(['pack', 'file']),
  deletedAt: z.string(),
  packId: z.string(),
  packName: z.string(),
  /** A pack's folder name, or the file's ref inside its pack. */
  ref: z.string(),
  /** The path shown to people. */
  shown: z.string(),
  size: z.number().nonnegative().default(0),
  /** The file could not be moved (it is inside an archive); it is hidden rather than kept here. */
  hiddenOnly: z.boolean().default(false),
});

const Bin = z.object({ format: z.literal(1).default(1), entries: z.array(Entry).default([]) });

const binDir = (root: string) => join(root, DIRS.bin);
const binFile = (root: string) => join(binDir(root), 'bin.json');

export async function readBin(root: string): Promise<BinEntry[]> {
  const parsed = Bin.safeParse(await readJson(binFile(root)).catch(() => null));
  return parsed.success ? parsed.data.entries : [];
}

async function save(root: string, entries: BinEntry[]): Promise<void> {
  await mkdir(binDir(root), { recursive: true });
  await writeJson(binFile(root), Bin.parse({ entries }));
}

/** Where an entry's files are kept while they are in the bin. */
const kept = (root: string, entry: BinEntry) => join(binDir(root), entry.id);

/** Move a whole pack folder into the bin. */
export async function binPack(root: string, packId: string, packName: string, folder: string, dir: string, size: number): Promise<BinEntry> {
  const entry: BinEntry = { id: randomUUID(), kind: 'pack', deletedAt: new Date().toISOString(), packId, packName, ref: folder, shown: packName, size, hiddenOnly: false };
  const to = kept(root, entry);
  await mkdir(to, { recursive: true });
  await rename(dir, join(to, folder));
  await save(root, [entry, ...(await readBin(root))]);
  return entry;
}

/**
 * Move files out of a pack and into the bin. Files inside the pack's archive can't be moved, so
 * they are recorded and hidden instead.
 */
export async function binFiles(root: string, packDir: string, packId: string, packName: string, refs: { ref: string; size: number; inArchive: boolean }[]): Promise<BinEntry[]> {
  const made: BinEntry[] = [];
  for (const { ref, size, inArchive } of refs) {
    const entry: BinEntry = { id: randomUUID(), kind: 'file', deletedAt: new Date().toISOString(), packId, packName, ref, shown: assetPath(ref), size, hiddenOnly: inArchive };
    if (!inArchive) {
      const to = join(kept(root, entry), ref);
      await mkdir(dirname(to), { recursive: true });
      await rename(join(packDir, ...ref.split('/')), to);
    }
    made.push(entry);
  }
  if (made.length) await save(root, [...made, ...(await readBin(root))]);
  return made;
}

/** Put an entry back where it came from. Returns what was restored, or null when it has gone. */
export async function restoreFromBin(root: string, id: string, packDir: (packId: string) => string, packsDir: string): Promise<BinEntry | null> {
  const entries = await readBin(root);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  if (entry.kind === 'pack') {
    const from = join(kept(root, entry), entry.ref);
    if (await stat(from).catch(() => null)) await rename(from, join(packsDir, entry.ref));
  } else if (!entry.hiddenOnly) {
    const from = join(kept(root, entry), entry.ref);
    const to = join(packDir(entry.packId), ...entry.ref.split('/'));
    if (await stat(from).catch(() => null)) {
      await mkdir(dirname(to), { recursive: true });
      await rename(from, to);
    }
  }
  await rm(kept(root, entry), { recursive: true, force: true });
  await save(
    root,
    entries.filter((e) => e.id !== id),
  );
  return entry;
}

/** Throw away what is in the bin, for good. With no ids, everything. */
export async function emptyBin(root: string, ids?: string[]): Promise<number> {
  const entries = await readBin(root);
  const going = ids ? entries.filter((e) => ids.includes(e.id)) : entries;
  for (const e of going) await rm(kept(root, e), { recursive: true, force: true });
  await save(
    root,
    entries.filter((e) => !going.includes(e)),
  );
  return going.length;
}

/** Throw away anything deleted longer ago than `days`. Zero days means keep it all. */
export async function sweepBin(root: string, days: number): Promise<number> {
  if (!days) return 0;
  const cutoff = Date.now() - days * 86_400_000;
  const old = (await readBin(root)).filter((e) => new Date(e.deletedAt).getTime() < cutoff);
  return old.length ? emptyBin(root, old.map((e) => e.id)) : 0;
}
