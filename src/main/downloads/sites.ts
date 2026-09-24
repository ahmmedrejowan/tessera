/**
 * Turning a page the user brings into the file behind it. A link to an asset's page is what
 * people actually copy; only a handful of sites are known here, each by the way that site
 * publishes its downloads, and anything else is left alone for the queue to fetch as it is.
 *
 * When a site is known but its page has changed, that is said plainly: better than fetching a
 * page and calling it a pack.
 */

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Where the file really is, and what it should be called when the site says. */
export interface Resolved {
  url: string;
  name?: string;
}

const refuse = (message: string) => Object.assign(new Error(message), { permanent: true });
const UA = 'Tessera asset library';

/** A page that never answers must not hold a download up for ever. */
const PATIENCE = 20_000;

const text = async (fetch: Fetch, url: string): Promise<string> => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json' }, signal: AbortSignal.timeout(PATIENCE) });
  if (!res.ok) throw refuse(`That page answered ${res.status}.`);
  return res.text();
};

const json = async (fetch: Fetch, url: string): Promise<unknown> => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(PATIENCE) });
  if (!res.ok) throw refuse(`${new URL(url).hostname} answered ${res.status}.`);
  return res.json();
};

/** Links in a page's HTML, in the order they appear. */
const hrefs = (html: string): string[] => [...html.matchAll(/href\s*=\s*"([^"]+)"/gi)].map((m) => m[1]!);

const host = (u: URL) => u.hostname.replace(/^www\./, '');

interface Handler {
  id: string;
  /** This link is one of the site's pages (not already a file). */
  match: (u: URL) => boolean;
  find: (u: URL, fetch: Fetch) => Promise<Resolved>;
}

const HANDLERS: Handler[] = [
  {
    // Dropbox share links hand over a preview page unless asked for the file.
    id: 'dropbox',
    match: (u) => host(u).endsWith('dropbox.com') && !u.searchParams.get('raw'),
    find: (u) => {
      const at = new URL(u.toString());
      at.searchParams.set('dl', '1');
      return Promise.resolve({ url: at.toString() });
    },
  },
  {
    // A Google Drive file page: the file itself is behind a download address.
    id: 'google-drive',
    match: (u) => host(u) === 'drive.google.com' && /\/file\/d\/[^/]+/.test(u.pathname),
    find: (u) => {
      const id = /\/file\/d\/([^/]+)/.exec(u.pathname)?.[1];
      if (!id) throw refuse('That Google Drive link has no file in it.');
      return Promise.resolve({ url: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` });
    },
  },
  {
    // A GitHub release page: take what the release publishes, preferring an archive.
    id: 'github',
    match: (u) => host(u) === 'github.com' && /\/releases(\/(latest|tag\/.+))?$/.test(u.pathname),
    find: async (u, fetch) => {
      const [, owner, repo] = /^\/([^/]+)\/([^/]+)/.exec(u.pathname) ?? [];
      if (!owner || !repo) throw refuse('That GitHub link has no project in it.');
      const tag = /\/releases\/tag\/(.+)$/.exec(u.pathname)?.[1];
      const api = `https://api.github.com/repos/${owner}/${repo}/releases/${tag ? `tags/${tag}` : 'latest'}`;
      const release = (await json(fetch, api)) as { assets?: { name: string; browser_download_url: string; size: number }[]; zipball_url?: string; tag_name?: string };
      const assets = release.assets ?? [];
      const best = assets.find((a) => /\.(zip|7z|tar\.gz|tgz|unitypackage)$/i.test(a.name)) ?? assets[0];
      if (best) return { url: best.browser_download_url, name: best.name };
      if (release.zipball_url) return { url: release.zipball_url, name: `${repo}-${release.tag_name ?? 'source'}.zip` };
      throw refuse('That release has no files to download.');
    },
  },
  {
    // Kenney's asset pages name the zip right on the page.
    id: 'kenney',
    match: (u) => host(u) === 'kenney.nl' && u.pathname.startsWith('/assets/'),
    find: async (u, fetch) => {
      const zip = hrefs(await text(fetch, u.toString())).find((h) => /\.zip($|\?)/i.test(h));
      if (!zip) throw refuse('Couldn’t find the download on that Kenney page. Open it in your browser and bring the file’s link.');
      return { url: new URL(zip, u).toString() };
    },
  },
  {
    // Poly Haven publishes its files through an API, at several sizes.
    id: 'poly-haven',
    match: (u) => host(u) === 'polyhaven.com' && /^\/a\/[^/]+$/.test(u.pathname),
    find: async (u, fetch) => {
      const slug = u.pathname.split('/')[2]!;
      const files = (await json(fetch, `https://api.polyhaven.com/files/${slug}`)) as Record<string, unknown>;
      // A whole .blend brings its textures with it; then glTF; then the plain map or HDRI.
      const found = pickPolyHaven(files);
      if (!found) throw refuse('Poly Haven didn’t offer a file for that page.');
      return { url: found, name: `${slug}${/\.[a-z0-9]+$/i.exec(found)?.[0] ?? ''}` };
    },
  },
  {
    // ambientCG names its zips after the material and the size.
    id: 'ambientcg',
    match: (u) => host(u) === 'ambientcg.com' && (u.pathname === '/view' || u.pathname.startsWith('/view/')),
    find: (u) => {
      const id = u.searchParams.get('id') ?? u.pathname.split('/')[2];
      if (!id) throw refuse('That ambientCG link has no material in it.');
      return Promise.resolve({ url: `https://ambientcg.com/get?file=${id}_2K-JPG.zip`, name: `${id}_2K-JPG.zip` });
    },
  },
  {
    // OpenGameArt keeps its files alongside the page.
    id: 'opengameart',
    match: (u) => host(u) === 'opengameart.org' && u.pathname.startsWith('/content/'),
    find: async (u, fetch) => {
      const file = hrefs(await text(fetch, u.toString())).find((h) => h.includes('/sites/default/files/') && /\.(zip|7z|rar|png|ogg|wav|glb|fbx|blend|tar\.gz)($|\?)/i.test(h));
      if (!file) throw refuse('Couldn’t find the download on that OpenGameArt page. Open it in your browser and bring the file’s link.');
      return { url: new URL(file, u).toString() };
    },
  },
];

/** The best file Poly Haven's listing offers: a whole scene first, then glTF, then a 2K map. */
function pickPolyHaven(files: Record<string, unknown>): string | null {
  const at = (path: string[]): unknown => path.reduce<unknown>((o, key) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined), files);
  const url = (v: unknown) => (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string' ? (v as { url: string }).url : null);
  for (const path of [
    ['blend', '2k', 'blend'],
    ['blend', '1k', 'blend'],
    ['gltf', '2k', 'gltf'],
    ['hdri', '2k', 'hdr'],
    ['hdri', '1k', 'hdr'],
    ['Diffuse', '2k', 'jpg'],
    ['diffuse', '2k', 'jpg'],
  ]) {
    const found = url(at(path));
    if (found) return found;
  }
  return null;
}

/** The site a link belongs to, when Tessera knows how that site publishes its downloads. */
export const siteFor = (url: string): string | null => {
  try {
    const u = new URL(url);
    return HANDLERS.find((h) => h.match(u))?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * The file behind a page, for the sites Tessera knows. Returns null when the link is already a
 * file, or belongs to no site it knows, the queue then fetches it as it is.
 */
export async function resolveLink(url: string, fetch: Fetch): Promise<Resolved | null> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const handler = HANDLERS.find((h) => h.match(u));
  return handler ? handler.find(u, fetch) : null;
}
