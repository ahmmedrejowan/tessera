import { ipcMain, nativeImage, type NativeImage } from 'electron';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { baseName } from '@shared/assets';
import { parseRef, readPackFile } from './index/files';
import { log } from './log';

/**
 * Dragging assets out of the window into other apps. The operating system drags real files, so
 * files inside archives are first written to a cache folder (and reused on the next drag).
 */

let icon: NativeImage | null = null;

/** A small rounded tile in the app's colour, shown under the pointer while dragging. */
function dragIcon(): NativeImage {
  if (icon) return icon;
  const size = 32;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = Math.hypot(Math.max(0, Math.abs(x - 15.5) - 10), Math.max(0, Math.abs(y - 15.5) - 10)) < 6;
      // BGRA
      px[i] = 0x8f;
      px[i + 1] = 0x6f;
      px[i + 2] = 0x3f;
      px[i + 3] = inside ? 230 : 0;
    }
  }
  icon = nativeImage.createFromBitmap(px, { width: size, height: size });
  return icon;
}

export function registerDrag(deps: { cacheDir: () => string | null; packDir: (id: string) => string | null }): void {
  /** Make sure a pack file exists on disk; returns its path. */
  const prepare = async (packId: string, ref: string): Promise<string | null> => {
    const dir = deps.packDir(packId);
    if (!dir) return null;
    const { file, inside } = parseRef(ref);
    if (file.split('/').includes('..')) return null;
    if (!inside.length) return join(dir, ...file.split('/'));
    const cache = deps.cacheDir();
    if (!cache) return null;
    const folder = join(cache, createHash('sha1').update(`${packId}|${ref}`).digest('hex').slice(0, 16));
    const out = join(folder, baseName(inside.at(-1)!));
    if (!existsSync(out)) {
      await mkdir(folder, { recursive: true });
      await writeFile(out, await readPackFile(dir, ref));
    }
    return out;
  };

  ipcMain.handle('drag:prepare', async (_e, items: { packId: string; ref: string }[]) => {
    const paths: string[] = [];
    for (const i of items.slice(0, 100)) {
      try {
        const p = await prepare(i.packId, i.ref);
        if (p) paths.push(p);
      } catch (e) {
        log.warn('drag', `could not prepare ${i.ref}`, e);
      }
    }
    return paths;
  });

  ipcMain.on('drag:start', (event, paths: string[]) => {
    const files = paths.filter((p) => existsSync(p));
    if (!files.length) return;
    event.sender.startDrag({ file: files[0]!, files, icon: dragIcon() });
  });
}
