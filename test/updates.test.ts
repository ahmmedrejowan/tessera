import { describe, expect, it } from 'vitest';
import { isNewer, Updates } from '../src/main/updates';

describe('looking for a newer Tessera', () => {
  it('compares versions the way people read them', () => {
    expect(isNewer('1.2.0', '1.1.9')).toBe(true);
    expect(isNewer('v0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('0.1.0', '0.2.0')).toBe(false);
    expect(isNewer('1.0.0', '1.0.0-beta.1')).toBe(true);
    expect(isNewer('1.0.0-beta.1', '1.0.0')).toBe(false);
  });

  it('reads a published release, and says plainly when there is nowhere to look', async () => {
    const release = { tag_name: 'v0.3.0', html_url: 'https://example.com/r/0.3.0', body: 'Downloads page\nSite rules', published_at: '2026-09-22T00:00:00Z' };
    const seen: string[] = [];
    const updates = new Updates({
      version: '0.1.0',
      feed: 'https://api.example.com/releases/latest',
      fetch: (url) => {
        seen.push(url);
        return Promise.resolve(new Response(JSON.stringify(release), { headers: { 'content-type': 'application/json' } }));
      },
      onChanged: () => undefined,
    });
    const status = await updates.check();
    expect(status).toMatchObject({ latest: '0.3.0', newer: true, url: 'https://example.com/r/0.3.0', error: null, canCheck: true });
    expect(status.notes).toBe('Downloads page\nSite rules');
    expect(seen).toEqual(['https://api.example.com/releases/latest']);

    const quiet = new Updates({ version: '0.1.0', feed: '', fetch: () => Promise.reject(new Error('should not be asked')), onChanged: () => undefined });
    expect((await quiet.check()).error).toMatch(/nowhere to check/);
    expect(quiet.get().canCheck).toBe(false);
  });
});
