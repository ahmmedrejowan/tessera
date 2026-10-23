import { execFile, spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
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

/** How far a backup has got, as far as Kopia has said. */
export interface SnapshotProgress {
  /** 0 to 1, or null while Kopia is still working out how much there is. */
  done: number | null;
  /** Bytes sent to the store so far, or null when the line did not say. */
  uploaded: number | null;
  /** Bytes read from the library so far, or null when the line did not say. */
  hashed: number | null;
  /** Kopia's own estimate of the time left ("25m0s"), when it has one. */
  left: string | null;
}

const UNITS: Record<string, number> = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4 };

const bytes = (n: string, unit: string): number | null => {
  const mult = UNITS[unit.toUpperCase()];
  return mult === undefined ? null : Number(n) * mult;
};

/**
 * What a progress line from Kopia says, or null when it is not one.
 *
 * Kopia writes a line like
 *   * 0 hashing, 812 hashed (1.2 GB), 44 cached (90 MB), uploaded 503.1 MB, estimated 7.6 GB (15.8%) 25m0s left
 * and, before it has looked at enough to guess, the same without the estimate. Nothing here
 * insists on the whole shape: each part is looked for on its own, and a line that has none of
 * them is not a progress line. A Kopia that words this differently loses the progress bar and
 * keeps the backup, which is the right way round for something only being watched.
 */
export function readProgress(line: string): SnapshotProgress | null {
  const pct = /\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/.exec(line);
  const up = /uploaded\s+(\d+(?:\.\d+)?)\s*([KMGT]i?B|B)/i.exec(line);
  const hashed = /(\d+(?:\.\d+)?)\s*([KMGT]i?B|B)\s*\)\s*,\s*\d+\s+cached/i.exec(line);
  const left = /(\d+[hms][\dhms]*)\s+left/i.exec(line);
  if (!pct && !up && !hashed) return null;
  const done = pct ? Math.min(1, Math.max(0, Number(pct[1]) / 100)) : null;
  return {
    done: done !== null && Number.isFinite(done) ? done : null,
    uploaded: up ? bytes(up[1]!, up[2]!) : null,
    hashed: hashed ? bytes(hashed[1]!, hashed[2]!) : null,
    left: left ? left[1]! : null,
  };
}

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

  /**
   * Back up `source`; `name` labels the snapshot so another computer can tell what it is.
   *
   * This is the one command long enough that watching it matters: a first backup of a large
   * library is half an hour or more, and the others are run and forgotten. Kopia says where it has
   * got to on its error stream as it goes, so this one is spawned and read line by line rather
   * than run through `run`, which hands back everything only once the process has ended.
   */
  async snapshot(source: string, password: string, name?: string, onProgress?: (p: SnapshotProgress) => void): Promise<Snapshot> {
    // `--progress` is not optional here: Kopia writes its progress line only when it believes a
    // person is watching, and a pipe is not a terminal, so without this it says nothing at all
    // until it has finished. Found by reading what it actually wrote, not by reading the flag.
    const args = ['snapshot', 'create', source, '--json', '--progress', ...(name ? [`--description=${DESCRIPTION}${name}`] : [])];
    const out = await this.stream(args, password, onProgress);
    const s = JSON.parse(out) as { id: string; startTime: string; endTime: string; rootEntry?: { summ?: { size?: number; files?: number } } };
    return { id: s.id, startTime: s.startTime, endTime: s.endTime, size: s.rootEntry?.summ?.size ?? 0, files: s.rootEntry?.summ?.files ?? 0 };
  }

  /** Run a command, reading its error stream as it goes. Resolves with everything it wrote out. */
  private stream(args: string[], password: string, onProgress?: (p: SnapshotProgress) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const p = spawn(this.exe, [...args, `--config-file=${this.config}`], {
        env: { ...process.env, KOPIA_PASSWORD: password, KOPIA_CHECK_FOR_UPDATES: 'false' },
      });
      let out = '';
      let tail: string[] = [];
      let rest = '';
      p.stdout.on('data', (d: Buffer) => (out += d.toString()));
      p.stderr.on('data', (d: Buffer) => {
        // Kopia redraws one line as it works, so the separator is a carriage return as often as a
        // newline, and the last piece is held back until the rest of it arrives.
        const chunk = rest + d.toString();
        const lines = chunk.split(/[\r\n]+/);
        rest = lines.pop() ?? '';
        for (const line of lines) {
          const l = line.trim();
          if (!l) continue;
          // Kept for the error message, which is the last thing it says before giving up.
          tail = [...tail, l].slice(-2);
          const progress = readProgress(l);
          if (progress && onProgress) onProgress(progress);
        }
      });
      // The same stop as every other command has, so a wedged backup cannot run forever. Six
      // hours is long enough for a first backup of a large library over a slow connection.
      const cutOff = setTimeout(() => p.kill(), 6 * 60 * 60_000);
      p.on('error', (e) => {
        clearTimeout(cutOff);
        reject(new KopiaError(storageError(e.message)));
      });
      p.on('close', (code) => {
        clearTimeout(cutOff);
        if (code === 0) return resolve(out);
        reject(new KopiaError(storageError(tail.join(' ') || `kopia exited with ${String(code)}`)));
      });
    });
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
  /**
   * Drop the store's format that Kopia keeps in its cache, so the next command reads it again.
   * Needed after the password was changed through another connection: the cached copy is sealed
   * with the old one.
   */
  async forgetFormat(): Promise<void> {
    await Promise.all(['kopia.repository', 'kopia.blobcfg'].map((f) => rm(join(this.cache, f), { force: true })));
  }

  async disconnect(password: string): Promise<void> {
    await this.run(['repository', 'disconnect'], password).catch(() => undefined);
  }
}
