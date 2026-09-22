import { rm } from 'node:fs/promises';
import type { BackupStatus, Snapshot } from '@shared/types';
import { UserError } from '../errors';
import type { Jobs } from '../jobs';
import { log } from '../log';
import type { SettingsStore } from '../settings';
import { findTool } from '../tools/find';
import { bundledTool } from '../tools/install';
import { describeTarget, targetProblem, withoutSecrets, type StorageTarget } from '@shared/storage';
import { Kopia } from './kopia';
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
  secrets: SecretStore;
  jobs: Jobs;
  /** The open library's folder, or null. */
  libraryPath: () => string | null;
  /** The open library's name, to label its snapshots. */
  libraryName: () => string | null;
  /** rclone, for cloud drives signed into through it. */
  rclone: () => RcloneSetup;
  onChange: () => void;
}

const HOUR = 3_600_000;

/** Kopia installed on the system (or with KopiaUI), or the copy Tessera downloaded. */
export const findKopia = (dataDir: string) => findTool('kopia', ['/Applications/KopiaUI.app/Contents/Resources/server/kopia', bundledTool(dataDir, 'kopia')]);

/**
 * Optional backups of the library with Kopia. Nothing happens until the user sets a backup
 * folder; after that, snapshots run on a schedule while Tessera is open, or on demand.
 */
export class BackupService {
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly d: Deps) {}

  private kopia(): Kopia | null {
    const exe = findKopia(this.d.dataDir);
    return exe ? new Kopia(exe, `${this.d.dataDir}/kopia`) : null;
  }

  /** Whether the Kopia in use is the copy Tessera downloaded. */
  bundled(): boolean {
    return findKopia(this.d.dataDir) === bundledTool(this.d.dataDir, 'kopia');
  }

  async status(): Promise<BackupStatus> {
    const s = this.d.settings.get();
    const kopia = this.kopia();
    return {
      available: !!kopia,
      bundled: this.bundled(),
      rclone: !!this.d.rclone().exe,
      target: s.backupTarget,
      version: kopia ? await kopia.version().catch(() => null) : null,
      repoPath: s.backupRepo,
      intervalHours: s.backupIntervalHours,
      lastBackupAt: s.lastBackupAt,
      lastError: s.lastBackupError,
      running: this.running,
    };
  }

  private async ready(): Promise<{ kopia: Kopia; password: string; source: string }> {
    const kopia = this.kopia();
    if (!kopia) throw new UserError('no-kopia', 'Kopia isn’t set up on this computer yet.');
    const password = await this.d.secrets.load();
    if (!this.d.settings.get().backupRepo || !password) throw new UserError('no-backup', 'Backups aren’t set up yet.');
    const source = this.d.libraryPath();
    if (!source) throw new UserError('no-library', 'No library is open.');
    return { kopia, password, source };
  }

  /** Start backing up to a store: a new one, or one made before (opened with its password). */
  async setup(target: StorageTarget, password: string, create: boolean): Promise<void> {
    const kopia = this.kopia();
    if (!kopia) throw new UserError('no-kopia', 'Kopia isn’t set up on this computer yet.');
    if (password.length < 8) throw new UserError('weak-password', 'Use a password of at least 8 characters.');
    const problem = targetProblem(target);
    if (problem) throw new UserError('incomplete-target', problem);
    const source = this.d.libraryPath();
    if (!source) throw new UserError('no-library', 'Open a library first.');
    // A previous connection would get in the way.
    await rm(`${this.d.dataDir}/kopia`, { recursive: true, force: true });
    try {
      await kopia.connect(kopiaStorage(target, this.d.rclone()), password, create);
    } catch (e) {
      throw new UserError('backup-connect', e instanceof Error ? e.message : String(e));
    }
    // Joining backups made elsewhere (a new or restored computer): this one does the tidying now.
    if (!create) await kopia.takeMaintenance(password).catch((e: unknown) => log.warn('backup', 'could not take over maintenance', e));
    await kopia.setRetention(source, password);
    await this.d.secrets.save(password);
    await this.d.settings.update({ backupRepo: describeTarget(target), backupTarget: withoutSecrets(target), lastBackupError: null });
    this.d.onChange();
    void this.backupNow().catch(() => undefined);
  }

  async backupNow(): Promise<void> {
    if (this.running) return;
    const { kopia, password, source } = await this.ready();
    this.running = true;
    this.d.onChange();
    try {
      await this.d.jobs.run('Backing up the library', async (job) => {
        job.update(null, 'Only what changed since the last backup is stored');
        const snap = await kopia.snapshot(source, password, this.d.libraryName() ?? undefined);
        job.update(1, `${snap.files.toLocaleString()} files`);
      });
      await this.d.settings.update({ lastBackupAt: new Date().toISOString(), lastBackupError: null });
    } catch (e) {
      log.error('backup', 'backup failed', e);
      await this.d.settings.update({ lastBackupError: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      this.running = false;
      this.d.onChange();
    }
  }

  async snapshots(): Promise<Snapshot[]> {
    const { kopia, password, source } = await this.ready();
    return kopia.list(source, password);
  }

  /** Restore a snapshot into a new folder; the library itself is never overwritten. */
  async restore(id: string, target: string): Promise<void> {
    const { kopia, password, source } = await this.ready();
    if (target === source || target.startsWith(`${source}/`) || target.startsWith(`${source}\\`)) {
      throw new UserError('restore-into-library', 'Choose a folder outside the library to restore into.');
    }
    await this.d.jobs.run('Restoring a backup', async () => kopia.restore(id, target, password));
  }

  async turnOff(): Promise<void> {
    const kopia = this.kopia();
    const password = await this.d.secrets.load();
    if (kopia && password) await kopia.disconnect(password);
    await rm(`${this.d.dataDir}/kopia`, { recursive: true, force: true });
    await this.d.secrets.clear();
    await this.d.settings.update({ backupRepo: null, backupTarget: null, lastBackupAt: null, lastBackupError: null });
    this.d.onChange();
  }

  /** Check every few minutes whether a scheduled backup is due. */
  startSchedule(): void {
    if (this.timer) return;
    const tick = () => {
      const s = this.d.settings.get();
      if (!s.backupRepo || !s.backupIntervalHours || this.running || !this.d.libraryPath()) return;
      const last = s.lastBackupAt ? Date.parse(s.lastBackupAt) : 0;
      if (Date.now() - last >= s.backupIntervalHours * HOUR) void this.backupNow().catch(() => undefined);
    };
    this.timer = setInterval(tick, 10 * 60_000);
    setTimeout(tick, 60_000);
  }
}
