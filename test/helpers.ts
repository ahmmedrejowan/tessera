import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

const made: string[] = [];

/** A fresh temporary folder, removed after the test. */
export function tempDir(prefix = 'tessera-test-'): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

afterEach(() => {
  // Retries because a service may still be finishing a write of its own as its folder goes: on
  // Linux a file appearing mid-removal is an ENOTEMPTY, which has nothing to do with the test.
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});
