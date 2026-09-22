import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { licenceInfo } from '@shared/licences';
import type { PackMeta } from '@shared/pack';
import type { CopyPlan, Manifest, ManifestEntry, Project } from '@shared/project';
import type { AssetRow } from '@shared/query';
import { sourceInfo } from '@shared/sources';
import { readJson, writeFileAtomic, writeJson } from '../fsx';
import { displayPath, parseRef, readPackFile } from '../index/files';
import { safeFolderName } from '../library/names';
import { writeCredits } from './credits';
import { dependencies } from './deps';
import { imagePreference, modelPreference } from './engines';

export const MANIFEST = '.tessera/manifest.json';

/** What copying needs to know about the library. */
export interface CopySource {
  libraryId: string;
  libraryName: string;
  packDir(packId: string): string;
  pack(packId: string): { meta: PackMeta; folder: string } | null;
  /** Every file of an asset: the one that stands for it and its other formats. */
  variants(packId: string, ref: string): AssetRow[];
  packRefs(packId: string): string[];
}

interface FileJob {
  packId: string;
  ref: string;
  /** Destination relative to the project root, with forward slashes. */
  dest: string;
  size: number;
}

interface EntryJob {
  entry: Omit<ManifestEntry, 'files' | 'copiedAt'>;
  files: FileJob[];
}

/** The library an entry came from. */
export const entryLibrary = (e: ManifestEntry, m: Manifest) => e.libraryId ?? m.libraryId;

/** Whether an entry is this asset from this library. */
const same = (e: ManifestEntry, m: Manifest, libraryId: string, packId: string, ref: string) => e.packId === packId && e.ref === ref && entryLibrary(e, m) === libraryId;

export async function readManifest(projectPath: string, libraryId: string): Promise<Manifest> {
  const raw = (await readJson(join(projectPath, MANIFEST)).catch(() => null)) as Manifest | null;
  return raw?.format === 1 && Array.isArray(raw.entries) ? raw : { format: 1, libraryId, entries: [] };
}

/** The variant an engine takes best. */
function pick(variants: AssetRow[], project: Project, gltf: boolean): AssetRow {
  const lead = variants[0]!;
  const order = lead.kind === 'model' ? modelPreference(project.engine, gltf) : lead.kind === 'image' ? imagePreference(project.engine) : [];
  const rank = (v: AssetRow) => {
    const i = order.indexOf(v.ext);
    return i < 0 ? order.length : i;
  };
  return [...variants].sort((a, b) => rank(a) - rank(b))[0] ?? lead;
}

/** Folder names safe on every OS, path by path. */
const safePath = (p: string) => p.split('/').map((s) => safeFolderName(s)).join('/');

/** How many leading folders every asset of a pack shares ("City.zip/City Kit/"): they're left out in projects. */
export function sharedDepth(refs: string[]): number {
  // Readmes and the archives themselves sit above the assets; they don't count.
  const dirs = refs.filter((r) => !/\.(txt|md|url|html?|pdf|zip|7z|rar)$/i.test(r)).map((r) => displayPath(r).split('/').slice(0, -1));
  if (!dirs.length) return 0;
  let common = 0;
  while (dirs.every((d) => d.length > common && d[common] === dirs[0]![common])) common++;
  return common;
}

/**
 * Where each file goes: `<target>/<pack>/` and then its folders within the pack, minus the ones
 * every file shares. Everything copied from one pack keeps one layout, so a model's
 * "../Textures/wood.png" still points at its texture and two copies never collide.
 */
function layout(project: Project, packFolder: string, refs: string[], depth: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of refs) out.set(r, posix.join(project.target, safeFolderName(packFolder), safePath(displayPath(r).split('/').slice(depth).join('/'))));
  return out;
}

export async function planCopy(
  project: Project,
  items: { packId: string; ref: string }[],
  src: CopySource,
  gltf: boolean,
): Promise<{ plan: CopyPlan; jobs: EntryJob[] }> {
  const manifest = await readManifest(project.path, src.libraryId);
  const jobs: EntryJob[] = [];
  const warnings = new Set<string>();
  const refsCache = new Map<string, { refs: string[]; depth: number }>();
  for (const item of items) {
    const pack = src.pack(item.packId);
    if (!pack) continue;
    const variants = src.variants(item.packId, item.ref);
    if (!variants.length) continue;
    const chosen = pick(variants, project, gltf);
    let known = refsCache.get(item.packId);
    if (!known) {
      const refs = src.packRefs(item.packId);
      known = { refs, depth: sharedDepth(refs) };
      refsCache.set(item.packId, known);
    }
    const deps = chosen.kind === 'model' ? await dependencies(src.packDir(item.packId), known.refs, chosen.ref).catch(() => []) : [];
    const placed = layout(project, pack.folder, [chosen.ref, ...deps], known.depth);
    const sizes = new Map(variants.map((v) => [v.ref, v.size]));
    const files: FileJob[] = [...placed].map(([ref, dest]) => ({ packId: item.packId, ref, dest, size: sizes.get(ref) ?? 0 }));
    const m = pack.meta;
    const info = licenceInfo(m.licence.id);
    if (!m.licence.id) warnings.add(`“${m.name}” has no licence recorded.`);
    else if (info && !info.commercial) warnings.add(`“${m.name}” is ${info.short}: not allowed in commercial games.`);
    if (info?.attribution && !m.licence.attribution) warnings.add(`“${m.name}” needs a credit line and has none yet; the credits file will use its name and creator.`);
    if (m.status === 'inbox') warnings.add(`“${m.name}” is still in the Inbox.`);
    jobs.push({
      entry: {
        libraryId: src.libraryId,
        libraryName: src.libraryName,
        packId: item.packId,
        packName: m.name,
        ref: item.ref,
        copiedRef: chosen.ref,
        licence: m.licence.id,
        attribution: m.licence.attribution,
        creator: m.source.creator,
        sourceUrl: m.source.url ?? sourceInfo(m.source.site)?.url ?? null,
      },
      files,
    });
  }
  const updating = jobs.filter((j) => manifest.entries.some((e) => same(e, manifest, src.libraryId, j.entry.packId, j.entry.ref))).length;
  return {
    plan: {
      assets: jobs.length,
      files: jobs.reduce((n, j) => n + j.files.length, 0),
      bytes: jobs.reduce((n, j) => n + j.files.reduce((s, f) => s + f.size, 0), 0),
      warnings: [...warnings],
      updating,
    },
    jobs,
  };
}

/** A pack's licence, written beside its files in the project. */
function licenceText(meta: PackMeta): string {
  const info = licenceInfo(meta.licence.id);
  const lines = [
    `${meta.name}`,
    '',
    `Licence: ${info?.name ?? meta.licence.id ?? 'not recorded'}${info?.url ? ` — ${info.url}` : ''}`,
    meta.source.creator ? `Creator: ${meta.source.creator}` : null,
    meta.source.url ? `Source: ${meta.source.url}` : null,
    meta.licence.attribution ? `Credit: ${meta.licence.attribution}` : null,
    '',
    'Copied from a Tessera library. The original licence files are kept with the pack in the library.',
  ];
  return `${lines.filter((l) => l !== null).join('\n')}\n`;
}

export async function runCopy(project: Project, jobs: EntryJob[], src: CopySource, onProgress: (done: number, total: number) => void): Promise<ManifestEntry[]> {
  const manifest = await readManifest(project.path, src.libraryId);
  const total = jobs.reduce((n, j) => n + j.files.length, 0);
  let done = 0;
  const written: ManifestEntry[] = [];
  const licencesWritten = new Set<string>();
  for (const job of jobs) {
    const packDir = src.packDir(job.entry.packId);
    for (const f of job.files) {
      const dest = join(project.path, ...f.dest.split('/'));
      await mkdir(dirname(dest), { recursive: true });
      const { file, inside } = parseRef(f.ref);
      if (inside.length) await writeFile(dest, await readPackFile(packDir, f.ref));
      else await copyFile(join(packDir, ...file.split('/')), dest);
      onProgress(++done, total);
    }
    const pack = src.pack(job.entry.packId);
    const packRoot = pack ? posix.join(project.target, safeFolderName(pack.folder)) : '';
    if (pack && !licencesWritten.has(packRoot)) {
      licencesWritten.add(packRoot);
      await writeFileAtomic(join(project.path, ...packRoot.split('/'), 'LICENCE.txt'), licenceText(pack.meta));
    }
    const entry: ManifestEntry = { ...job.entry, files: job.files.map((f) => f.dest), copiedAt: new Date().toISOString() };
    manifest.entries = manifest.entries.filter((e) => !same(e, manifest, src.libraryId, entry.packId, entry.ref));
    manifest.entries.push(entry);
    written.push(entry);
  }
  await writeJson(join(project.path, MANIFEST), manifest);
  if (project.creditsFile) await writeCredits(join(project.path, ...project.creditsFile.split('/')), manifest.entries);
  return written;
}

/** Remove assets from a project: their files (if still there), their entries, then empty folders. */
export async function removeFromProject(project: Project, libraryId: string, items: { packId: string; ref: string; libraryId?: string }[]): Promise<number> {
  const manifest = await readManifest(project.path, libraryId);
  const going = manifest.entries.filter((e) => items.some((i) => same(e, manifest, i.libraryId ?? libraryId, i.packId, i.ref)));
  const keep = manifest.entries.filter((e) => !going.includes(e));
  // A file another remaining entry also uses (a shared texture) stays.
  const stillUsed = new Set(keep.flatMap((e) => e.files));
  const dirs = new Set<string>();
  for (const e of going) {
    for (const f of e.files) {
      if (stillUsed.has(f)) continue;
      const p = join(project.path, ...f.split('/'));
      await unlink(p).catch(() => undefined);
      // Engines leave their own sidecars (Unity .meta, Godot .import) beside the file.
      await unlink(`${p}.meta`).catch(() => undefined);
      await unlink(`${p}.import`).catch(() => undefined);
      dirs.add(dirname(p));
    }
  }
  manifest.entries = keep;
  await writeJson(join(project.path, MANIFEST), manifest);
  // Remove folders left empty (apart from a licence note nobody else needs), deepest first.
  const targetRoot = join(project.path, ...project.target.split('/'));
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    let dir = d;
    while (dir.startsWith(targetRoot) && dir !== targetRoot) {
      const left = await readdir(dir).catch(() => null);
      if (!left) break;
      const onlyNotes = left.every((n) => n === 'LICENCE.txt' || n === 'LICENCE.txt.meta' || n === '.DS_Store');
      const packStillUsed = keep.some((e) => e.files.some((f) => join(project.path, ...f.split('/')).startsWith(dir + (dir.endsWith('/') ? '' : '/'))));
      if (left.length && !(onlyNotes && !packStillUsed)) break;
      for (const n of left) await unlink(join(dir, n)).catch(() => undefined);
      await rmdir(dir).catch(() => undefined);
      await unlink(`${dir}.meta`).catch(() => undefined);
      dir = dirname(dir);
    }
  }
  if (project.creditsFile) await writeCredits(join(project.path, ...project.creditsFile.split('/')), keep);
  return going.length;
}

/** The files of an entry that are missing from the project (deleted by hand, say). */
export async function missingFiles(project: Project, entry: ManifestEntry): Promise<string[]> {
  const out: string[] = [];
  for (const f of entry.files) if (!existsSync(join(project.path, ...f.split('/')))) out.push(f);
  return out;
}
