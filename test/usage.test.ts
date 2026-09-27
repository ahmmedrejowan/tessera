import { describe, expect, it } from 'vitest';
import { scoreOf, UsageStore } from '../src/main/usage';
import { tempDir } from './helpers';

describe('how much a pack is used', () => {
  it('counts a game higher than a look, and a look higher than a glance', () => {
    const now = Date.now();
    const at = new Date(now).toISOString();
    expect(scoreOf({ opened: 0, viewed: 0, linked: 1, lastAt: at }, now)).toBeGreaterThan(scoreOf({ opened: 0, viewed: 4, linked: 0, lastAt: at }, now));
    expect(scoreOf({ opened: 0, viewed: 1, linked: 0, lastAt: at }, now)).toBeGreaterThan(scoreOf({ opened: 1, viewed: 0, linked: 0, lastAt: at }, now));
  });

  it('lets what has gone quiet fall behind what is used now', () => {
    const now = Date.now();
    const old = new Date(now - 365 * 86_400_000).toISOString();
    const fresh = new Date(now).toISOString();
    expect(scoreOf({ opened: 20, viewed: 20, linked: 0, lastAt: old }, now)).toBeLessThan(scoreOf({ opened: 2, viewed: 2, linked: 0, lastAt: fresh }, now));
  });

  it('remembers across a restart, and forgets with the pack', async () => {
    const dir = tempDir();
    const first = new UsageStore();
    await first.open(dir);
    first.record('pack-a', 'linked');
    first.record('pack-b', 'opened');
    await first.close();

    const again = new UsageStore();
    await again.open(dir);
    expect(again.of('pack-a').linked).toBe(1);
    expect(again.ranked()[0]?.packId).toBe('pack-a');
    again.forget(['pack-a']);
    expect(again.of('pack-a').linked).toBe(0);
    await again.flush();
    await again.close();
  });
});
