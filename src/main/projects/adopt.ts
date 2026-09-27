/**
 * Assets a game already has.
 *
 * Somebody who has been making games for years does not start with an empty project. Their
 * `Assets/Art` is full, their scenes point at those paths, and their GUIDs are already assigned.
 * Copying the same assets in again from the library would give them a second copy at a new path
 * that nothing references, and leave the originals as unlicensed as they were.
 *
 * So: recognise what is there, and record it. Not a byte moves, no path changes, and the credits
 * file then covers what the game actually ships.
 *
 * Matching is by content, never by name alone. A file called `tree.glb` is not evidence of
 * anything; the same bytes are. That means an asset somebody re-exported or edited will not be
 * recognised, which is correct: it is no longer the asset the licence was recorded against.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { isIgnored } from '@shared/assets';
import type { AssetRow } from '@shared/query';
import type { ManifestEntry, Project } from '@shared/project';
import { readPackFile } from '../index/files';
import type { CopySource } from './copy';

/** Files smaller than this are matched whole; nothing is read twice. */
const MAX_HASH = 512 * 1024 * 1024;

export interface AdoptMatch {
  packId: string;
  packName: string;
  /** The asset in the library, by the ref that stands for it. */
  ref: string;
  /** The matching file in the game, relative to its root, with forward slashes. */
  path: string;
  size: number;
}

export interface AdoptScan {
  matches: AdoptMatch[];
  /** Files looked at, so "nothing matched" can be told apart from "nothing was there". */
  looked: number;
  /** Packs the matches belong to, for saying "3 packs found" rather than listing 900 files. */
  packs: { id: string; name: string; files: number }[];
}

async function hashFile(path: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const h = createHash('sha1');
    const s = createReadStream(path);
    s.on('data', (c) => h.update(c));
    s.on('error', reject);
    s.on('end', () => resolve(h.digest('hex')));
  });
}

const hashBuffer = (b: Buffer) => createHash('sha1').update(b).digest('hex');

async function walk(dir: string, out: string[], limit: number): Promise<void> {
  if (out.length >= limit) return;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (isIgnored(e.name) || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out, limit);
    else if (e.isFile()) {
      out.push(p);
      if (out.length >= limit) return;
    }
  }
}

export interface AdoptDeps {
  /** Library assets of exactly this size, whatever pack they are in. */
  bySize: (size: number) => (AssetRow & { packName: string })[];
  src: CopySource;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Look through a folder of the game for assets the library knows.
 *
 * Size first, because it costs nothing and throws away almost everything. Only files whose size
 * matches something in the library are opened, and then both sides are hashed. A file inside an
 * archive in the library is read out of it, so a pack that arrived as a zip still matches.
 */
export async function scanForAdoption(projectPath: string, folder: string, d: AdoptDeps, limit = 20_000): Promise<AdoptScan> {
  const files: string[] = [];
  await walk(join(projectPath, ...folder.split('/')), files, limit);
  const matches: AdoptMatch[] = [];
  const seen = new Set<string>();
  const hashes = new Map<string, string>();

  for (const [i, path] of files.entries()) {
    d.onProgress?.(i, files.length);
    const s = await stat(path).catch(() => null);
    if (!s || s.size === 0 || s.size > MAX_HASH) continue;
    const candidates = d.bySize(s.size);
    if (!candidates.length) continue;

    const theirs = await hashFile(path).catch(() => null);
    if (!theirs) continue;
    for (const c of candidates) {
      const key = `${c.packId}|${c.ref}`;
      // One library asset stands for one file in the game. Two copies of the same asset in a
      // project is their business, and recording the first is enough for the credits.
      if (seen.has(key)) continue;
      let ours = hashes.get(key);
      if (ours === undefined) {
        const buf = await readPackFile(d.src.packDir(c.packId), c.ref, MAX_HASH).catch(() => null);
        ours = buf ? hashBuffer(buf) : '';
        hashes.set(key, ours);
      }
      if (!ours || ours !== theirs) continue;
      seen.add(key);
      matches.push({
        packId: c.packId,
        packName: c.packName,
        ref: c.ref,
        path: relative(projectPath, path).split(sep).join('/'),
        size: s.size,
      });
      break;
    }
  }
  d.onProgress?.(files.length, files.length);

  const packs = new Map<string, { id: string; name: string; files: number }>();
  for (const m of matches) {
    const p = packs.get(m.packId) ?? { id: m.packId, name: m.packName, files: 0 };
    p.files++;
    packs.set(m.packId, p);
  }
  return { matches, looked: files.length, packs: [...packs.values()].sort((a, b) => b.files - a.files) };
}

/**
 * Write what was found into the game's manifest, pointing at the paths the game already uses.
 *
 * An asset already recorded from a copy is left alone: that entry knows files Tessera wrote and
 * can take them away again, and replacing it with one pointing at the person's own files would
 * make a later "remove from game" delete something Tessera never put there.
 */
export function adoptEntries(project: Project, matches: AdoptMatch[], src: CopySource, existing: ManifestEntry[]): ManifestEntry[] {
  const already = new Set(existing.map((e) => `${e.packId}|${e.ref}`));
  const now = new Date().toISOString();
  const out: ManifestEntry[] = [];
  for (const m of matches) {
    if (already.has(`${m.packId}|${m.ref}`)) continue;
    const pack = src.pack(m.packId);
    if (!pack) continue;
    out.push({
      libraryId: src.libraryId,
      libraryName: src.libraryName,
      packId: m.packId,
      packName: pack.meta.name,
      ref: m.ref,
      copiedRef: m.ref,
      files: [posix.normalize(m.path)],
      licence: pack.meta.licence.id,
      attribution: pack.meta.licence.attribution,
      creator: pack.meta.source.creator,
      sourceUrl: pack.meta.source.url,
      copiedAt: now,
      // The one field that matters later: these files were here first, so removing this from the
      // game must forget the entry and never delete them.
      adopted: true,
    });
  }
  void project;
  return out;
}
