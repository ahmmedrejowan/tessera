import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { UserError } from '../errors';
import { assetPath, isIgnored } from '@shared/assets';
import { PACK_DIRS } from '../library/layout';
import { isZip, listZip, readZipEntry } from './zip';
import { readCachedEntry } from './zipCache';

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
/**
 * The most files one pack may contribute to the index.
 *
 * Each nested archive was bounded, and the number of them was not, so a pack of a hundred small
 * archives each holding millions of empty entries could put hundreds of millions of rows in front
 * of the main process and take the whole app down with it, on every launch, because listing runs
 * again each time the library is read. A real pack is thousands of files; the largest anybody has
 * is tens of thousands. A quarter of a million is far past honest use and far short of harm.
 */
const MAX_FILES = 250_000;

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
export const displayPath = assetPath;

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/**
 * Every file of a pack, looking inside zip archives. Problems (a damaged zip) are reported, not
 * thrown.
 *
 * `filesRoot` is what refs are relative to and `walkRoot` is what is read. For an ordinary pack
 * they are the pack's folder and its `original/`; for a pack indexed where it lies they are both
 * the folder its owner keeps it in.
 */
export async function listPackFiles(filesRoot: string, walkRoot: string = join(filesRoot, PACK_DIRS.original)): Promise<{ files: PackFile[]; problems: string[] }> {
  const files: PackFile[] = [];
  const problems: string[] = [];

  /** Said once, however many archives went over. */
  let tooMany = false;
  const room = () => {
    if (files.length < MAX_FILES) return true;
    if (!tooMany) {
      tooMany = true;
      problems.push(`this pack holds more than ${MAX_FILES.toLocaleString('en-GB')} files, so the rest were left out of the index. If that is a surprise, something in it is not what it looks like.`);
    }
    return false;
  };

  const expand = async (ref: string, source: string | Buffer, depth: number) => {
    let entries;
    try {
      entries = await listZip(source);
    } catch (e) {
      problems.push(`${displayPath(ref)}: can't be opened as a zip (${e instanceof Error ? e.message : String(e)})`);
      return;
    }
    for (const entry of entries) {
      if (!room()) return;
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

  for (const abs of await walk(walkRoot)) {
    if (!room()) break;
    const ref = relative(filesRoot, abs).split(sep).join('/');
    if (isIgnored(ref)) continue;
    // A file can go between being listed and being asked about: a sync tool's temporary file, an
    // unzip still running, somebody tidying. That is not a reason to give up on the whole pack.
    const s = await stat(abs).catch(() => null);
    if (!s) continue;
    files.push({ ref, size: s.size, mtimeMs: s.mtimeMs });
    if (isZip(ref)) await expand(ref, abs, 1);
  }
  // Two files must never claim the same ref: the index insists they are unique, and the insert
  // that broke that rule took the whole library's indexing down with it. An archive may repeat an
  // entry name, and a loose file called "kit.zip!tree.png" collides with the tree inside kit.zip.
  const byRef = new Map<string, PackFile>();
  for (const f of files) {
    if (byRef.has(f.ref)) {
      problems.push(`${displayPath(f.ref)}: more than one file goes by this name, so only the first is listed.`);
      continue;
    }
    byRef.set(f.ref, f);
  }
  return { files: [...byRef.values()], problems };
}

/**
 * Read a file of a pack into memory, opening archives along its ref. Archives stay open briefly
 * (see zipCache), so reading many files from one pack is cheap.
 */
/**
 * The absolute path of a file inside a pack, or null if it is not inside the pack at all.
 *
 * Checking for a '..' segment is not enough. The segments arrive from a URL, and on Windows a
 * backslash is also a separator: '..%5C..%5C' decodes to '..\..\', survives a check that only
 * splits on '/', and then climbs out of the pack folder when the path is joined. So the answer is
 * worked out and then checked, rather than the input being guessed at.
 */
export function insidePack(packDir: string, file: string): string | null {
  // A ref never has a reason to climb, whether or not the climb stays inside.
  if (file.split(/[/\\]/).includes('..')) return null;
  const root = resolve(packDir);
  const path = resolve(root, ...file.split('/'));
  // And then check the answer, because the segments came from a URL and a Windows path has a
  // second separator that the split above is the only thing standing between us and.
  return path === root || path.startsWith(root + sep) ? path : null;
}

export async function readPackFile(packDir: string, ref: string, maxBytes = 512 * 1024 * 1024): Promise<Buffer> {
  const { file, inside } = parseRef(ref);
  const path = insidePack(packDir, file);
  if (!path) throw new Error('invalid path');
  if (!inside.length) {
    // A loose file is capped the same as one inside an archive: a huge video must not be read
    // whole into memory just because something asked for it.
    const on = await stat(path);
    if (on.size > maxBytes) throw new UserError('file-too-big', `That file is ${Math.round(on.size / 1048576)} MB, too big to read in one go.`);
    return readFile(path);
  }
  // Each archive in the chain is read from the one before it; the outermost from disk. Keys of
  // nested archives carry the outer file's size and time, so a replaced download isn't read stale.
  const s = await stat(path);
  const read = (depth: number): Promise<Buffer> => {
    const key = depth === 0 ? path : [`${path}@${s.size}:${s.mtimeMs}`, ...inside.slice(0, depth)].join('!');
    const source = depth === 0 ? path : () => read(depth - 1);
    return readCachedEntry(key, source, inside[depth]!, depth === inside.length - 1 ? maxBytes : NESTED_MAX);
  };
  return read(inside.length - 1);
}
