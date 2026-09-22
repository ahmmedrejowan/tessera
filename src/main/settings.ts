import { join } from 'node:path';
import { z } from 'zod';
import { PROVIDERS, type Provider } from '@shared/storage';
import type { Settings } from '@shared/types';
import { readJson, writeJson } from './fsx';
import { log } from './log';

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_RECENT = 8;

const target = z.object({ provider: z.enum(PROVIDERS.map((p) => p.id) as [Provider, ...Provider[]]), values: z.record(z.string(), z.string()) });

const libraryBackup = z.object({
  repo: z.string(),
  target,
  libraryName: z.string(),
  libraryPath: z.string(),
  intervalHours: z.number().min(0).max(24 * 30).catch(24),
  lastBackupAt: z.string().nullable().catch(null),
  lastError: z.string().nullable().catch(null),
});

/** Backups as they were kept before they were per library: one set for the app. */
const legacyBackup = z.object({
  backupRepo: z.string().min(1),
  backupTarget: target.nullable().catch(null),
  backupIntervalHours: z.number().catch(24),
  lastBackupAt: z.string().nullable().catch(null),
  lastBackupError: z.string().nullable().catch(null),
  libraryPath: z.string().nullable().catch(null),
});

/** Every field has a default, so an old or partly broken settings file still loads. */
const schema = z.object({
  theme: z.enum(['system', 'light', 'dark']).catch('system'),
  seedColor: z.string().regex(HEX).catch('#3f6f8f'),
  libraryPath: z.string().min(1).nullable().catch(null),
  recentLibraries: z.array(z.string().min(1)).catch([]),
  skipInboxWhenSure: z.boolean().catch(true),
  activeProjectId: z.string().nullable().catch(null),
  libraryBackups: z.record(z.string(), libraryBackup).catch({}),
  unclaimedBackup: libraryBackup.nullable().catch(null),
  /** Without a keychain: the user agreed to keep the backup password in an owner-only file. */
  backupPasswordInFile: z.boolean().catch(false),
  syncEnabled: z.boolean().catch(false),
  syncMode: z.enum(['push', 'pull', 'full']).catch('full'),
  errorReports: z.enum(['ask', 'always', 'never']).catch('ask'),
});

export const DEFAULT_SETTINGS: Settings = schema.parse({});

/** App settings, kept as JSON in the app's own data folder (never inside a library). */
export class SettingsStore {
  private current: Settings = DEFAULT_SETTINGS;
  private readonly file: string;
  private readonly listeners = new Set<(s: Settings) => void>();
  private writing: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.file = join(dataDir, 'settings.json');
  }

  async load(): Promise<Settings> {
    let raw: unknown = null;
    try {
      raw = await readJson(this.file);
    } catch (e) {
      // Unreadable settings are replaced by defaults rather than stopping the app from starting.
      log.warn('settings', 'settings file unreadable, using defaults', e);
    }
    this.current = schema.parse(raw ?? {});
    // Backups set up before they were per library wait for their library to open (backups.ts).
    const legacy = legacyBackup.safeParse(raw);
    if (legacy.success && !this.current.unclaimedBackup) {
      const l = legacy.data;
      this.current.unclaimedBackup = {
        repo: l.backupRepo,
        // Before other kinds of storage, backups only went to a folder, named by backupRepo.
        target: l.backupTarget ?? { provider: 'folder', values: { path: l.backupRepo } },
        libraryName: '',
        libraryPath: l.libraryPath ?? '',
        intervalHours: l.backupIntervalHours,
        lastBackupAt: l.lastBackupAt,
        lastError: l.lastBackupError,
      };
      await this.update({});
    }
    return this.current;
  }

  get(): Settings {
    return this.current;
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    const next = schema.parse({ ...this.current, ...patch });
    if (patch.libraryPath) {
      next.recentLibraries = [patch.libraryPath, ...next.recentLibraries.filter((p) => p !== patch.libraryPath)].slice(0, MAX_RECENT);
    }
    this.current = next;
    // Writes are chained so two quick updates can't land out of order.
    this.writing = this.writing.then(() => writeJson(this.file, next)).catch((e: unknown) => log.error('settings', 'could not save settings', e));
    await this.writing;
    for (const l of this.listeners) l(next);
    return next;
  }

  onChange(listener: (s: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
