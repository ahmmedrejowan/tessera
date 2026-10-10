import { join } from 'node:path';
import { app, utilityProcess, type UtilityProcess } from 'electron';
import { log } from '../log';
import { stampOne, type Stamp, type StampMode } from './stamp';

export interface StampAsk {
  packDir: string;
  ref: string;
  mode: StampMode;
}
export type StampAnswer = { ok: true; stamp: Stamp } | { ok: false; error: string };

/** Long enough that a slow archive finishes, short enough that a wedged one is noticed. */
const BATCH_TIMEOUT = 120_000;

/**
 * Somewhere other than the main process to read and hash files.
 *
 * The work is synchronous once the bytes are in hand, so doing it here held the window for a
 * quarter of a second at a time. The child is given a batch and hands back what it found; the
 * index stays here, written by the one process that has always written it, so nothing has to
 * reason about two writers.
 *
 * It is a convenience, not a dependency: if the child cannot be started, or stops answering, the
 * same work is done in this process instead. Slower, and the window feels it, but nothing fails.
 */
class HashPool {
  private child: UtilityProcess | null = null;
  private starting: Promise<UtilityProcess | null> | null = null;
  private batch = 0;
  private waiting = new Map<number, (answers: StampAnswer[]) => void>();
  /** Set once the child has proved unusable, so every later batch goes straight to this process. */
  private giveUp = false;

  private async open(): Promise<UtilityProcess | null> {
    if (this.child) return this.child;
    if (this.giveUp) return null;
    this.starting ??= (async () => {
      try {
        const entry = join(import.meta.dirname, 'hashWorker.js');
        const child = utilityProcess.fork(entry, [], { serviceName: 'tessera-hashes', stdio: 'ignore' });
        child.on('message', (m: { batch: number; done: { id: number; ok: boolean; stamp?: Stamp; error?: string }[] }) => {
          const settle = this.waiting.get(m.batch);
          if (!settle) return;
          this.waiting.delete(m.batch);
          const out: StampAnswer[] = [];
          for (const d of m.done) out[d.id] = d.ok && d.stamp ? { ok: true, stamp: d.stamp } : { ok: false, error: d.error ?? 'no answer' };
          settle(out);
        });
        child.on('exit', () => {
          this.child = null;
          this.starting = null;
          // Anything still waiting is answered as unknown; the caller does it here instead.
          for (const [, settle] of this.waiting) settle([]);
          this.waiting.clear();
        });
        this.child = child;
        return child;
      } catch (e) {
        log.warn('hashes', 'could not start the process that reads files; doing it here instead', e);
        this.giveUp = true;
        this.starting = null;
        return null;
      }
    })();
    return this.starting;
  }

  /** Here, in this process. What the child is spared, and what happens when there is no child. */
  private async hereInstead(files: StampAsk[]): Promise<StampAnswer[]> {
    const out: StampAnswer[] = [];
    for (const f of files) {
      try {
        out.push({ ok: true, stamp: await stampOne(f.packDir, f.ref, f.mode) });
      } catch (e) {
        out.push({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  }

  async stamp(files: StampAsk[]): Promise<StampAnswer[]> {
    if (!files.length) return [];
    const child = await this.open();
    if (!child) return this.hereInstead(files);
    const batch = ++this.batch;
    const answers = await new Promise<StampAnswer[]>((resolve) => {
      const timer = setTimeout(() => {
        if (!this.waiting.delete(batch)) return;
        log.warn('hashes', 'the process that reads files stopped answering; it will be restarted');
        child.kill();
        resolve([]);
      }, BATCH_TIMEOUT);
      this.waiting.set(batch, (a) => {
        clearTimeout(timer);
        resolve(a);
      });
      child.postMessage({ batch, files: files.map((f, id) => ({ id, ...f })) });
    });
    // An empty answer means the child went away mid-batch, not that there was nothing to do.
    return answers.length === files.length ? answers : this.hereInstead(files);
  }

  /** Let the child go when the app does, or when there is nothing left to read. */
  stop(): void {
    this.child?.kill();
    this.child = null;
    this.starting = null;
  }
}

export const hashes = new HashPool();
app?.on?.('will-quit', () => hashes.stop());
