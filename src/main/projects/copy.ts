import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { licenseInfo } from '@shared/licenses';
import { licenseForPath, type PackMeta } from '@shared/pack';
import { assetPath, baseName } from '@shared/assets';
import type { ClashChoice, CopyPlan, Manifest, ManifestEntry, Project } from '@shared/project';
import type { AssetRow } from '@shared/query';
import { UserError } from '../errors';
import { sourceInfo } from '@shared/sources';
import { readJson, writeFileAtomic, writeJson } from '../fsx';
import { displayPath, parseRef, readPackFile } from '../index/files';
import { sha256OfFile, sha256OfRef } from '../index/hashes';
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
  /** What a file of a pack contains, if the library has already read it. */
  hashOf(packId: string, ref: string): string | null;
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
    // The license covering this very file: a bundle can hold parts with terms of their own.
    const license = licenseForPath(m, assetPath(item.ref));
    const part = license !== m.license ? ` (the part of it this asset is in)` : '';
    const info = licenseInfo(license.id);
    if (!license.id) warnings.add(`“${m.name}”${part} has no license recorded.`);
    else if (info && !info.commercial) warnings.add(`“${m.name}”${part} is ${info.short}: not allowed in commercial games.`);
    if (info?.attribution && !license.attribution) warnings.add(`“${m.name}”${part} needs a credit line and has none yet; the credits file will use its name and creator.`);
    if (m.status === 'inbox') warnings.add(`“${m.name}” is still in the Inbox.`);
    jobs.push({
      entry: {
        libraryId: src.libraryId,
        libraryName: src.libraryName,
        packId: item.packId,
        packName: m.name,
        ref: item.ref,
        copiedRef: chosen.ref,
        license: license.id,
        attribution: license.attribution,
        creator: m.source.creator,
        sourceUrl: m.source.url ?? sourceInfo(m.source.site)?.url ?? null,
      },
      files,
    });
  }
  const updating = jobs.filter((j) => manifest.entries.some((e) => same(e, manifest, src.libraryId, j.entry.packId, j.entry.ref))).length;
  const clashes = await clashingFiles(project, jobs, src, manifest);
  const overwriting = [...clashes].filter(([, c]) => !c.identical).map(([dest]) => dest).sort();
  const identical = [...clashes.values()].filter((c) => c.identical).length;
  return {
    plan: {
      assets: jobs.length,
      files: jobs.reduce((n, j) => n + j.files.length, 0),
      bytes: jobs.reduce((n, j) => n + j.files.reduce((s, f) => s + f.size, 0), 0),
      warnings: [...warnings],
      updating,
      overwriting,
      identical,
    },
    jobs,
  };
}

/**
 * Every file already in the game at a path this copy wants that Tessera did not write, and
 * whether what is there is byte for byte what the library holds.
 *
 * A name taken is not by itself a clash. The same pack copied twice, a texture the person pulled
 * in by hand from the same download, a game restored from a backup: all of those leave a file
 * that is exactly what we were about to write, and there is nothing to ask about. So the contents
 * are compared with SHA-256, and only a genuinely different file under the same name is a
 * question for the person.
 *
 * A file at a path this game already records as Tessera's is our own earlier copy, and writing
 * over it is the refresh being asked for, so it is not looked at here. Unless an earlier copy
 * already found somebody else's file at that path: that is recorded, and it stays theirs.
 */
async function clashingFiles(project: Project, jobs: EntryJob[], src: CopySource, manifest: Manifest): Promise<Map<string, { identical: boolean }>> {
  const ours = new Set(manifest.entries.flatMap((e) => e.files));
  const knownTheirs = new Set(manifest.entries.flatMap((e) => e.wereAlreadyThere ?? []));
  const out = new Map<string, { identical: boolean }>();
  for (const job of jobs) {
    for (const f of job.files) {
      if (out.has(f.dest)) continue;
      if (ours.has(f.dest) && !knownTheirs.has(f.dest)) continue;
      const dest = join(project.path, ...f.dest.split('/'));
      if (!existsSync(dest)) continue;
      // Unreadable either side is treated as different: it is the answer that changes nothing
      // without being asked, and the person is still shown the file.
      const theirs = await sha256OfFile(dest).catch(() => '');
      const mine = src.hashOf(f.packId, f.ref) ?? (await sha256OfRef(src.packDir(f.packId), f.ref).catch(() => ''));
      out.set(f.dest, { identical: !!theirs && theirs === mine });
    }
  }
  return out;
}

/** A pack's license, written beside its files in the project. */
function licenseText(meta: PackMeta, proof: string[]): string {
  const info = licenseInfo(meta.license.id);
  const lines = [
    `${meta.name}`,
    '',
    `License: ${info?.name ?? meta.license.id ?? 'not recorded'}${info?.url ? `: ${info.url}` : ''}`,
    meta.source.creator ? `Creator: ${meta.source.creator}` : null,
    meta.source.url ? `Source: ${meta.source.url}` : null,
    meta.license.attribution ? `Credit: ${meta.license.attribution}` : null,
  ];
  // Parts of the pack that came under their own terms are spelled out, not summarized away.
  for (const rule of meta.licenses ?? []) {
    const part = licenseInfo(rule.license.id);
    lines.push('', `${rule.path}: ${part?.name ?? rule.license.id ?? 'not recorded'}${part?.url ? `: ${part.url}` : ''}`, rule.license.attribution ? `Credit: ${rule.license.attribution}` : null);
  }
  lines.push(
    '',
    proof.length ? `The pack's own license files are in license/ beside this one: ${proof.join(', ')}.` : 'The pack shipped no license file of its own.',
    'Copied from a Tessera library. This folder holds everything needed to show what these files are licensed under,',
    'so it stands on its own if the pack ever leaves the library.',
  );
  return `${lines.filter((l) => l !== null).join('\n')}\n`;
}

/** A license, readme or terms file, wherever it sits in the pack. */
const LICENSE_FILE = /^(licen[cs]e|copying|eula|terms|notice)/i;
const PROOF_MAX = 512 * 1024;

/**
 * The pack's license papers, copied into the game beside the assets: what Tessera keeps as proof
 * (receipts, screenshots, license texts) and the pack's own license files, archives included. A
 * game that holds these does not depend on the library still having the pack.
 */
async function copyProof(packDir: string, refs: string[], destDir: string): Promise<string[]> {
  const kept: string[] = [];
  const name = (wanted: string) => {
    let out = wanted;
    for (let i = 2; kept.includes(out); i++) out = wanted.replace(/(\.[^.]*)?$/, ` (${i})$1`);
    return out;
  };
  const from = join(packDir, PACK_DIRS.license);
  for (const e of (await readdir(from, { withFileTypes: true }).catch(() => [])).filter((x) => x.isFile() && !x.name.startsWith('.'))) {
    const to = name(e.name);
    await mkdir(destDir, { recursive: true });
    await copyFile(join(from, e.name), join(destDir, to));
    kept.push(to);
  }
  for (const ref of refs.filter((r) => LICENSE_FILE.test(baseName(assetPath(r)))).slice(0, 20)) {
    try {
      const data = await readPackFile(packDir, ref, PROOF_MAX);
      const to = name(baseName(assetPath(ref)));
      await mkdir(destDir, { recursive: true });
      await writeFile(join(destDir, to), data);
      kept.push(to);
    } catch {
      // unreadable: the summary beside it still records the license
    }
  }
  return kept;
}

/**
 * Write a pack's license, its own license files included, into the game that uses it. Returns
 * false when the library no longer has the pack to read from.
 */
export async function writePackLicense(project: Project, packId: string, src: CopySource): Promise<boolean> {
  const pack = src.pack(packId);
  if (!pack) return false;
  const packRoot = join(project.path, ...posix.join(project.target, safeFolderName(pack.folder)).split('/'));
  const proof = await copyProof(src.packDir(packId), src.packRefs(packId), join(packRoot, 'license'));
  await writeFileAtomic(join(packRoot, 'LICENSE.txt'), licenseText(pack.meta, proof));
  return true;
}

/**
 * A name the game is not already using: "wood.png" becomes "wood (2).png". Null when there is no
 * free name to be had, which is answered by leaving the game's file alone rather than by writing
 * over the very file this was meant to protect.
 */
function freeDest(projectPath: string, dest: string, taken: Set<string>): string | null {
  for (let i = 2; i < 1000; i++) {
    const next = dest.replace(/(\.[^./]*)?$/, ` (${i})$1`);
    if (!taken.has(next) && !existsSync(join(projectPath, ...next.split('/')))) return next;
  }
  return null;
}

export async function runCopy(
  project: Project,
  jobs: EntryJob[],
  src: CopySource,
  onProgress: (done: number, total: number) => void,
  /** What to do where the game has a different file under a name this copy wants. */
  onClash: ClashChoice = 'skip',
): Promise<ManifestEntry[]> {
  const manifest = await readManifest(project.path, src.libraryId);
  const total = jobs.reduce((n, j) => n + j.files.length, 0);
  let done = 0;
  const written: ManifestEntry[] = [];
  const licensesWritten = new Set<string>();
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
  // Which of the paths this run wants already hold somebody else's file, and whether that file is
  // byte for byte what we were about to write. Worked out once, before anything moves.
  const clashes = await clashingFiles(project, jobs, src, manifest);
  // Names this run has already given out, so two renamed files never land on each other.
  const taken = new Set<string>();
  try {
    for (const job of jobs) {
      const packDir = src.packDir(job.entry.packId);
      const clashed: string[] = [];
      const renamed: { wanted: string; written: string }[] = [];
      /** Where each file of this asset actually ended up. */
      const landed: string[] = [];
      for (const f of job.files) {
        const clash = clashes.get(f.dest);
        let put = f.dest;
        if (clash) {
          // The same bytes under the same name is not a clash at all: the copy would write back
          // what is already there, so it writes nothing and leaves the file alone. It is still
          // recorded as the game's own, because Tessera did not put it there and must never take
          // it away.
          if (clash.identical || onClash === 'skip') {
            clashed.push(f.dest);
            landed.push(f.dest);
            ours.add(f.dest);
            onProgress(++done, total);
            continue;
          }
          if (onClash === 'rename') {
            // Their file stays where it is, untouched and unrecorded, and ours comes in beside it
            // under a free name. A model's relative path to a texture renamed this way no longer
            // points at ours, which is the cost of keeping both.
            const beside = freeDest(project.path, f.dest, taken);
            if (!beside) {
              clashed.push(f.dest);
              landed.push(f.dest);
              ours.add(f.dest);
              onProgress(++done, total);
              continue;
            }
            put = beside;
            taken.add(put);
            renamed.push({ wanted: f.dest, written: put });
          }
          // 'overwrite': their file is written over, because that is what was asked for.
        }
        const dest = join(project.path, ...put.split('/'));
        made.push(dirname(dest));
        await mkdir(dirname(dest), { recursive: true });
        if (!existsSync(dest)) fresh.push(dest);
        // Ours from here on, so a texture two assets share is not mistaken for somebody else's
        // work the second time it is written in this same run.
        ours.add(put);
        landed.push(put);
        const { file, inside } = parseRef(f.ref);
        if (inside.length) await writeFile(dest, await readPackFile(packDir, f.ref));
        else await copyFile(join(packDir, ...file.split('/')), dest);
        onProgress(++done, total);
      }
      const pack = src.pack(job.entry.packId);
      const packRoot = pack ? posix.join(project.target, safeFolderName(pack.folder)) : '';
      if (pack && !licensesWritten.has(packRoot)) {
        licensesWritten.add(packRoot);
        const proof = await copyProof(packDir, src.packRefs(job.entry.packId), join(project.path, ...packRoot.split('/'), 'license'));
        const license = join(project.path, ...packRoot.split('/'), 'LICENSE.txt');
        made.push(dirname(license));
        if (!existsSync(license)) fresh.push(license);
        await writeFileAtomic(license, licenseText(pack.meta, proof));
      }
      const entry: ManifestEntry = {
        ...job.entry,
        files: landed,
        copiedAt: new Date().toISOString(),
        ...(clashed.length ? { wereAlreadyThere: clashed } : {}),
        ...(renamed.length ? { renamed } : {}),
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
  // Remove folders left empty, deepest first. A pack's license papers go with its last asset:
  // they are the proof for files that are no longer there.
  const targetRoot = join(project.path, ...project.target.split('/'));
  // Games written before the spelling was settled hold LICENSE.txt and a license/ folder; both
  // spellings count as the pack's papers rather than as something the person put there.
  const notes = (n: string) =>
    n === 'LICENSE.txt' || n === 'LICENSE.txt.meta' || n === 'license' || n === 'license.meta' ||
    n === 'LICENCE.txt' || n === 'LICENCE.txt.meta' || n === 'licence' || n === 'licence.meta' ||
    n === '.DS_Store';
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
