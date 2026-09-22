import { describe, expect, it } from 'vitest';
import { resolveLink, siteFor } from '../src/main/downloads/sites';

/** A stand-in for the web: what each address answers with, and what was asked for. */
function web(pages: Record<string, unknown>) {
  const asked: string[] = [];
  const fetch = (url: string) => {
    asked.push(url);
    const body = pages[url];
    if (body === undefined) return Promise.resolve(new Response('no', { status: 404 }));
    return Promise.resolve(typeof body === 'string' ? new Response(body, { headers: { 'content-type': 'text/html' } }) : new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
  };
  return { fetch, asked };
}

describe('the file behind a page', () => {
  it('leaves links it knows nothing about alone', async () => {
    const { fetch, asked } = web({});
    expect(await resolveLink('https://example.com/pack.zip', fetch)).toBeNull();
    expect(await resolveLink('not a link', fetch)).toBeNull();
    expect(asked).toEqual([]);
    expect(siteFor('https://kenney.nl/assets/city-kit')).toBe('kenney');
    expect(siteFor('https://example.com/a.zip')).toBeNull();
  });

  it('asks Dropbox and Google Drive for the file instead of the page', async () => {
    const { fetch } = web({});
    expect((await resolveLink('https://www.dropbox.com/s/abc/pack.zip?dl=0', fetch))?.url).toBe('https://www.dropbox.com/s/abc/pack.zip?dl=1');
    expect((await resolveLink('https://drive.google.com/file/d/1AbC/view?usp=sharing', fetch))?.url).toBe('https://drive.usercontent.google.com/download?id=1AbC&export=download&confirm=t');
  });

  it('takes the archive a GitHub release publishes', async () => {
    const { fetch } = web({
      'https://api.github.com/repos/kenney/packs/releases/latest': {
        tag_name: 'v2',
        assets: [
          { name: 'notes.txt', browser_download_url: 'https://github.com/notes.txt', size: 10 },
          { name: 'city-kit.zip', browser_download_url: 'https://github.com/city-kit.zip', size: 900 },
        ],
      },
    });
    expect(await resolveLink('https://github.com/kenney/packs/releases/latest', fetch)).toEqual({ url: 'https://github.com/city-kit.zip', name: 'city-kit.zip' });
  });

  it('reads the zip off a Kenney page, and says so when the page has changed', async () => {
    const page = '<a href="/media/pages/assets/city-kit/abc123/kenney_city-kit.zip">Download</a>';
    const { fetch } = web({ 'https://kenney.nl/assets/city-kit': page });
    expect((await resolveLink('https://kenney.nl/assets/city-kit', fetch))?.url).toBe('https://kenney.nl/media/pages/assets/city-kit/abc123/kenney_city-kit.zip');

    const changed = web({ 'https://kenney.nl/assets/city-kit': '<p>Nothing here</p>' });
    await expect(resolveLink('https://kenney.nl/assets/city-kit', changed.fetch)).rejects.toThrow(/Couldn’t find the download/);
  });

  it('picks a whole scene from Poly Haven when there is one', async () => {
    const { fetch } = web({
      'https://api.polyhaven.com/files/rock_04': { blend: { '2k': { blend: { url: 'https://dl.polyhaven.org/rock_04_2k.blend' } } }, Diffuse: { '2k': { jpg: { url: 'https://dl.polyhaven.org/rock_04_diff.jpg' } } } },
      'https://api.polyhaven.com/files/kloofendal': { hdri: { '2k': { hdr: { url: 'https://dl.polyhaven.org/kloofendal_2k.hdr' } } } },
    });
    expect(await resolveLink('https://polyhaven.com/a/rock_04', fetch)).toEqual({ url: 'https://dl.polyhaven.org/rock_04_2k.blend', name: 'rock_04.blend' });
    expect((await resolveLink('https://polyhaven.com/a/kloofendal', fetch))?.url).toBe('https://dl.polyhaven.org/kloofendal_2k.hdr');
  });

  it('builds ambientCG’s zip name from the material', async () => {
    const { fetch, asked } = web({});
    expect(await resolveLink('https://ambientcg.com/view?id=Bricks076', fetch)).toEqual({ url: 'https://ambientcg.com/get?file=Bricks076_2K-JPG.zip', name: 'Bricks076_2K-JPG.zip' });
    expect(asked).toEqual([]);
  });

  it('finds the file on an OpenGameArt page', async () => {
    const { fetch } = web({ 'https://opengameart.org/content/forest-tiles': '<a href="/comment">Reply</a><a href="https://opengameart.org/sites/default/files/forest-tiles.zip">forest-tiles.zip</a>' });
    expect((await resolveLink('https://opengameart.org/content/forest-tiles', fetch))?.url).toBe('https://opengameart.org/sites/default/files/forest-tiles.zip');
  });
});
