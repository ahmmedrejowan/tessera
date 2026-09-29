import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { licenceInfo } from '@shared/licences';
import { licenceForPath, type PackMeta } from '@shared/pack';
import { assetPath, baseName } from '@shared/assets';
import type { CopyPlan, Manifest, ManifestEntry, Project } from '@shared/project';
import type { AssetRow } from '@shared/query';
import { UserError } from '../errors';
import { sourceInfo } from '@shared/sources';
import { readJson, writeFileAtomic, writeJson } from '../fsx';
import { displayPath, parseRef, readPackFile } from '../index/files';
import { PACK_DIRS } from '../library/layout';
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

/**
 * Thrown when a game has a record file that cannot be read. Never silently ignored: this file is
 * the only record of which pack every asset in the game came from, and so of which credits the
 * game owes. Treating an unreadable one as empty loses that, and the next copy saves the loss.
 */
export class ManifestUnreadableError extends UserError {
  constructor(public readonly path: string, cause: unknown) {
    // A UserError, because this is something the person can fix and should be told how to. As a
    // plain Error it came out as "Something went wrong", and filed an error report every time
    // anything listed the games.
    super(
      'manifest-unreadable',
      `This game's record of what it took (${MANIFEST}) can't be read, so Tessera has stopped rather than write over it. It is usually a merge conflict. Fix it, or move it aside and use "Find assets already here" to build it again. (${cause instanceof Error ? cause.message : String(cause)})`,
    );
    this.name = 'ManifestUnreadableError';
  }
}

/**
 * Read a manifest for something that only wants to look.
 *
 * Reading refuses on a damaged file, which is right when about to write over it and wrong when
 * listing games: one game with a merge conflict in it emptied the whole Projects page, stopped
 * every other game being linked to, and made "what uses this pack?" answer nothing for all of
 * them. A reader gets an empty manifest and a note that this one is damaged.
 */
export async function readManifestIfReadable(projectPath: string, libraryId: string): Promise<{ manifest: Manifest; damaged: boolean }> {
  try {
    return { manifest: await readManifest(projectPath, libraryId), damaged: false };
  } catch (e) {
    if (!(e instanceof ManifestUnreadableError)) throw e;
    return { manifest: { format: 1, libraryId, entries: [] }, damaged: true };
  }
}

export async function readManifest(projectPath: string, libraryId: string): Promise<Manifest> {
  const path = join(projectPath, MANIFEST);
  // A file that isn't there is a game that has taken nothing yet, which is ordinary. A file that
  // is there and cannot be parsed is damage, and carrying on would turn it into lost credits.
  if (!existsSync(path)) return { format: 1, libraryId, entries: [] };
  let raw: Manifest | null;
  try {
    raw = (await readJson(path)) as Manifest | null;
  } catch (e) {
    throw new ManifestUnreadableError(path, e);
  }
  if (raw?.format === 1 && Array.isArray(raw.entries)) return raw;
  throw new ManifestUnreadableError(path, new Error('it is not in a shape Tessera wrote'));
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
    // The licence covering this very file: a bundle can hold parts with terms of their own.
    const licence = licenceForPath(m, assetPath(item.ref));
    const part = licence !== m.licence ? ` (the part of it this asset is in)` : '';
    const info = licenceInfo(licence.id);
    if (!licence.id) warnings.add(`“${m.name}”${part} has no licence recorded.`);
    else if (info && !info.commercial) warnings.add(`“${m.name}”${part} is ${info.short}: not allowed in commercial games.`);
    if (info?.attribution && !licence.attribution) warnings.add(`“${m.name}”${part} needs a credit line and has none yet; the credits file will use its name and creator.`);
    if (m.status === 'inbox') warnings.add(`“${m.name}” is still in the Inbox.`);
    jobs.push({
      entry: {
        libraryId: src.libraryId,
        libraryName: src.libraryName,
        packId: item.packId,
        packName: m.name,
        ref: item.ref,
        copiedRef: chosen.ref,
        licence: licence.id,
        attribution: licence.attribution,
        creator: m.source.creator,
        sourceUrl: m.source.url ?? sourceInfo(m.source.site)?.url ?? null,
      },
      files,
    });
  }
  const updating = jobs.filter((j) => manifest.entries.some((e) => same(e, manifest, src.libraryId, j.entry.packId, j.entry.ref))).length;
  // A file at a path this game already records as Tessera's is our own earlier copy, and writing
  // over it is the refresh being asked for. Anything else at one of these paths belongs to
  // somebody else, and is worth saying out loud before a single byte moves.
  const ours = new Set(manifest.entries.flatMap((e) => e.files));
  const overwriting = [...new Set(jobs.flatMap((j) => j.files.map((f) => f.dest)))]
    .filter((dest) => !ours.has(dest) && existsSync(join(project.path, ...dest.split('/'))))
    .sort();
  return {
    plan: {
      assets: jobs.length,
      files: jobs.reduce((n, j) => n + j.files.length, 0),
      bytes: jobs.reduce((n, j) => n + j.files.reduce((s, f) => s + f.size, 0), 0),
      warnings: [...warnings],
      updating,
      overwriting,
    },
    jobs,
  };
}

/** A pack's licence, written beside its files in the project. */
function licenceText(meta: PackMeta, proof: string[]): string {
  const info = licenceInfo(meta.licence.id);
  const lines = [
    `${meta.name}`,
    '',
    `Licence: ${info?.name ?? meta.licence.id ?? 'not recorded'}${info?.url ? `: ${info.url}` : ''}`,
    meta.source.creator ? `Creator: ${meta.source.creator}` : null,
    meta.source.url ? `Source: ${meta.source.url}` : null,
    meta.licence.attribution ? `Credit: ${meta.licence.attribution}` : null,
  ];
  // Parts of the pack that came under their own terms are spelled out, not summarised away.
  for (const rule of meta.licences ?? []) {
    const part = licenceInfo(rule.licence.id);
    lines.push('', `${rule.path}: ${part?.name ?? rule.licence.id ?? 'not recorded'}${part?.url ? `: ${part.url}` : ''}`, rule.licence.attribution ? `Credit: ${rule.licence.attribution}` : null);
  }
  lines.push(
    '',
    proof.length ? `The pack's own licence files are in licence/ beside this one: ${proof.join(', ')}.` : 'The pack shipped no licence file of its own.',
    'Copied from a Tessera library. This folder holds everything needed to show what these files are licensed under,',
    'so it stands on its own if the pack ever leaves the library.',
  );
  return `${lines.filter((l) => l !== null).join('\n')}\n`;
}

/** A licence, readme or terms file, wherever it sits in the pack. */
const LICENCE_FILE = /^(licen[cs]e|copying|eula|terms|notice)/i;
const PROOF_MAX = 512 * 1024;

/**
 * The pack's licence papers, copied into the game beside the assets: what Tessera keeps as proof
 * (receipts, screenshots, licence texts) and the pack's own licence files, archives included. A
 * game that holds these does not depend on the library still having the pack.
 */
async function copyProof(packDir: string, refs: string[], destDir: string): Promise<string[]> {
  const kept: string[] = [];
  const name = (wanted: string) => {
    let out = wanted;
    for (let i = 2; kept.includes(out); i++) out = wanted.replace(/(\.[^.]*)?$/, ` (${i})$1`);
    return out;
  };
  const from = join(packDir, PACK_DIRS.licence);
  for (const e of (await readdir(from, { withFileTypes: true }).catch(() => [])).filter((x) => x.isFile() && !x.name.startsWith('.'))) {
    const to = name(e.name);
    await mkdir(destDir, { recursive: true });
    await copyFile(join(from, e.name), join(destDir, to));
    kept.push(to);
  }
  for (const ref of refs.filter((r) => LICENCE_FILE.test(baseName(assetPath(r)))).slice(0, 20)) {
    try {
      const data = await readPackFile(packDir, ref, PROOF_MAX);
      const to = name(baseName(assetPath(ref)));
      await mkdir(destDir, { recursive: true });
      await writeFile(join(destDir, to), data);
      kept.push(to);
    } catch {
      // unreadable: the summary beside it still records the licence
    }
  }
  return kept;
}

/**
 * Write a pack's licence, its own licence files included, into the game that uses it. Returns
 * false when the library no longer has the pack to read from.
 */
export async function writePackLicence(project: Project, packId: string, src: CopySource): Promise<boolean> {
  const pack = src.pack(packId);
  if (!pack) return false;
  const packRoot = join(project.path, ...posix.join(project.target, safeFolderName(pack.folder)).split('/'));
  const proof = await copyProof(src.packDir(packId), src.packRefs(packId), join(packRoot, 'licence'));
  await writeFileAtomic(join(packRoot, 'LICENCE.txt'), licenceText(pack.meta, proof));
  return true;
}

export async function runCopy(project: Project, jobs: EntryJob[], src: CopySource, onProgress: (done: number, total: number) => void): Promise<ManifestEntry[]> {
  const manifest = await readManifest(project.path, src.libraryId);
  const total = jobs.reduce((n, j) => n + j.files.length, 0);
  let done = 0;
  const written: ManifestEntry[] = [];
  const licencesWritten = new Set<string>();
  // If the disk gives out halfway, whatever this run put there and nothing else goes back, so the
  // game folder is left as it was found rather than holding files no manifest knows about. The
  // folders are tracked apart from the files: the very first file can fail after its folder has
  // been made, and an empty folder left behind is still a trace of a copy that did not happen.
  const fresh: string[] = [];
  const made: string[] = [];
  // Every path this game already records as Tessera's. A file at one of those is our own earlier
  // copy, and writing over it is the refresh the person asked for. A file at any other path is
  // somebody else's work, and we note it so we never delete it later.
  const ours = new Set(manifest.entries.flatMap((e) => e.files));
  // What earlier copies already found was somebody else's. This has to survive a second copy:
  // once a clash is recorded the file is in `ours`, so a re-copy would not notice it again, and
  // the replacement entry would forget it. Copy, copy again, take out, and the person's own file
  // was deleted after all.
  const knownTheirs = new Set(manifest.entries.flatMap((e) => e.wereAlreadyThere ?? []));
  try {
    for (const job of jobs) {
      const packDir = src.packDir(job.entry.packId);
      const clashed: string[] = [];
      for (const f of job.files) {
        const dest = join(project.path, ...f.dest.split('/'));
        made.push(dirname(dest));
        await mkdir(dirname(dest), { recursive: true });
        const there = existsSync(dest);
        // A file we did not write is somebody else's work, and it is left exactly as it is. The
        // asset still comes in; the one file that clashed keeps the version already in the game,
        // and is named in what comes back so nobody has to discover it later. Writing over it and
        // apologising afterwards was the old behaviour and it destroyed people's edits.
        if (there && (!ours.has(f.dest) || knownTheirs.has(f.dest))) {
          clashed.push(f.dest);
          ours.add(f.dest);
          onProgress(++done, total);
          continue;
        }
        if (!there) fresh.push(dest);
        // Ours from here on, so a texture two assets share is not mistaken for somebody else's
        // work the second time it is written in this same run.
        ours.add(f.dest);
        const { file, inside } = parseRef(f.ref);
        if (inside.length) await writeFile(dest, await readPackFile(packDir, f.ref));
        else await copyFile(join(packDir, ...file.split('/')), dest);
        onProgress(++done, total);
      }
      const pack = src.pack(job.entry.packId);
      const packRoot = pack ? posix.join(project.target, safeFolderName(pack.folder)) : '';
      if (pack && !licencesWritten.has(packRoot)) {
        licencesWritten.add(packRoot);
        const proof = await copyProof(packDir, src.packRefs(job.entry.packId), join(project.path, ...packRoot.split('/'), 'licence'));
        const licence = join(project.path, ...packRoot.split('/'), 'LICENCE.txt');
        made.push(dirname(licence));
        if (!existsSync(licence)) fresh.push(licence);
        await writeFileAtomic(licence, licenceText(pack.meta, proof));
      }
      const entry: ManifestEntry = {
        ...job.entry,
        files: job.files.map((f) => f.dest),
        copiedAt: new Date().toISOString(),
        ...(clashed.length ? { wereAlreadyThere: clashed } : {}),
      };
      manifest.entries = manifest.entries.filter((e) => !same(e, manifest, src.libraryId, entry.packId, entry.ref));
      manifest.entries.push(entry);
      written.push(entry);
    }
  } catch (e) {
    for (const path of fresh.reverse()) await unlink(path).catch(() => undefined);
    // And every folder this run made, as far up as the target itself, while they are empty.
    const targetRoot = join(project.path, ...project.target.split('/'));
    for (const start of [...new Set(made)].sort((a, b) => b.length - a.length)) {
      let dir = start;
      while (dir.startsWith(targetRoot) && (await rmdir(dir).then(() => true, () => false))) dir = dirname(dir);
    }
    await rmdir(targetRoot).catch(() => undefined);
    throw e;
  }
  await writeJson(join(project.path, MANIFEST), manifest);
  if (project.creditsFile) await writeCredits(join(project.path, ...project.creditsFile.split('/')), manifest.entries);
  return written;
}

/** Remove assets from a project: their files (if still there), their entries, then empty folders. */
/** Write adopted entries into the manifest. Nothing is copied; this only records. */
export async function writeAdopted(project: Project, libraryId: string, entries: ManifestEntry[]): Promise<number> {
  if (!entries.length) return 0;
  const manifest = await readManifest(project.path, libraryId);
  const already = new Set(manifest.entries.map((e) => `${entryLibrary(e, manifest)}|${e.packId}|${e.ref}`));
  const fresh = entries.filter((e) => !already.has(`${entryLibrary(e, manifest)}|${e.packId}|${e.ref}`));
  if (!fresh.length) return 0;
  manifest.entries.push(...fresh);
  await mkdir(dirname(join(project.path, MANIFEST)), { recursive: true });
  await writeJson(join(project.path, MANIFEST), manifest);
  return fresh.length;
}

export async function removeFromProject(project: Project, libraryId: string, items: { packId: string; ref: string; libraryId?: string }[]): Promise<number> {
  const manifest = await readManifest(project.path, libraryId);
  const going = manifest.entries.filter((e) => items.some((i) => same(e, manifest, i.libraryId ?? libraryId, i.packId, i.ref)));
  const keep = manifest.entries.filter((e) => !going.includes(e));
  // A file another remaining entry also uses (a shared texture) stays.
  const stillUsed = new Set(keep.flatMap((e) => e.files));
  // Files somebody else put there, according to every entry in the manifest. A file is theirs or
  // it is not; which entry happened to notice first does not change that.
  const theirs = new Set(manifest.entries.flatMap((e) => e.wereAlreadyThere ?? []));
  const dirs = new Set<string>();
  for (const e of going) {
    // An adopted entry points at files the game already had. Tessera never wrote them, so it
    // never takes them away: forgetting the record is the whole of the job.
    if (e.adopted) continue;
    // A file that was already there when we copied is somebody else's, however it got there.
    // We wrote over it, which was bad enough; deleting it would be worse.
    for (const f of e.files) {
      // Theirs according to any entry, not only this one. Two assets sharing a texture the person
      // already had recorded it once, on whichever was copied first, so removing the other one
      // deleted it.
      if (stillUsed.has(f) || theirs.has(f)) continue;
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
  // Remove folders left empty, deepest first. A pack's licence papers go with its last asset:
  // they are the proof for files that are no longer there.
  const targetRoot = join(project.path, ...project.target.split('/'));
  const notes = (n: string) => n === 'LICENCE.txt' || n === 'LICENCE.txt.meta' || n === 'licence' || n === 'licence.meta' || n === '.DS_Store';
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    let dir = d;
    while (dir.startsWith(targetRoot) && dir !== targetRoot) {
      const left = await readdir(dir).catch(() => null);
      if (!left) break;
      const onlyNotes = left.every(notes);
      const packStillUsed = keep.some((e) => e.files.some((f) => join(project.path, ...f.split('/')).startsWith(dir + (dir.endsWith('/') ? '' : '/'))));
      if (left.length && !(onlyNotes && !packStillUsed)) break;
      for (const n of left) await rm(join(dir, n), { recursive: true, force: true }).catch(() => undefined);
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
