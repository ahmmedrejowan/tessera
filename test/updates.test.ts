import { describe, expect, it } from 'vitest';
import { isNewer, installerFor, Updates } from '../src/main/updates';
import { parseChangelog, releaseFor } from '../src/shared/changelog';
import { tempDir } from './helpers';

describe('the changelog', () => {
  it('reads one entry per version, with what followed the heading', () => {
    const releases = parseChangelog(
      ['# What’s new', '', '## 0.2.0 — 12 October 2026', '', '- Downloads', '  from any link you bring', '- Site rules', '', '## 0.1.0 — in development', '', '- The first working version'].join('\n'),
    );
    expect(releases.map((r) => [r.version, r.when])).toEqual([
      ['0.2.0', '12 October 2026'],
      ['0.1.0', 'in development'],
    ]);
    // A wrapped line belongs to the item above it, not to a paragraph of its own.
    expect(releases[0]!.lines).toEqual(['- Downloads from any link you bring', '- Site rules']);
    expect(releaseFor(releases, '0.1.0')?.lines).toEqual(['- The first working version']);
    expect(releaseFor(releases, '9.9.9')).toBeUndefined();
  });
});

describe('looking for a newer Tessera', () => {
  it('compares versions the way people read them', () => {
    expect(isNewer('1.2.0', '1.1.9')).toBe(true);
    expect(isNewer('v0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('0.1.0', '0.2.0')).toBe(false);
    expect(isNewer('1.0.0', '1.0.0-beta.1')).toBe(true);
    expect(isNewer('1.0.0-beta.1', '1.0.0')).toBe(false);
  });

  it('picks the installer this computer needs', () => {
    const assets = [
      { name: 'Tessera-0.2.0.dmg', url: 'https://example.com/dmg', size: 1 },
      { name: 'Tessera-Setup-0.2.0.exe', url: 'https://example.com/exe', size: 2 },
      { name: 'Tessera-0.2.0.AppImage', url: 'https://example.com/appimage', size: 3 },
    ];
    expect(installerFor(assets, 'darwin')?.url).toBe('https://example.com/dmg');
    expect(installerFor(assets, 'win32')?.url).toBe('https://example.com/exe');
    expect(installerFor(assets, 'linux')?.url).toBe('https://example.com/appimage');
    expect(installerFor([], 'darwin')).toBeNull();
  });

  it('reads a published release, and says plainly when there is nowhere to look', async () => {
    const release = { tag_name: 'v0.3.0', html_url: 'https://example.com/r/0.3.0', body: 'Downloads page\nSite rules', published_at: '2026-09-22T00:00:00Z' };
    const seen: string[] = [];
    const updates = new Updates({
      version: '0.1.0',
      dir: tempDir('tessera-updates-'),
      platform: 'darwin',
      auto: () => false,
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

    const quiet = new Updates({ version: '0.1.0', dir: tempDir('tessera-updates-'), platform: 'darwin', auto: () => false, feed: '', fetch: () => Promise.reject(new Error('should not be asked')), onChanged: () => undefined });
    expect((await quiet.check()).error).toMatch(/nowhere to check/);
    expect(quiet.get().canCheck).toBe(false);
  });
});
