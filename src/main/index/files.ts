import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { isIgnored } from '@shared/assets';
import { PACK_DIRS } from '../library/layout';
import { isZip, listZip, readZipEntry } from './zip';

/**
 * A file in a pack, addressed by its `ref`: the path from the pack's folder with forward slashes,
 * where `!` steps into an archive. `original/City.zip!Models/car.fbx` is `Models/car.fbx` inside
 * `original/City.zip`; archives inside archives chain: `original/All.zip!City.zip!car.fbx`.
 */
export interface PackFile {
  ref: string;
  size: number;
  mtimeMs: number;
}

/** Nested archives up to this size are opened to list what's inside; bigger ones are listed as one file. */
const NESTED_MAX = 256 * 1024 * 1024;
const MAX_DEPTH = 3;

/** Split a ref into the file on disk and the chain of names inside archives. */
export function parseRef(ref: string): { file: string; inside: string[] } {
  const parts: string[] = [];
  let rest = ref;
  for (;;) {
    const m = /\.zip!/i.exec(rest);
    if (!m) break;
    parts.push(rest.slice(0, m.index + 4));
    rest = rest.slice(m.index + 5);
  }
  parts.push(rest);
  const [file, ...inside] = parts;
  return { file: file!, inside };
}

/** The path shown to people: the ref without `original/` and with archives shown as folders. */
export function displayPath(ref: string): string {
  return ref.replace(/^original\//, '').replace(/!/g, '/');
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** Every file in a pack's `original/` folder, looking inside zip archives. Problems (a damaged zip) are reported, not thrown. */
export async function listPackFiles(packDir: string): Promise<{ files: PackFile[]; problems: string[] }> {
  const files: PackFile[] = [];
  const problems: string[] = [];

  const expand = async (ref: string, source: string | Buffer, depth: number) => {
    let entries;
    try {
      entries = await listZip(source);
    } catch (e) {
      problems.push(`${displayPath(ref)}: can't be opened as a zip (${e instanceof Error ? e.message : String(e)})`);
      return;
    }
    for (const entry of entries) {
      const inner = `${ref}!${entry.name}`;
      if (isIgnored(entry.name)) continue;
      files.push({ ref: inner, size: entry.size, mtimeMs: entry.mtimeMs });
      if (isZip(entry.name) && depth < MAX_DEPTH && entry.size <= NESTED_MAX) {
        try {
          await expand(inner, await readZipEntry(source, entry.name, NESTED_MAX), depth + 1);
        } catch (e) {
          problems.push(`${displayPath(inner)}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  };

  for (const abs of await walk(join(packDir, PACK_DIRS.original))) {
    const ref = relative(packDir, abs).split(sep).join('/');
    if (isIgnored(ref)) continue;
    const s = await stat(abs);
    files.push({ ref, size: s.size, mtimeMs: s.mtimeMs });
    if (isZip(ref)) await expand(ref, abs, 1);
  }
  return { files, problems };
}

/** Read a file of a pack into memory, opening archives along its ref. */
export async function readPackFile(packDir: string, ref: string, maxBytes?: number): Promise<Buffer> {
  const { file, inside } = parseRef(ref);
  if (file.split('/').includes('..')) throw new Error('invalid path');
  let source: string | Buffer = join(packDir, ...file.split('/'));
  if (!inside.length) return readFile(source);
  for (let i = 0; i < inside.length; i++) {
    const last = i === inside.length - 1;
    source = await readZipEntry(source, inside[i]!, last ? maxBytes : NESTED_MAX);
  }
  return source as Buffer;
}
