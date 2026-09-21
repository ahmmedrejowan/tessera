import { join } from 'node:path';
import { z } from 'zod';
import type { Settings, SettingsPatch } from '@shared/types';
import { readJson, writeJson } from './fsx';
import { log } from './log';

const HEX = /^#[0-9a-f]{6}$/i;
const MAX_RECENT = 8;

/** Every field has a default, so an old or partly broken settings file still loads. */
const schema = z.object({
  theme: z.enum(['system', 'light', 'dark']).catch('system'),
  seedColor: z.string().regex(HEX).catch('#3f6f8f'),
  libraryPath: z.string().min(1).nullable().catch(null),
  recentLibraries: z.array(z.string().min(1)).catch([]),
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
    return this.current;
  }

  get(): Settings {
    return this.current;
  }

  async update(patch: SettingsPatch): Promise<Settings> {
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
