import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { readJson, writeJson } from '../fsx';
import { UserError } from '../errors';

/**
 * The on-disk layout of a library:
 *
 *   <library>/
 *     tessera-library.json     marks the folder as a library
 *     packs/<Pack name>/
 *       pack.json              the pack's record (see shared/pack.ts)
 *       original/              the download exactly as it arrived: archives and files
 *       licence/               licence text, receipts and other proof
 *     collections/<id>.json    user collections
 *
 * Nothing else is written into a library: indexes and thumbnails live in the app's data folder.
 */

export const MARKER = 'tessera-library.json';
export const LIBRARY_FORMAT = 1;
export const DIRS = { packs: 'packs', collections: 'collections' } as const;
export const PACK_FILE = 'pack.json';
export const PACK_DIRS = { original: 'original', licence: 'licence' } as const;

export const LibraryInfo = z.object({
  format: z.number().int(),
  id: z.string().min(8),
  name: z.string().min(1),
  createdAt: z.string(),
});
export type LibraryInfo = z.infer<typeof LibraryInfo>;

export type FolderKind = 'library' | 'empty' | 'missing' | 'other';

const IGNORED = new Set(['.DS_Store', 'desktop.ini', 'Thumbs.db']);

/** What a folder is: a library, empty (fine to create one in), missing, or something else. */
export async function inspectFolder(dir: string): Promise<FolderKind> {
  if (!existsSync(dir)) return 'missing';
  if (existsSync(join(dir, MARKER))) return 'library';
  const s = await stat(dir);
  if (!s.isDirectory()) return 'other';
  const entries = (await readdir(dir)).filter((e) => !IGNORED.has(e));
  return entries.length === 0 ? 'empty' : 'other';
}

export async function readLibraryInfo(root: string): Promise<LibraryInfo> {
  let raw: unknown;
  try {
    raw = await readJson(join(root, MARKER));
  } catch {
    throw new UserError('library-unreadable', `The library file in ${root} can't be read.`);
  }
  if (raw === null) throw new UserError('not-a-library', `${root} isn't a Tessera library.`);
  const parsed = LibraryInfo.safeParse(raw);
  if (!parsed.success) throw new UserError('library-unreadable', `The library file in ${root} is damaged.`);
  if (parsed.data.format > LIBRARY_FORMAT) {
    throw new UserError('library-too-new', 'This library was made by a newer version of Tessera. Update Tessera to open it.');
  }
  return parsed.data;
}

/** Make a new, empty library in `root` (created if missing; must be empty). */
export async function createLibrary(root: string, name: string): Promise<LibraryInfo> {
  const kind = await inspectFolder(root);
  if (kind === 'library') throw new UserError('already-library', `${root} is already a Tessera library.`);
  if (kind === 'other') throw new UserError('folder-not-empty', `${root} isn't empty. Choose an empty folder, or a new one.`);
  await mkdir(join(root, DIRS.packs), { recursive: true });
  await mkdir(join(root, DIRS.collections), { recursive: true });
  const info: LibraryInfo = { format: LIBRARY_FORMAT, id: randomUUID(), name, createdAt: new Date().toISOString() };
  await writeJson(join(root, MARKER), info);
  return info;
}
