import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

type Level = 'info' | 'warn' | 'error';

const MAX_BYTES = 2 * 1024 * 1024;
let file: string | null = null;

/** Start writing to <dir>/main.log as well as the console. The previous log is kept as main.old.log. */
export function initLog(dir: string): void {
  // This runs before there is a window, a dialog or a handler for an uncaught throw, so a home
  // folder that cannot be written would mean double-clicking the app and nothing happening at
  // all. Without a file the console is enough.
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    file = null;
    return;
  }
  file = join(dir, 'main.log');
  try {
    if (statSync(file).size > MAX_BYTES) renameSync(file, join(dir, 'main.old.log'));
  } catch {
    // no log yet
  }
}

function detail(extra: unknown): string {
  if (extra === undefined) return '';
  if (extra instanceof Error) return `: ${extra.stack ?? extra.message}`;
  try {
    return `: ${JSON.stringify(extra)}`;
  } catch {
    return `: ${String(extra)}`;
  }
}

function write(level: Level, area: string, message: string, extra?: unknown): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${area}] ${message}${detail(extra)}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
  if (!file) return;
  try {
    appendFileSync(file, `${line}\n`);
  } catch {
    // logging must never take the app down
  }
}

export const log = {
  info: (area: string, message: string, extra?: unknown) => write('info', area, message, extra),
  warn: (area: string, message: string, extra?: unknown) => write('warn', area, message, extra),
  error: (area: string, message: string, extra?: unknown) => write('error', area, message, extra),
};
