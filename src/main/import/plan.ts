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

/**
 * What adding these paths would create. Each archive and each folder is a pack. Loose files that
 * aren't archives (a handful of PNGs, say) are gathered into one pack, named after their folder.
 * With `eachInside`, a folder is a collection of packs: every archive and folder in it is one.
 */
export async function planImport(paths: string[], eachInside = false): Promise<ImportItem[]> {
  const expanded: string[] = [];
  for (const p of paths) {
    const s = await stat(p).catch(() => null);
    if (eachInside && s?.isDirectory()) {
      for (const e of await readdir(p)) if (!isIgnored(e) && !e.startsWith('.')) expanded.push(join(p, e));
    } else expanded.push(p);
  }
  const items = (await Promise.all(expanded.map(item))).filter((x): x is ImportItem => !!x);
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
