/**
 * Reading how far a backup has got out of what Kopia says while it works.
 *
 * Kopia redraws a single line as it goes, and the shape of that line is its business, not ours.
 * So nothing here insists on the whole of it: each number is looked for on its own, and a line
 * that holds none of them is not a progress line. What matters is the direction of the mistake.
 * A Kopia that words this differently should lose the bar and keep the backup, never show a
 * number that was invented, and never take a line of plain output for progress.
 */
import { describe, expect, it } from 'vitest';
import { readProgress } from '../src/main/backup/kopia';

/**
 * Taken from what Kopia 0.23.1 actually wrote, captured from a real snapshot rather than written
 * from memory of the documentation. The spinner at the front of each is Kopia redrawing one line.
 */
const REAL = [
  '| 7 hashing, 0 hashed (2.7 KB), 0 cached (0 B), uploaded 0 B, estimating...',
  '/ 1 hashing, 134 hashed (277.6 MB), 0 cached (0 B), uploaded 195 B, estimating...',
  '* 0 hashing, 284 hashed (323.3 MB), 0 cached (0 B), uploaded 195 B, estimating...',
];

// Once it has seen enough to estimate, Kopia adds "estimated <size> (<percent>)" and a time left.
const FULL = '* 0 hashing, 812 hashed (1.2 GB), 44 cached (90 MB), uploaded 503.1 MB, estimated 7.6 GB (15.8%) 25m0s left';
// The state a first backup of a big library spends most of its time in.
const EARLY = REAL[1]!;

describe('how far a backup has got', () => {
  it('reads every number in the line, not only the fraction', () => {
    const p = readProgress(FULL)!;
    expect(p.done).toBeCloseTo(0.158, 3);
    expect(p.uploaded).toBe(503.1e6);
    expect(p.total).toBe(7.6e9);
    expect(p.hashed).toBe(1.2e9);
    expect(p.hashedFiles).toBe(812);
    expect(p.cached).toBe(90e6);
    expect(p.cachedFiles).toBe(44);
    expect(p.hashing).toBe(0);
    expect(p.left).toBe('25m0s');
  });

  it('tells the three sizes in one line apart', () => {
    // hashed, cached and uploaded all look alike; mixing them up would report the wrong thing
    // as sent, which is the number somebody waiting is actually watching.
    const p = readProgress('* 2 hashing, 5 hashed (111 MB), 7 cached (222 MB), uploaded 333 MB, estimated 444 MB (75%) 1m2s left')!;
    expect(p.hashed).toBe(111e6);
    expect(p.cached).toBe(222e6);
    expect(p.uploaded).toBe(333e6);
    expect(p.total).toBe(444e6);
    expect(p.hashedFiles).toBe(5);
    expect(p.cachedFiles).toBe(7);
    expect(p.hashing).toBe(2);
  });

  it('gives no fraction while Kopia is still working out how much there is', () => {
    const p = readProgress(EARLY)!;
    // The bar cannot move yet, but the line can still say what has gone up.
    expect(p.done).toBeNull();
    expect(p.uploaded).toBe(195);
    expect(p.hashed).toBe(277.6e6);
    expect(p.left).toBeNull();
  });

  it('reads every line a real backup wrote', () => {
    // The guard against a parser that works only on the example in its own comment.
    for (const line of REAL) expect(readProgress(line), line).not.toBeNull();
    expect(readProgress(REAL[0]!)!.uploaded).toBe(0);
    expect(readProgress(REAL[0]!)!.hashed).toBe(2.7e3);
  });

  it('is not fooled by a line that is not about progress', () => {
    expect(readProgress('Connecting to repository...')).toBeNull();
    expect(readProgress('Snapshotting rejowan@mac:/Users/rejowan/Documents/Tessera/Main Library')).toBeNull();
    expect(readProgress('ERROR error uploading: context deadline exceeded')).toBeNull();
    expect(readProgress('')).toBeNull();
  });

  it('keeps a fraction inside its bounds whatever it is handed', () => {
    expect(readProgress('estimated 1 GB (0%)')!.done).toBe(0);
    expect(readProgress('estimated 1 GB (100%)')!.done).toBe(1);
    // Kopia's estimate can be overshot on a library that grew while it ran.
    expect(readProgress('estimated 1 GB (142.5%)')!.done).toBe(1);
  });

  it('understands both ways of saying a size', () => {
    expect(readProgress('uploaded 1 GB, estimated 2 GB (50%)')!.uploaded).toBe(1e9);
    expect(readProgress('uploaded 1 GiB, estimated 2 GiB (50%)')!.uploaded).toBe(1024 ** 3);
    expect(readProgress('uploaded 512 B, estimated 1 KB (50%)')!.uploaded).toBe(512);
  });

  it('takes the part it understands when the rest has changed', () => {
    // A later Kopia that drops the estimate but still says what it sent.
    const p = readProgress('* 0 hashing, 9 hashed (10 MB), 0 cached (0 B), uploaded 7.5 MB')!;
    expect(p.done).toBeNull();
    expect(p.uploaded).toBe(7.5e6);
  });
});
