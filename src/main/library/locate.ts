import { constants, existsSync } from 'node:fs';
import { access, readdir, statfs } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { FolderInfo, LocateResult } from '@shared/types';
import { cloudService } from '@shared/folders';
import { DIRS, inspectFolder, MARKER, readLibraryInfo } from './layout';

const CLUTTER = new Set(['.DS_Store', 'desktop.ini', 'Thumbs.db', '.localized']);

/** The nearest folder that exists, going up from `path`. */
function existingAncestor(path: string): string {
  let dir = path;
  while (!existsSync(dir)) {
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return dir;
}

async function libraryAt(path: string): Promise<{ name: string; packs: number } | null> {
  if (!existsSync(join(path, MARKER))) return null;
  try {
    const info = await readLibraryInfo(path);
    const packs = (await readdir(join(path, DIRS.packs), { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).length;
    return { name: info.name, packs };
  } catch {
    return null;
  }
}

/** What the library dialogs need to know about a folder, whether or not it exists yet. */
export async function describeFolder(path: string): Promise<FolderInfo> {
  const kind = await inspectFolder(path).catch(() => 'other' as const);
  const near = existingAncestor(path);
  const entries = kind === 'missing' ? 0 : (await readdir(path).catch(() => [] as string[])).filter((e) => !CLUTTER.has(e)).length;
  const writable = await access(near, constants.W_OK).then(
    () => true,
    () => false,
  );
  const free = await statfs(near).then(
    (s) => s.bavail * s.bsize,
    () => null,
  );
  return { path, name: basename(path) || path, kind, entries, writable, free, cloud: cloudService(path), library: kind === 'library' ? await libraryAt(path) : null };
}

/**
 * Find the library a picked folder means: the folder itself, a library it sits inside (someone
 * picked `packs/`), or libraries one level down (someone picked the folder that holds theirs).
 */
export async function locateLibrary(path: string): Promise<LocateResult> {
  const own = await libraryAt(path);
  if (own) return { via: 'itself', found: [{ path, ...own }] };
  let dir = dirname(path);
  for (let i = 0; i < 6 && dir !== dirname(dir); i++, dir = dirname(dir)) {
    const lib = await libraryAt(dir);
    if (lib) return { via: 'parent', found: [{ path: dir, ...lib }] };
  }
  const children = (await readdir(path, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && !e.name.startsWith('.')).slice(0, 300);
  const found: LocateResult['found'] = [];
  for (const child of children) {
    const lib = await libraryAt(join(path, child.name));
    if (lib) found.push({ path: join(path, child.name), ...lib });
  }
  return found.length ? { via: 'inside', found } : { via: 'none', found: [] };
}
