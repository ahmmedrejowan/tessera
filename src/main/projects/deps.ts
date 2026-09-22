import { posix } from 'node:path';
import { baseName, extOf } from '@shared/assets';
import { readPackFile } from '../index/files';

/**
 * Files a model needs beside it: a glTF's buffers and images, an OBJ's material library and its
 * texture maps, and the textures an FBX or Collada file names inside itself. References that no
 * longer point anywhere (an author's own disk paths) are found by file name within the pack.
 */

const IMAGE_NAME = /[\w\-. ()[\]]+\.(png|jpe?g|tga|bmp|tiff?|psd|dds|webp)/gi;

/** Where a relative link from `from` leads, as a ref, or null if it climbs out of the archive. */
export function resolveRef(from: string, link: string): string | null {
  const cut = from.lastIndexOf('!');
  const prefix = cut >= 0 ? from.slice(0, cut + 1) : '';
  const inner = cut >= 0 ? from.slice(cut + 1) : from;
  const clean = decodeURIComponent(link.replace(/\\/g, '/')).replace(/^\.\//, '');
  if (/^[a-z]+:/i.test(clean) || clean.startsWith('/')) return null;
  const joined = posix.normalize(posix.join(posix.dirname(inner), clean));
  if (joined.startsWith('..')) return null;
  return prefix + joined;
}

/** Of several files with the same name, the one closest to `near` in the pack. */
function closest(candidates: string[], near: string): string {
  const score = (ref: string) => {
    let i = 0;
    while (i < ref.length && i < near.length && ref[i] === near[i]) i++;
    return i;
  };
  return [...candidates].sort((a, b) => score(b) - score(a) || a.length - b.length)[0]!;
}

export async function dependencies(packDir: string, packRefs: string[], ref: string): Promise<string[]> {
  const byName = new Map<string, string[]>();
  for (const r of packRefs) {
    const n = baseName(r.replace(/!/g, '/')).toLowerCase();
    const list = byName.get(n);
    if (list) list.push(r);
    else byName.set(n, [r]);
  }
  const exists = new Set(packRefs);
  const found = new Set<string>();

  /** Add a link: the path it gives if that file exists, else a file of the same name nearby. */
  const link = (from: string, target: string) => {
    const direct = resolveRef(from, target);
    if (direct && exists.has(direct)) return found.add(direct), direct;
    const name = baseName(target.replace(/\\/g, '/')).toLowerCase();
    const same = byName.get(name);
    if (same) {
      const pick = closest(same, from);
      found.add(pick);
      return pick;
    }
    return null;
  };

  const ext = extOf(ref);
  if (ext === 'gltf') {
    const gltf = JSON.parse((await readPackFile(packDir, ref)).toString('utf8')) as { buffers?: { uri?: string }[]; images?: { uri?: string }[] };
    for (const item of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) if (item.uri && !item.uri.startsWith('data:')) link(ref, item.uri);
  } else if (ext === 'obj') {
    const text = (await readPackFile(packDir, ref)).toString('utf8');
    for (const m of text.matchAll(/^mtllib\s+(.+)$/gm)) {
      const mtl = link(ref, m[1]!.trim());
      if (!mtl) continue;
      const mtlText = (await readPackFile(packDir, mtl)).toString('utf8');
      for (const line of mtlText.matchAll(/^\s*(?:map_\w+|bump|disp|decal|refl)\s+(.+)$/gim)) {
        // Options ("-bm 0.5") come before the file name, which may contain spaces.
        const parts = line[1]!.trim().split(/\s+/);
        let i = 0;
        while (i < parts.length && parts[i]!.startsWith('-')) {
          i++;
          while (i < parts.length - 1 && /^[-+]?\d*\.?\d+$/.test(parts[i]!)) i++;
        }
        const file = parts.slice(i).join(' ');
        if (file) link(mtl, file);
      }
    }
  } else if (ext === 'fbx' || ext === 'dae' || ext === '3ds') {
    // Texture names are stored as plain text even in binary FBX.
    const text = (await readPackFile(packDir, ref)).toString('latin1');
    for (const m of text.matchAll(IMAGE_NAME)) link(ref, m[0]);
  }
  found.delete(ref);
  return [...found];
}
