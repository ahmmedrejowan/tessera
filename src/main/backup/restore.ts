import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, realpath, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { BackupPlace, FoundBackup, RestoreSource } from '@shared/types';
import { UserError } from '../errors';
import { readJson, writeJson } from '../fsx';
import { MARKER } from '../library/layout';
import { targetProblem, type StorageTarget } from '@shared/storage';
import { Kopia } from './kopia';
import { kopiaStorage, type RcloneSetup } from './storage';

/** The file every Kopia store on disk has at its top. */
export const REPO_MARKER = 'kopia.repository.f';

export const isBackupStore = (dir: string) => existsSync(join(dir, REPO_MARKER));

const CLOUD_NAMES: [RegExp, string][] = [
  [/^GoogleDrive/i, 'Google Drive'],
  [/^OneDrive/i, 'OneDrive'],
  [/^Dropbox/i, 'Dropbox'],
  [/^Box/i, 'Box'],
  [/^iCloud/i, 'iCloud Drive'],
];

async function dirs(path: string): Promise<string[]> {
  return (await readdir(path, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
}

/**
 * Where backups are likely to be on this computer: cloud drive folders (iCloud Drive, Dropbox,
 * Google Drive, OneDrive), external and network drives, and the usual personal folders.
 */
export async function backupPlaces(platform: NodeJS.Platform = process.platform, home = homedir()): Promise<BackupPlace[]> {
  const places: BackupPlace[] = [];
  const add = (label: string, path: string, kind: BackupPlace['kind']) => {
    if (existsSync(path) && !places.some((p) => p.path === path)) places.push({ label, path, kind });
  };
  if (platform === 'darwin') {
    add('iCloud Drive', join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'), 'cloud');
    for (const name of await dirs(join(home, 'Library', 'CloudStorage'))) {
      add(CLOUD_NAMES.find(([re]) => re.test(name))?.[1] ?? name, join(home, 'Library', 'CloudStorage', name), 'cloud');
    }
    add('Dropbox', join(home, 'Dropbox'), 'cloud');
    const root = await realpath('/').catch(() => '/');
    for (const name of await dirs('/Volumes')) {
      const path = join('/Volumes', name);
      if ((await realpath(path).catch(() => root)) !== root) add(name, path, 'drive');
    }
  } else if (platform === 'win32') {
    for (const name of await dirs(home)) {
      const cloud = CLOUD_NAMES.find(([re]) => re.test(name.replace(/\s/g, '')))?.[1];
      if (cloud) add(cloud, join(home, name), 'cloud');
    }
    for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') add(`Drive ${letter}:`, `${letter}:\\`, 'drive');
  } else {
    add('Dropbox', join(home, 'Dropbox'), 'cloud');
    const user = basename(home);
    for (const base of [`/media/${user}`, `/run/media/${user}`, '/mnt']) for (const name of await dirs(base)) add(name, join(base, name), 'drive');
  }
  add('Documents', join(home, 'Documents'), 'folder');
  add('Desktop', join(home, 'Desktop'), 'folder');
  return places;
}

const SKIP = new Set(['node_modules', 'Library', 'AppData', 'Applications', 'Program Files', 'Windows', 'System Volume Information', '$RECYCLE.BIN']);

/**
 * Look through the likely places for backup stores, a few folders deep, within a time limit (a
 * cloud folder can hold a lot). Found stores come back with the place they're in.
 */
export async function findBackups(places: BackupPlace[], depth = 3, budgetMs = 4000): Promise<FoundBackup[]> {
  const found: FoundBackup[] = [];
  const deadline = Date.now() + budgetMs;
  const walk = async (dir: string, level: number, place: BackupPlace): Promise<void> => {
    if (Date.now() > deadline) return;
    if (isBackupStore(dir)) {
      if (!found.some((f) => f.path === dir)) found.push({ path: dir, place: place.label, kind: place.kind });
      return;
    }
    if (level >= depth) return;
    for (const name of (await dirs(dir)).slice(0, 200)) {
      if (!SKIP.has(name)) await walk(join(dir, name), level + 1, place);
    }
  };
  for (const place of places) await walk(place.path, 0, place);
  return found;
}

/** The store a picked folder means: the folder itself, or one directly inside it. */
export async function storeAt(path: string): Promise<string | null> {
  if (isBackupStore(path)) return path;
  for (const name of await dirs(path)) if (isBackupStore(join(path, name))) return join(path, name);
  return null;
}

/** Total size of the files under `dir` (for restore progress). */
async function sizeOf(dir: string): Promise<number> {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) total += await sizeOf(p);
    else if (e.isFile()) total += (await stat(p).catch(() => null))?.size ?? 0;
  }
  return total;
}

/**
 * Restoring a library from a backup store, possibly on a computer that has never seen it. The
 * store is opened read-only with its own Kopia configuration, so the backups this computer makes
 * (if any) aren't disturbed.
 */
export class RestoreService {
  private session: { target: StorageTarget; password: string; kopia: Kopia } | null = null;

  constructor(
    private readonly dataDir: string,
    private readonly exe: () => string | null,
    private readonly rclone: () => RcloneSetup = () => ({ exe: null, config: '' }),
  ) {}

  private get dir() {
    return join(this.dataDir, 'kopia-restore');
  }

  /** Open a store with its password; returns the libraries in it with their snapshots. */
  async unlock(target: StorageTarget, password: string): Promise<RestoreSource[]> {
    const exe = this.exe();
    if (!exe) throw new UserError('no-kopia', 'Kopia isn’t set up on this computer yet.');
    if (target.provider === 'folder' && !isBackupStore(target.values.path ?? '')) throw new UserError('not-a-backup', 'There’s no backup in that folder.');
    const problem = targetProblem(target);
    if (problem) throw new UserError('incomplete-target', problem);
    await this.close();
    const kopia = new Kopia(exe, this.dir);
    try {
      await kopia.connect(kopiaStorage(target, this.rclone()), password, false, true);
    } catch (e) {
      throw new UserError('restore-connect', e instanceof Error ? e.message : String(e));
    }
    this.session = { target, password, kopia };
    const groups = new Map<string, RestoreSource>();
    for (const s of await kopia.listAll(password)) {
      const key = `${s.host}\n${s.path}`;
      let g = groups.get(key);
      if (!g) {
        g = { key, name: s.name ?? (basename(s.path.replace(/[\\/]+$/, '')) || s.path), host: s.host, path: s.path, snapshots: [] };
        groups.set(key, g);
      }
      g.snapshots.push({ id: s.id, startTime: s.startTime, endTime: s.endTime, size: s.size, files: s.files });
    }
    // Newest first, both the libraries and their snapshots.
    return [...groups.values()].sort((a, b) => b.snapshots[0]!.startTime.localeCompare(a.snapshots[0]!.startTime));
  }

  /**
   * Restore a snapshot into `target` (new or empty). `size` is the snapshot's size, for progress.
   * A library whose id is already in use here (the original is still on this computer) gets a new
   * one, so the two never share an index or a sync folder.
   */
  async restore(id: string, target: string, size: number, onProgress: (fraction: number | null) => void, knownLibraries: () => Promise<{ id: string; path: string }[]>): Promise<void> {
    if (!this.session) throw new UserError('restore-locked', 'Open the backup first.');
    if (existsSync(target) && (await readdir(target)).length) throw new UserError('folder-not-empty', 'Choose a new or empty folder to restore into.');
    let measuring = false;
    const timer = setInterval(() => {
      if (measuring) return;
      measuring = true;
      void sizeOf(target)
        .then((n) => onProgress(size ? Math.min(0.99, n / size) : null))
        .finally(() => (measuring = false));
    }, 1500);
    try {
      await this.session.kopia.restore(id, target, this.session.password);
    } finally {
      clearInterval(timer);
    }
    onProgress(1);
    const marker = join(target, MARKER);
    if (!existsSync(marker)) throw new UserError('not-a-library-backup', 'That backup isn’t of a Tessera library. Its files are in the folder anyway.');
    const info = (await readJson(marker)) as { id?: string } | null;
    if (info?.id && (await knownLibraries()).some((l) => l.id === info.id && l.path !== target)) {
      await writeJson(marker, { ...info, id: randomUUID() });
    }
  }

  /** The store and password in use, to carry on backing up to the same place. */
  get opened(): { target: StorageTarget; password: string } | null {
    return this.session ? { target: this.session.target, password: this.session.password } : null;
  }

  async close(): Promise<void> {
    if (this.session) await this.session.kopia.disconnect(this.session.password).catch(() => undefined);
    this.session = null;
    await rm(this.dir, { recursive: true, force: true });
  }
}
