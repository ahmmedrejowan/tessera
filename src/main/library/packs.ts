import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PackMeta, type PackEdit } from '@shared/pack';
import { readJson, writeJson } from '../fsx';
import { DIRS, PACK_DIRS, PACK_FILE } from './layout';
import { safeFolderName, uniqueName } from './names';

/** A pack as found on disk. */
export interface PackRecord {
  /** Absolute path of the pack's folder. */
  dir: string;
  /** The folder's name inside `packs/`. */
  folder: string;
  meta: PackMeta;
}

export interface PackProblem {
  folder: string;
  message: string;
}

export async function readPack(dir: string, folder: string): Promise<PackRecord> {
  const raw = await readJson(join(dir, PACK_FILE));
  if (raw === null) throw new Error('pack.json is missing');
  const parsed = PackMeta.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`pack.json is invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  return { dir, folder, meta: parsed.data };
}

/**
 * Every pack in the library. A pack whose record can't be read is reported, not dropped silently,
 * and never stops the others from loading.
 */
export async function listPacks(root: string): Promise<{ packs: PackRecord[]; problems: PackProblem[] }> {
  const packsDir = join(root, DIRS.packs);
  const packs: PackRecord[] = [];
  const problems: PackProblem[] = [];
  const entries = existsSync(packsDir) ? await readdir(packsDir, { withFileTypes: true }) : [];
  await Promise.all(
    entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map(async (e) => {
        try {
          packs.push(await readPack(join(packsDir, e.name), e.name));
        } catch (err) {
          problems.push({ folder: e.name, message: err instanceof Error ? err.message : String(err) });
        }
      }),
  );
  packs.sort((a, b) => a.meta.name.localeCompare(b.meta.name));
  problems.sort((a, b) => a.folder.localeCompare(b.folder));
  return { packs, problems };
}

export async function writePack(dir: string, meta: PackMeta): Promise<PackMeta> {
  const next = PackMeta.parse({ ...meta, updatedAt: new Date().toISOString() });
  await writeJson(join(dir, PACK_FILE), next);
  return next;
}

/** Apply a user's edit to a pack's record. Nested source and licence fields merge rather than replace. */
export async function editPack(record: PackRecord, edit: PackEdit): Promise<PackRecord> {
  const merged: PackMeta = { ...record.meta, ...edit } as PackMeta;
  if (edit.source) merged.source = { ...record.meta.source, ...edit.source };
  if (edit.licence) merged.licence = { ...record.meta.licence, ...edit.licence };
  return { ...record, meta: await writePack(record.dir, PackMeta.parse(merged)) };
}

/** Create the folder and record for a new pack; the caller fills `original/` afterwards. */
export async function createPack(root: string, name: string, init: Partial<PackMeta> = {}): Promise<PackRecord> {
  const packsDir = join(root, DIRS.packs);
  await mkdir(packsDir, { recursive: true });
  const existing = new Set((await readdir(packsDir)).map((n) => n.toLowerCase()));
  const folder = uniqueName(safeFolderName(name), (c) => existing.has(c.toLowerCase()));
  const dir = join(packsDir, folder);
  await mkdir(join(dir, PACK_DIRS.original), { recursive: true });
  await mkdir(join(dir, PACK_DIRS.licence), { recursive: true });
  const now = new Date().toISOString();
  const meta = PackMeta.parse({ ...init, id: randomUUID(), name: name.trim() || folder, addedAt: now, updatedAt: now });
  await writeJson(join(dir, PACK_FILE), meta);
  return { dir, folder, meta };
}
