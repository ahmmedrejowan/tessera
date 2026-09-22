import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Snapshot } from '@shared/types';
import { storageError, type KopiaStorage } from './storage';

/**
 * Backups with Kopia (https://kopia.io), an open-source, encrypted, deduplicating backup tool.
 * Tessera keeps its own Kopia configuration in its data folder, so it never touches a Kopia setup
 * the user already has, and never stores the password in Kopia's own keychain entry: it's handed
 * over for each command.
 */

export type { Snapshot };

interface ListedSnapshot {
  id: string;
  startTime: string;
  endTime: string;
  rootEntry?: { summ?: { size?: number; files?: number } };
  stats?: { totalSize?: number; fileCount?: number };
}

/**
 * The whole library's size and file count at that backup. `stats` only counts the files that
 * were read that time (none, when nothing changed); the root entry's summary counts them all.
 */
const totals = (r: ListedSnapshot) => ({ size: r.rootEntry?.summ?.size ?? r.stats?.totalSize ?? 0, files: r.rootEntry?.summ?.files ?? r.stats?.fileCount ?? 0 });

export class KopiaError extends Error {}

/** Snapshots Tessera makes are described as "Tessera: <library name>". */
const DESCRIPTION = 'Tessera: ';

export interface AnySnapshot extends Snapshot {
  host: string;
  path: string;
  /** The library's name, when Tessera made the snapshot. */
  name: string | null;
}

export class Kopia {
  private readonly config: string;
  private readonly cache: string;

  constructor(
    private readonly exe: string,
    private readonly dir: string,
  ) {
    this.config = join(dir, 'repository.config');
    this.cache = join(dir, 'cache');
  }

  private run(args: string[], password: string, timeoutMs = 6 * 60 * 60_000, extraEnv: Record<string, string> = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        this.exe,
        [...args, `--config-file=${this.config}`],
        { env: { ...process.env, ...extraEnv, KOPIA_PASSWORD: password, KOPIA_CHECK_FOR_UPDATES: 'false' }, maxBuffer: 256 * 1024 * 1024, timeout: timeoutMs },
        (err, stdout, stderr) => {
          if (!err) return resolve(stdout);
          // Kopia's own message is the useful part: the last non-empty lines of stderr.
          const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
          const message = lines.slice(-2).join(' ') || err.message;
          reject(new KopiaError(storageError(message)));
        },
      );
    });
  }

  async version(): Promise<string> {
    return new Promise((resolve, reject) => execFile(this.exe, ['--version'], (err, out) => (err ? reject(err) : resolve(out.split(/\s/)[0] ?? ''))));
  }

  /**
   * Use a store: a new one is set up, or an existing one is opened with its password. `readOnly`
   * opens it for restoring only.
   */
  async connect(storage: KopiaStorage, password: string, create: boolean, readOnly = false): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    if (create && storage.type === 'filesystem') await mkdir(storage.args[0]!.slice('--path='.length), { recursive: true });
    if (create && storage.prepare) await storage.prepare();
    // A modest local cache: Kopia's default can grow to several gigabytes.
    const cache = [`--cache-directory=${this.cache}`, '--content-cache-size-mb=1024', '--metadata-cache-size-mb=512'];
    const args = ['repository', create ? 'create' : 'connect', storage.type, ...storage.args, ...cache, '--no-persist-credentials', ...(readOnly ? ['--readonly'] : [])];
    await this.run(args, password, 10 * 60_000, storage.env);
  }

  /**
   * Make this computer the one that tidies the store (removes data no snapshot needs any more).
   * Kopia lets one computer do that; after a restore on a new computer, the old one may be gone.
   */
  async takeMaintenance(password: string): Promise<void> {
    await this.run(['maintenance', 'set', '--owner=me'], password, 60_000);
  }

  async maintenanceOwner(password: string): Promise<string> {
    return ((JSON.parse(await this.run(['maintenance', 'info', '--json'], password, 60_000)) as { owner?: string }).owner ?? '');
  }

  /** Change the store's password; the new one goes by environment, never on the command line. */
  async changePassword(password: string, next: string): Promise<void> {
    await this.run(['repository', 'change-password'], password, 120_000, { KOPIA_NEW_PASSWORD: next });
  }

  /** How long snapshots are kept: recent ones in detail, older ones thinned out. */
  async setRetention(source: string, password: string): Promise<void> {
    await this.run(['policy', 'set', source, '--keep-latest=10', '--keep-hourly=0', '--keep-daily=14', '--keep-weekly=8', '--keep-monthly=12', '--keep-annual=3'], password);
  }

  /** Back up `source`; `name` labels the snapshot so another computer can tell what it is. */
  async snapshot(source: string, password: string, name?: string): Promise<Snapshot> {
    const out = await this.run(['snapshot', 'create', source, '--json', ...(name ? [`--description=${DESCRIPTION}${name}`] : [])], password);
    const s = JSON.parse(out) as { id: string; startTime: string; endTime: string; rootEntry?: { summ?: { size?: number; files?: number } } };
    return { id: s.id, startTime: s.startTime, endTime: s.endTime, size: s.rootEntry?.summ?.size ?? 0, files: s.rootEntry?.summ?.files ?? 0 };
  }

  async list(source: string, password: string): Promise<Snapshot[]> {
    const out = await this.run(['snapshot', 'list', source, '--json'], password, 120_000);
    const rows = JSON.parse(out || '[]') as ListedSnapshot[];
    return rows
      .map((r) => ({ id: r.id, startTime: r.startTime, endTime: r.endTime, ...totals(r) }))
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
  }

  /** Every snapshot in the store, from every computer and folder that backed up to it. */
  async listAll(password: string): Promise<AnySnapshot[]> {
    const out = await this.run(['snapshot', 'list', '--all', '--json'], password, 300_000);
    const rows = JSON.parse(out || '[]') as (ListedSnapshot & { description?: string; source?: { host?: string; userName?: string; path?: string } })[];
    return rows
      .map((r) => ({
        id: r.id,
        startTime: r.startTime,
        endTime: r.endTime,
        ...totals(r),
        host: r.source?.host ?? '',
        path: r.source?.path ?? '',
        name: r.description?.startsWith(DESCRIPTION) ? r.description.slice(DESCRIPTION.length) : null,
      }))
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
  }

  /** Put a snapshot's files into `target` (a new or empty folder). */
  async restore(id: string, target: string, password: string): Promise<void> {
    await mkdir(target, { recursive: true });
    await this.run(['snapshot', 'restore', id, target], password);
  }

  /** Stop using the backup store. The store itself, and its snapshots, stay where they are. */
  async disconnect(password: string): Promise<void> {
    await this.run(['repository', 'disconnect'], password).catch(() => undefined);
  }
}
