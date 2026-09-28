import { describe, expect, it } from 'vitest';
import { HUGE, LARGE, recommend, secondThought, SMALL, whyRecommended } from '@shared/keeping';

const GB = 1024 * 1024 * 1024;
const gb = (n: number) => `${Math.round(n / GB)} GB`;

describe('what to put forward', () => {
  it('copies a download and reads a drive where it lies', () => {
    // The common case, and the one the default must serve: a kit somebody just downloaded.
    expect(recommend(200 * 1024 * 1024, true)).toBe('copy');
    expect(recommend(SMALL, true)).toBe('copy');
    // Enough that a second copy is a real cost.
    expect(recommend(LARGE, true)).toBe('keep');
    expect(recommend(300 * GB, true)).toBe('keep');
  });

  it('never suggests reading in place what cannot be read in place', () => {
    // Archives and loose files have no folder of their own to stand for the pack.
    expect(recommend(300 * GB, false)).toBe('copy');
    expect(whyRecommended(300 * GB, false)).toBeNull();
  });

  it('says why, but only when the answer is not the obvious one', () => {
    expect(whyRecommended(200 * 1024 * 1024, true)).toBeNull();
    expect(whyRecommended(300 * GB, true)).toMatch(/second copy/);
  });
});

describe('when to stop and ask', () => {
  it('stops before copying a great deal that need not be copied', () => {
    const doubt = secondThought('copy', 200 * GB, true, gb);
    expect(doubt?.title).toBe('That is 200 GB to copy');
    expect(doubt?.instead).toBe('keep');
    // And offers the way out, rather than only the objection.
    expect(doubt?.insteadLabel).toMatch(/where they are/);
  });

  it('stops before leaving something small out of the backups for no reason', () => {
    const doubt = secondThought('keep', 500 * 1024 * 1024, true, gb);
    expect(doubt?.instead).toBe('copy');
    expect(doubt?.body).toMatch(/backed up/);
  });

  it('stops before a move big enough to need room for both at once', () => {
    expect(secondThought('move', 80 * GB, false, gb)?.instead).toBe('copy');
  });

  it('says nothing about an ordinary answer, so the ones it does raise are read', () => {
    expect(secondThought('copy', 500 * 1024 * 1024, true, gb)).toBeNull();
    expect(secondThought('copy', LARGE, true, gb)).toBeNull();
    expect(secondThought('keep', 300 * GB, true, gb)).toBeNull();
    expect(secondThought('move', 1 * GB, false, gb)).toBeNull();
    // A big copy of something that could not be read in place anyway: there is nothing to offer,
    // so there is nothing to say.
    expect(secondThought('copy', HUGE, false, gb)).toBeNull();
  });
});
