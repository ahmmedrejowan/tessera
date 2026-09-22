import { randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { isIgnored } from '@shared/assets';
import type { ImportItem } from '@shared/types';
import { nameFromDownload } from '../library/detect';

/** Downloads that are one pack each. */
const ARCHIVE = /\.(zip|7z|rar|tar|gz|tgz|unitypackage)$/i;

async function folderSize(dir: string): Promise<{ size: number; files: number }> {
  let size = 0;
  let files = 0;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (isIgnored(e.name)) continue;
    if (e.isDirectory()) {
      const s = await folderSize(p);
      size += s.size;
      files += s.files;
    } else if (e.isFile()) {
      size += (await stat(p)).size;
      files++;
    }
  }
  return { size, files };
}

async function item(path: string): Promise<ImportItem | null> {
  const s = await stat(path).catch(() => null);
  if (!s) return null;
  const file = basename(path);
  if (s.isDirectory()) {
    const { size, files } = await folderSize(path);
    if (!files) return null;
    return { id: randomUUID(), name: nameFromDownload(file), sources: [path], kind: 'folder', size, files, duplicateOf: null };
  }
  if (!s.isFile() || isIgnored(file)) return null;
  return { id: randomUUID(), name: nameFromDownload(file), sources: [path], kind: ARCHIVE.test(file) ? 'archive' : 'files', size: s.size, files: 1, duplicateOf: null };
}

/** Readmes, licences and shortcuts that sit beside the packs in a folder of downloads. */
const NOTE = /\.(txt|md|url|html?|pdf|nfo|rtf)$/i;

/**
 * Whether a folder holds several packs (a folder of downloads) rather than being one pack: two
 * or more archives or sub-folders, and nothing else in it but notes.
 */
export async function isFolderOfPacks(dir: string): Promise<boolean> {
  const entries = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => !isIgnored(e.name) && !e.name.startsWith('.'));
  const packs = entries.filter((e) => e.isDirectory() || (e.isFile() && ARCHIVE.test(e.name))).length;
  const other = entries.filter((e) => e.isFile() && !ARCHIVE.test(e.name) && !NOTE.test(e.name)).length;
  return packs >= 2 && other === 0;
}

/**
 * What adding these paths would create. Each archive and each folder is a pack. Loose files that
 * aren't archives (a handful of PNGs, say) are gathered into one pack, named after their folder.
 * A folder is a collection of packs (every archive and folder in it is one) with `eachInside`,
 * or, with 'auto', when it looks like one. Packs found inside a folder say which (`folder`).
 */
export async function planImport(paths: string[], eachInside: boolean | 'auto' = false): Promise<ImportItem[]> {
  const expanded: { path: string; folder?: string }[] = [];
  for (const p of paths) {
    const s = await stat(p).catch(() => null);
    const each = s?.isDirectory() && (eachInside === 'auto' ? await isFolderOfPacks(p) : eachInside);
    if (each) {
      for (const e of await readdir(p)) if (!isIgnored(e) && !e.startsWith('.') && !NOTE.test(e)) expanded.push({ path: join(p, e), folder: p });
    } else expanded.push({ path: p });
  }
  const items = (await Promise.all(expanded.map(async (x) => {
    const it = await item(x.path);
    return it && x.folder ? { ...it, folder: x.folder } : it;
  }))).filter((x): x is ImportItem => !!x);
  const loose = items.filter((i) => i.kind === 'files');
  const rest = items.filter((i) => i.kind !== 'files');
  if (loose.length > 1) {
    const folder = basename(join(loose[0]!.sources[0]!, '..'));
    rest.push({
      id: randomUUID(),
      name: nameFromDownload(folder),
      sources: loose.flatMap((l) => l.sources),
      kind: 'files',
      size: loose.reduce((n, l) => n + l.size, 0),
      files: loose.length,
      duplicateOf: null,
    });
  } else rest.push(...loose);
  return rest.sort((a, b) => a.name.localeCompare(b.name));
}

/** The name a file keeps inside a pack's original/ folder. */
export const keptName = (source: string) => basename(source, extname(source)) + extname(source);
