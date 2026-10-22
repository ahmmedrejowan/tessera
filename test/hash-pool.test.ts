/**
 * Handing the reading of files to another process, and what happens when that process is not there.
 *
 * The pool is a convenience rather than a dependency: whatever goes wrong with the child, the same
 * answers have to come back, because the alternative is a library that stops being read. Every way
 * the child can let us down is here, since in production the child is the path that runs and in the
 * rest of the suite it is the one that never does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Shared with the mock factories below, which are hoisted above everything else in this file. */
const state = vi.hoisted(() => ({
  /** How the pretend child behaves: answer properly, die mid-batch, say nothing, or answer short. */
  mode: 'answer' as 'answer' | 'die' | 'silent' | 'short',
  /** Set when the child cannot be started at all. */
  forkThrows: false,
  forks: 0,
  killed: 0,
  posted: [] as { batch: number; files: { id: number }[] }[],
  /** Every file the main process read itself, rather than handing over. */
  readHere: [] as string[],
}));

vi.mock('electron', () => {
  const on = new Map<string, (...args: unknown[]) => void>();
  const child = {
    on(event: string, cb: (...args: unknown[]) => void) {
      on.set(event, cb);
      return child;
    },
    postMessage(m: { batch: number; files: { id: number }[] }) {
      state.posted.push(m);
      if (state.mode === 'silent') return;
      queueMicrotask(() => {
        if (state.mode === 'die') {
          on.get('exit')?.();
          return;
        }
        // "short" answers all but one, which is the shape of a child that went away part way.
        const files = state.mode === 'short' ? m.files.slice(0, -1) : m.files;
        on.get('message')?.({
          batch: m.batch,
          done: files.map((f) => ({ id: f.id, ok: true, stamp: { size: 1, crc32: 2, sha256: 'from the child' } })),
        });
      });
    },
    kill() {
      state.killed += 1;
      on.get('exit')?.();
    },
  };
  return {
    app: { on: () => undefined },
    utilityProcess: {
      fork: () => {
        state.forks += 1;
        if (state.forkThrows) throw new Error('no process for you');
        return child;
      },
    },
  };
});

vi.mock('../src/main/index/stamp', () => ({
  stampOne: async (_packDir: string, ref: string) => {
    state.readHere.push(ref);
    return { size: 9, crc32: 9, sha256: 'read here instead' };
  },
}));

/** A pool nobody has used yet: the module keeps one, and giving up is remembered on it. */
async function freshPool() {
  vi.resetModules();
  state.mode = 'answer';
  state.forkThrows = false;
  state.forks = 0;
  state.killed = 0;
  state.posted = [];
  state.readHere = [];
  return (await import('../src/main/index/hashPool')).hashes;
}

const three = [
  { packDir: '/packs/one', ref: 'a.png', mode: 'stamp' as const },
  { packDir: '/packs/one', ref: 'b.png', mode: 'stamp' as const },
  { packDir: '/packs/one', ref: 'c.png', mode: 'settle' as const },
];

afterEach(() => vi.useRealTimers());

describe('reading files somewhere else', () => {
  it('asks the child, and hands back what it said', async () => {
    const pool = await freshPool();
    const out = await pool.stamp(three);

    expect(out).toHaveLength(3);
    expect(out.every((a) => a.ok)).toBe(true);
    expect(out.map((a) => (a.ok ? a.stamp.sha256 : ''))).toEqual(Array(3).fill('from the child'));
    // Nothing was read in this process, which is the whole point of the exercise.
    expect(state.readHere).toEqual([]);
    expect(state.posted[0]?.files).toHaveLength(3);
  });

  it('starts the child once and keeps it for the batches after', async () => {
    const pool = await freshPool();
    await pool.stamp(three);
    await pool.stamp(three);

    expect(state.forks).toBe(1);
    expect(state.posted).toHaveLength(2);
    // Each batch is its own conversation, so the answers cannot be crossed.
    expect(state.posted[0]!.batch).not.toBe(state.posted[1]!.batch);
  });

  it('reads them here when the child cannot be started', async () => {
    const pool = await freshPool();
    state.forkThrows = true;
    const out = await pool.stamp(three);

    expect(out.map((a) => (a.ok ? a.stamp.sha256 : ''))).toEqual(Array(3).fill('read here instead'));
    expect(state.readHere).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('does not keep trying to start a child that will not start', async () => {
    const pool = await freshPool();
    state.forkThrows = true;
    await pool.stamp(three);
    await pool.stamp(three);

    expect(state.forks).toBe(1);
  });

  it('reads them here when the child dies part way through', async () => {
    const pool = await freshPool();
    state.mode = 'die';
    const out = await pool.stamp(three);

    expect(out.map((a) => (a.ok ? a.stamp.sha256 : ''))).toEqual(Array(3).fill('read here instead'));
    expect(state.readHere).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('reads them here when the child answers for only some of them', async () => {
    const pool = await freshPool();
    state.mode = 'short';
    const out = await pool.stamp(three);

    // A partial answer is no answer: taking it would leave a file with nothing recorded for it.
    expect(out).toHaveLength(3);
    expect(out.map((a) => (a.ok ? a.stamp.sha256 : ''))).toEqual(Array(3).fill('read here instead'));
  });

  it('starts a child again after one has died', async () => {
    const pool = await freshPool();
    state.mode = 'die';
    await pool.stamp(three);
    state.mode = 'answer';
    const out = await pool.stamp(three);

    expect(state.forks).toBe(2);
    expect(out.map((a) => (a.ok ? a.stamp.sha256 : ''))).toEqual(Array(3).fill('from the child'));
  });

  it('gives up on a child that stops answering, and reads them here', async () => {
    vi.useFakeTimers();
    const pool = await freshPool();
    state.mode = 'silent';

    const answering = pool.stamp(three);
    await vi.advanceTimersByTimeAsync(120_000);
    const out = await answering;

    expect(state.killed).toBeGreaterThan(0);
    expect(out.map((a) => (a.ok ? a.stamp.sha256 : ''))).toEqual(Array(3).fill('read here instead'));
  });

  it('asks nobody anything when there is nothing to read', async () => {
    const pool = await freshPool();
    const out = await pool.stamp([]);

    expect(out).toEqual([]);
    expect(state.forks).toBe(0);
    expect(state.posted).toEqual([]);
  });

  it('lets the child go when it is told to', async () => {
    const pool = await freshPool();
    await pool.stamp(three);
    pool.stop();

    expect(state.killed).toBe(1);
    // And the next batch starts a new one rather than talking to a process that has gone.
    await pool.stamp(three);
    expect(state.forks).toBe(2);
  });
});
