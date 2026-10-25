/**
 * The whole chain, against a real Kopia: spawn, carriage returns, parse, callback.
 *
 * The unit tests feed the parser lines that were captured earlier, which proves the parsing and
 * nothing else. This runs an actual snapshot through the actual class and checks that progress
 * arrives at the callback the job uses. It is the test that would have caught `--progress`
 * missing, where every other check passed and the bar would still never have moved.
 *
 * Skipped unless Kopia is installed, so it never fails a machine that has no Kopia: set
 * TESSERA_KOPIA to point at it, or have it on the PATH.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Kopia, stopAllKopia, type SnapshotProgress } from '../src/main/backup/kopia';

function findKopia(): string | null {
  const given = process.env.TESSERA_KOPIA;
  if (given) return given;
  for (const p of ['/opt/homebrew/bin/kopia', '/usr/local/bin/kopia', '/usr/bin/kopia']) {
    try {
      execFileSync(p, ['--version'], { stdio: 'ignore' });
      return p;
    } catch {
      // Not there; try the next.
    }
  }
  return null;
}

const exe = findKopia();
const root = mkdtempSync(join(tmpdir(), 'tessera-kopia-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe.skipIf(!exe)('a real backup says where it has got to', () => {
  it('reports progress while it runs, not only when it ends', async () => {
    const repo = join(root, 'repo');
    const data = join(root, 'data');
    const dir = join(root, 'kopia');
    mkdirSync(repo, { recursive: true });
    mkdirSync(data, { recursive: true });
    mkdirSync(dir, { recursive: true });

    // Enough incompressible data that Kopia takes long enough to say something: the progress
    // line is written as it goes, so a snapshot that ends instantly reports nothing at all.
    for (let i = 0; i < 24; i++) {
      const buf = Buffer.alloc(2 * 1024 * 1024);
      for (let j = 0; j < buf.length; j += 4) buf.writeUInt32LE((i * 2654435761 + j) >>> 0, j);
      writeFileSync(join(data, `blob-${i}.bin`), buf);
    }

    const password = 'tessera-test-password';
    const kopia = new Kopia(exe!, dir);
    await kopia.connect({ type: 'filesystem', args: ['--path', repo], env: {} }, password, true);

    const seen: SnapshotProgress[] = [];
    const snap = await kopia.snapshot(data, password, 'Live Test', (p) => seen.push(p));

    // The snapshot itself worked.
    expect(snap.files).toBeGreaterThan(0);

    // And it said so while it was working. This is the assertion that matters: without
    // `--progress` Kopia stays silent on a pipe and `seen` is empty, with everything else green.
    expect(seen.length, 'no progress arrived while the backup ran').toBeGreaterThan(0);

    // What arrived is real: bytes that do not go backwards.
    const uploaded = seen.map((p) => p.uploaded).filter((n): n is number => n !== null);
    expect(uploaded.length).toBeGreaterThan(0);
    for (let i = 1; i < uploaded.length; i++) expect(uploaded[i]).toBeGreaterThanOrEqual(uploaded[i - 1]!);

    // Any fraction Kopia gave is a fraction.
    for (const p of seen) if (p.done !== null) expect(p.done).toBeGreaterThanOrEqual(0), expect(p.done).toBeLessThanOrEqual(1);
  }, 180_000);

  it('stops when the app quits, instead of being left behind', async () => {
    // Quitting used to leave the backup running with nothing to report to, and the next start
    // would set another going beside it. This asks whether a running one actually stops.
    const repo = join(root, 'repo2');
    const data = join(root, 'data2');
    const dir = join(root, 'kopia2');
    for (const d of [repo, data, dir]) mkdirSync(d, { recursive: true });
    for (let i = 0; i < 40; i++) {
      const buf = Buffer.alloc(2 * 1024 * 1024);
      for (let j = 0; j < buf.length; j += 4) buf.writeUInt32LE((i * 40503 + j * 2654435761) >>> 0, j);
      writeFileSync(join(data, `blob-${i}.bin`), buf);
    }

    const password = 'tessera-test-password';
    const kopia = new Kopia(exe!, dir);
    await kopia.connect({ type: 'filesystem', args: ['--path', repo], env: {} }, password, true);

    // The child is registered as it is spawned, which happens before this call returns, so the
    // quit lands on a Kopia that is genuinely running. Waiting for a given moment first only
    // raced a local store that finishes in under a second; where it is stopped does not change
    // what is being asked, which is whether quitting stops it at all.
    const snapshot = kopia.snapshot(data, password, 'Quit Test');
    stopAllKopia();

    // It ends, and says it did not finish rather than pretending it did.
    await expect(snapshot).rejects.toThrow();
  }, 180_000);
});
