import { join } from 'node:path';
import { z } from 'zod';
import { PROVIDERS, type Provider } from '@shared/storage';
import type { Settings } from '@shared/types';
import { readJson, writeJson } from './fsx';
import { migrateLegacy } from './libraries';
import { log } from './log';

const HEX = /^#[0-9a-f]{6}$/i;

const target = z.object({ provider: z.enum(PROVIDERS.map((p) => p.id) as [Provider, ...Provider[]]), values: z.record(z.string(), z.string()) });

const libraryRecord = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  lastOpenedAt: z.string(),
  skipInboxWhenSure: z.boolean().catch(true),
  autoAddDownloads: z.boolean().catch(true),
  sync: z.object({ enabled: z.boolean(), mode: z.enum(['push', 'pull', 'full']), whileClosed: z.boolean() }).catch({ enabled: false, mode: 'full', whileClosed: true }),
  backup: z
    .object({
      repo: z.string(),
      target,
      intervalHours: z.number().min(0).max(24 * 30).catch(24),
      lastBackupAt: z.string().nullable().catch(null),
      lastError: z.string().nullable().catch(null),
    })
    .nullable()
    .catch(null),
});

/** A site the user set the licence for, so its packs fill themselves in. */
const siteRule = z.object({
  host: z.string().min(3),
  licence: z.string().nullable().catch(null),
  creator: z.string().nullable().catch(null),
  addedAt: z.string().catch(new Date(0).toISOString()),
});

/** Every field has a default, so an old or partly broken settings file still loads. */
const schema = z.object({
  theme: z.enum(['system', 'light', 'dark']).catch('system'),
  seedColor: z.string().regex(HEX).catch('#3f6f8f'),
  libraryPath: z.string().min(1).nullable().catch(null),
  libraries: z.record(z.string(), libraryRecord).catch({}),
  activeProjectId: z.string().nullable().catch(null),
  /** Without a keychain: the user agreed to keep the backup password in an owner-only file. */
  backupPasswordInFile: z.boolean().catch(false),
  errorReports: z.enum(['ask', 'always', 'never']).catch('ask'),
  siteRules: z.array(siteRule).catch([]),
  downloadsAtOnce: z.number().int().min(1).max(5).catch(3),
  updateCheck: z.boolean().catch(true),
});

export const DEFAULT_SETTINGS: Settings = schema.parse({});

/** App settings, kept as JSON in the app's own data folder (never inside a library). */
export class SettingsStore {
  private current: Settings = DEFAULT_SETTINGS;
  private readonly file: string;
  private readonly listeners = new Set<(s: Settings) => void>();
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly dataDir: string) {
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
    // Settings from before libraries kept their own (see libraries.ts).
    const migrated = raw && typeof raw === 'object' ? await migrateLegacy(raw as Record<string, unknown>, this.dataDir).catch((e: unknown) => (log.error('settings', 'could not move settings to libraries', e), null)) : null;
    if (migrated) await this.update({ libraries: migrated });
    return this.current;
  }

  get(): Settings {
    return this.current;
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    const next = schema.parse({ ...this.current, ...patch });
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
