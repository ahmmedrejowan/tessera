/**
 * Every call an agent makes, kept so the window can show what has been done in your library and
 * when. This is Tessera's own record, not a log for debugging: one line a call, in the app's words,
 * with what was asked and whether it worked.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { McpCall } from '@shared/mcp';
import { log } from '../log';

/** Enough for a good few weeks of agent work; older lines drop off as new ones arrive. */
const KEEP = 1000;

export class McpHistory {
  private writing: Promise<void> = Promise.resolve();
  private file: string;

  constructor(dataDir: string) {
    this.file = join(dataDir, 'agent-calls.jsonl');
  }

  /** Note a call. Never throws: the record must not be able to break the call itself. */
  add(call: McpCall): void {
    this.writing = this.writing
      .then(async () => {
        await mkdir(dirname(this.file), { recursive: true });
        await appendFile(this.file, `${JSON.stringify(call)}\n`, 'utf8');
      })
      .catch((e: unknown) => log.warn('mcp', 'could not note an agent call', e));
  }

  /** A page of calls, newest first, with how many there are in all. */
  async list(limit = 20, offset = 0): Promise<{ rows: McpCall[]; total: number }> {
    const text = await readFile(this.file, 'utf8').catch(() => '');
    const lines = text.split('\n').filter(Boolean);
    if (lines.length > KEEP * 1.5) {
      const kept = lines.slice(-KEEP);
      this.writing = this.writing.then(() => writeFile(this.file, `${kept.join('\n')}\n`, 'utf8')).catch(() => undefined);
      lines.splice(0, lines.length - KEEP);
    }
    const rows: McpCall[] = [];
    for (const line of lines.reverse().slice(offset, offset + limit)) {
      try {
        const parsed = JSON.parse(line) as McpCall;
        if (parsed.at && parsed.tool) rows.push(parsed);
      } catch {
        // A half-written line from a crash: skip it.
      }
    }
    return { rows, total: lines.length };
  }

  /** Forget the lot. */
  async clear(): Promise<void> {
    await this.writing;
    await writeFile(this.file, '', 'utf8').catch(() => undefined);
  }
}
