/**
 * What has been happening in a library: packs added, downloads, reviews finished, backups, copies
 * to a project. Kept as a short list next to the library's index, so Home can show it after a
 * restart. It is a record for the user, not a log for debugging — one line each, in their words.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ActivityEntry, ActivityKind } from '@shared/types';
import { libraryDataDir } from './libraries';
import { log } from './log';

/** Enough to fill Home and a little history; older lines are dropped as new ones arrive. */
const KEEP = 200;

export class Activity {
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly dataDir: string,
    /** The open library, or null when none is. */
    private readonly libraryId: () => string | null,
    private readonly onChanged: () => void,
  ) {}

  private file(id: string): string {
    return join(libraryDataDir(this.dataDir, id), 'activity.jsonl');
  }

  /** Note something that happened. Never throws: a missing note must not stop the thing itself. */
  add(kind: ActivityKind, text: string, detail?: string): void {
    const id = this.libraryId();
    if (!id) return;
    const entry: ActivityEntry = { at: new Date().toISOString(), kind, text, ...(detail ? { detail } : {}) };
    this.writing = this.writing
      .then(async () => {
        await mkdir(libraryDataDir(this.dataDir, id), { recursive: true });
        await appendFile(this.file(id), `${JSON.stringify(entry)}\n`, 'utf8');
      })
      .then(() => this.onChanged())
      .catch((e: unknown) => log.warn('activity', 'could not note what happened', e));
  }

  /** The most recent entries, newest first. */
  async list(limit = 20): Promise<ActivityEntry[]> {
    const id = this.libraryId();
    if (!id) return [];
    const text = await readFile(this.file(id), 'utf8').catch(() => '');
    const lines = text.split('\n').filter(Boolean);
    // Keep the file from growing for ever.
    if (lines.length > KEEP * 1.5) {
      const kept = lines.slice(-KEEP);
      this.writing = this.writing.then(() => writeFile(this.file(id), `${kept.join('\n')}\n`, 'utf8')).catch(() => undefined);
      lines.splice(0, lines.length - KEEP);
    }
    const out: ActivityEntry[] = [];
    for (const line of lines.slice(-limit).reverse()) {
      try {
        const parsed = JSON.parse(line) as ActivityEntry;
        if (parsed.at && parsed.text) out.push(parsed);
      } catch {
        // a half-written line: skip it
      }
    }
    return out;
  }
}
