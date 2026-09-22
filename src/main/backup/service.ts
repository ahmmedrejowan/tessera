import { existsSync } from 'node:fs';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { BackupStatus, LibraryBackup, LibraryRecord, Snapshot } from '@shared/types';
import { byRecent, patchRecord, recordOf } from '../libraries';
import { UserError } from '../errors';
import type { Jobs } from '../jobs';
import { log } from '../log';
import type { SettingsStore } from '../settings';
import { findTool } from '../tools/find';
import { bundledTool } from '../tools/install';
import { describeTarget, targetProblem, withoutSecrets, type StorageTarget } from '@shared/storage';
import { Kopia } from './kopia';
import { restoreLibrary } from './restore';
import { kopiaStorage, type RcloneSetup } from './storage';

/** Keeps the backup password, encrypted by the operating system. */
export interface SecretStore {
  save(secret: string): Promise<void>;
  load(): Promise<string | null>;
  clear(): Promise<void>;
}

interface Deps {
  dataDir: string;
  settings: SettingsStore;
  /** Where a library's backup password is kept. */
  secrets: (libraryId: string) => SecretStore;
  /** The system keychain can keep the password (see secrets.ts). */
  keychain: () => boolean;
  jobs: Jobs;
  /** The open library, or null. */
  library: () => OpenLibrary | null;
  /** Whether `path` still holds the library `id` (it may have moved, or its drive be away). */
  isLibrary: (path: string, id: string) => Promise<boolean>;
  /** rclone, for cloud drives signed into through it. */
  rclone: () => RcloneSetup;
  onChange: () => void;
}

interface OpenLibrary {
  id: string;
  name: string;
  path: string;
}

const HOUR = 3_600_000;

/** Kopia installed on the system (or with KopiaUI), or the copy Tessera downloaded. */
export const findKopia = (dataDir: string) => findTool('kopia', ['/Applications/KopiaUI.app/Contents/Resources/server/kopia', bundledTool(dataDir, 'kopia')]);

/** Two setups back up to the same store when these match (secrets aside). */
const storeKey = (t: StorageTarget) => JSON.stringify([t.provider, Object.entries(withoutSecrets(t).values).sort(([a], [b]) => a.localeCompare(b))]);

/**
 * Optional backups with Kopia, set up per library: each library has its own place, password,
 * schedule and Kopia connection (several libraries may share one place). Nothing happens until a
 * library's backups are set up; after that, snapshots run on its schedule while Tessera is open,
 * whichever library is open, or on demand.
 */
export class BackupService {
  /** Libraries being backed up now. */
  private readonly running = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly d: Deps) {}

  /** A library's own folder for backups: its Kopia connection and its password. */
  private dir(libraryId: string): string {
    return join(this.d.dataDir, 'libraries', libraryId, 'backup');
  }

  private kopia(libraryId: string): Kopia | null {
    const exe = findKopia(this.d.dataDir);
    return exe ? new Kopia(exe, join(this.dir(libraryId), 'kopia')) : null;
  }

  private record(libraryId: string): LibraryRecord | null {
    return recordOf(this.d.settings, libraryId);
  }

  private entry(libraryId: string): LibraryBackup | null {
    return this.record(libraryId)?.backup ?? null;
  }

  private async save(libraryId: string, entry: LibraryBackup | null): Promise<void> {
    await patchRecord(this.d.settings, libraryId, { backup: entry });
  }

  private async patch(libraryId: string, patch: Partial<LibraryBackup>): Promise<void> {
    await patchRecord(this.d.settings, libraryId, (r) => (r.backup ? { backup: { ...r.backup, ...patch } } : {}));
  }

  private open(): OpenLibrary {
    const lib = this.d.library();
    if (!lib) throw new UserError('no-library', 'Open a library first.');
    return lib;
  }

  /** Whether the Kopia in use is the copy Tessera downloaded. */
  bundled(): boolean {
    return findKopia(this.d.dataDir) === bundledTool(this.d.dataDir, 'kopia');
  }

  /** A library opened: what Settings shows is about it now. */
  libraryOpened(): void {
    this.d.onChange();
  }

  async status(): Promise<BackupStatus> {
    const lib = this.d.library();
    const entry = lib ? this.entry(lib.id) : null;
    const kopia = lib ? this.kopia(lib.id) : null;
    const exe = findKopia(this.d.dataDir);
    const seen = new Set(entry ? [storeKey(entry.target)] : []);
    const others: BackupStatus['others'] = [];
    for (const r of byRecent(this.d.settings.get().libraries)) {
      const e = r.backup;
      if (!e || r.id === lib?.id || seen.has(storeKey(e.target))) continue;
      seen.add(storeKey(e.target));
      others.push({ libraryId: r.id, libraryName: r.name, repo: e.repo });
    }
    return {
      available: !!exe,
      bundled: this.bundled(),
      rclone: !!this.d.rclone().exe,
      keychain: this.d.keychain(),
      target: entry?.target ?? null,
      version: exe && kopia ? await kopia.version().catch(() => null) : null,
      repoPath: entry?.repo ?? null,
      intervalHours: entry?.intervalHours ?? 24,
      lastBackupAt: entry?.lastBackupAt ?? null,
      lastError: entry?.lastError ?? null,
      running: !!lib && this.running.has(lib.id),
      others: lib ? others : [],
    };
  }

  /** A library's backups, ready to use: Kopia, the password, the entry, and the library folder. */
  private async ready(libraryId: string, source?: string): Promise<{ kopia: Kopia; password: string; entry: LibraryBackup; name: string; source: string }> {
    const kopia = this.kopia(libraryId);
    if (!kopia) throw new UserError('no-kopia', 'Kopia isn’t set up on this computer yet.');
    const entry = this.entry(libraryId);
    const password = entry ? await this.d.secrets(libraryId).load() : null;
    if (!entry || !password) throw new UserError('no-backup', 'Backups aren’t set up for this library.');
    const record = this.record(libraryId)!;
    return { kopia, password, entry, name: record.name, source: source ?? record.path };
  }

  /** Start backing up the open library to a store: a new one, or one made before (opened with its password). */
  async setup(target: StorageTarget, password: string, create: boolean): Promise<void> {
    const lib = this.open();
    const kopia = this.kopia(lib.id);
    if (!kopia) throw new UserError('no-kopia', 'Kopia isn’t set up on this computer yet.');
    if (password.length < 8) throw new UserError('weak-password', 'Use a password of at least 8 characters.');
    const problem = targetProblem(target);
    if (problem) throw new UserError('incomplete-target', problem);
    // A previous connection would get in the way.
    await rm(join(this.dir(lib.id), 'kopia'), { recursive: true, force: true });
    try {
      await kopia.connect(kopiaStorage(target, this.d.rclone()), password, create);
    } catch (e) {
      throw new UserError('backup-connect', e instanceof Error ? e.message : String(e));
    }
    // Joining backups made elsewhere (a new or restored computer): this one does the tidying now.
    if (!create) await kopia.takeMaintenance(password).catch((e: unknown) => log.warn('backup', 'could not take over maintenance', e));
    await this.start(lib, kopia, password, target);
  }

  /**
   * Back up the open library to the same place as another library, with the same password: its
   * Kopia connection is copied, so no keys or sign-in are asked for again.
   */
  async join(otherId: string): Promise<void> {
    const lib = this.open();
    const other = this.entry(otherId);
    const password = other ? await this.d.secrets(otherId).load() : null;
    if (!other || !password) throw new UserError('no-backup', 'That library’s backups aren’t set up any more.');
    const kopia = this.kopia(lib.id);
    if (!kopia) throw new UserError('no-kopia', 'Kopia isn’t set up on this computer yet.');
    const dir = join(this.dir(lib.id), 'kopia');
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    await copyFile(join(this.dir(otherId), 'kopia', 'repository.config'), join(dir, 'repository.config'));
    await this.start(lib, kopia, password, other.target);
  }

  private async start(lib: OpenLibrary, kopia: Kopia, password: string, target: StorageTarget): Promise<void> {
    try {
      await kopia.setRetention(lib.path, password);
      await this.d.secrets(lib.id).save(password);
    } catch (e) {
      await rm(join(this.dir(lib.id), 'kopia'), { recursive: true, force: true });
      throw e;
    }
    const before = this.entry(lib.id);
    await this.save(lib.id, {
      repo: describeTarget(target),
      target: withoutSecrets(target),
      intervalHours: before?.intervalHours ?? 24,
      lastBackupAt: null,
      lastError: null,
    });
    this.d.onChange();
    void this.backupNow().catch(() => undefined);
  }

  /** Where the open library's backups go, without secrets. */
  target(): StorageTarget | null {
    const lib = this.d.library();
    return lib ? (this.entry(lib.id)?.target ?? null) : null;
  }

  /** The open library's backup password, for showing to its owner or putting in a recovery kit. */
  async password(): Promise<string> {
    return (await this.ready(this.open().id)).password;
  }

  /**
   * Change the password of the open library's store. Other libraries backing up to the same
   * store keep working: their copy of the password changes too.
   */
  async changePassword(next: string): Promise<void> {
    if (next.length < 8) throw new UserError('weak-password', 'Use a password of at least 8 characters.');
    const lib = this.open();
    const { kopia, password, entry } = await this.ready(lib.id);
    await kopia.changePassword(password, next);
    await this.d.secrets(lib.id).save(next);
    for (const r of Object.values(this.d.settings.get().libraries)) {
      const id = r.id;
      if (id === lib.id || !r.backup || storeKey(r.backup.target) !== storeKey(entry.target)) continue;
      await this.d.secrets(id).save(next);
      await this.kopia(id)?.forgetFormat();
    }
    this.d.onChange();
  }

  async setInterval(hours: number): Promise<void> {
    await this.patch(this.open().id, { intervalHours: hours });
    this.d.onChange();
  }

  /** Back up a library now: the open one, or another whose backups are set up. */
  async backupNow(libraryId?: string): Promise<void> {
    const lib = this.d.library();
    const id = libraryId ?? lib?.id;
    if (!id) throw new UserError('no-library', 'No library is open.');
    if (this.running.has(id)) return;
    const { kopia, password, name, source } = await this.ready(id, lib?.id === id ? lib.path : undefined);
    if (lib?.id !== id && !(await this.d.isLibrary(source, id))) return;
    this.running.add(id);
    this.d.onChange();
    try {
      await this.d.jobs.run(`Backing up “${name}”`, async (job) => {
        job.update(null, 'Only what changed since the last backup is stored');
        const snap = await kopia.snapshot(source, password, name);
        job.update(1, `${snap.files.toLocaleString()} files`);
      });
      await this.patch(id, { lastBackupAt: new Date().toISOString(), lastError: null });
    } catch (e) {
      log.error('backup', 'backup failed', e);
      await this.patch(id, { lastError: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      this.running.delete(id);
      this.d.onChange();
    }
  }

  async snapshots(): Promise<Snapshot[]> {
    const lib = this.open();
    const { kopia, password } = await this.ready(lib.id);
    return kopia.list(lib.path, password);
  }

  /**
   * Restore a snapshot of the open library into a new folder, as a copy of its own; the library
   * itself is never overwritten.
   */
  async restore(id: string, target: string, size: number, name: string, onProgress: (fraction: number | null) => void, knownLibraries: () => Promise<{ id: string; path: string }[]>): Promise<void> {
    const lib = this.open();
    const { kopia, password } = await this.ready(lib.id);
    const source = lib.path;
    if (target === source || target.startsWith(`${source}/`) || target.startsWith(`${source}\\`)) {
      throw new UserError('restore-into-library', 'Choose a folder outside the library to restore into.');
    }
    await restoreLibrary(() => kopia.restore(id, target, password), target, size, onProgress, knownLibraries, name);
  }

  /** Stop backing up the open library. Its backups stay where they are. */
  async turnOff(): Promise<void> {
    const lib = this.open();
    const kopia = this.kopia(lib.id);
    const password = await this.d.secrets(lib.id).load();
    if (kopia && password) await kopia.disconnect(password);
    await rm(this.dir(lib.id), { recursive: true, force: true });
    await this.d.secrets(lib.id).clear();
    await this.save(lib.id, null);
    this.d.onChange();
  }

  /** Check every few minutes whether a library's scheduled backup is due, open or not. */
  startSchedule(): void {
    if (this.timer) return;
    let ticking = false;
    const tick = async () => {
      if (ticking) return;
      ticking = true;
      try {
        for (const { id, backup: e } of Object.values(this.d.settings.get().libraries)) {
          if (!e) continue;
          if (!e.intervalHours || this.running.has(id)) continue;
          const last = e.lastBackupAt ? Date.parse(e.lastBackupAt) : 0;
          if (Date.now() - last >= e.intervalHours * HOUR) await this.backupNow(id).catch(() => undefined);
        }
      } finally {
        ticking = false;
      }
    };
    this.timer = setInterval(() => void tick(), 10 * 60_000);
    setTimeout(() => void tick(), 60_000);
  }
}
