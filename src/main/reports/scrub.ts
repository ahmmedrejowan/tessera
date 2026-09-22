/**
 * Cleaning text before it can leave the computer in an error report.
 *
 * Paths are the main risk: they carry the user's name (the home folder) and the names of their
 * packs and files. Known folders become tokens (`~`, `<library>`, `<data>`, `<temp>`), and everything
 * after a token is reduced to `…` plus the file extension, which is what helps with a bug. Tessera's
 * own code keeps its paths (under `app://`), so stack traces stay readable. Quoted names, email
 * addresses, device IDs, IP addresses and URL queries go too.
 */

export interface ScrubRoots {
  /** Where Tessera's own code lives (the app.asar, or the project folder in development). */
  app: string;
  home: string;
  data: string;
  temp: string;
  library: string | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A root in both slash styles, so a Windows path written either way is found. */
function rootPattern(root: string): string {
  const trimmed = root.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]/).map(escape);
  return parts.join('[\\\\/]');
}

/** What's worth keeping of a path's last segment: its extension, when it looks like one. */
function tail(rest: string): string {
  const last = rest.split(/[\\/]/).filter(Boolean).at(-1) ?? '';
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(last)?.[1];
  return ext ? `/….${ext.toLowerCase()}` : rest ? '/…' : '';
}

// Characters that end a path in running text (quotes are handled separately, as a whole).
const SEG = String.raw`[^\s'"“”‘’\`()<>,;|\\/]+`;

export function makeScrubber(roots: ScrubRoots): (text: string) => string {
  const tokens: [RegExp, string][] = [];
  const add = (root: string | null, token: string) => {
    if (root && root.length > 1) tokens.push([new RegExp(String.raw`(?<![\w.-])${rootPattern(root)}(?![\w.-])`, 'gi'), token]);
  };
  // Longest first, so a library inside the home folder becomes <library>, not ~/….
  const ordered = [
    [roots.app, 'app:/'],
    [roots.library, '<library>'],
    [roots.data, '<data>'],
    [roots.temp, '<temp>'],
    [roots.home, '~'],
  ] as const;
  for (const [root, token] of [...ordered].sort((a, b) => (b[0]?.length ?? 0) - (a[0]?.length ?? 0))) add(root, token);

  return (input: string): string => {
    let text = input;
    // file:// URLs are paths too.
    text = text.replace(/file:\/\/\/?/gi, '/');
    for (const [re, token] of tokens) text = text.replace(re, token);
    // The app's own paths, written the same way on every system.
    text = text.replace(/app:\/[\\/][^\s)'"]*/g, (m) => `app://${m.slice(5).replace(/\\/g, '/').replace(/^\/+/, '')}`);

    // A quoted path or name, which may contain spaces: keep only what's safe.
    text = text.replace(/(['"“‘`])([^'"“”‘’`\n]{1,400})(['"”’`])/g, (_m, open: string, inner: string, close: string) => {
      if (inner.startsWith('app://')) return open + inner + close;
      const token = /^(<library>|<data>|<temp>|~)(?=[\\/]|$)/.exec(inner)?.[1];
      if (token) return open + token + tail(inner.slice(token.length)) + close;
      if (/^([A-Za-z]:[\\/]|\/|\\\\)/.test(inner)) return `${open}<path>${tail(inner)}${close}`;
      // Any other quoted text in a message is usually a name: a pack, a file, a library.
      return /^[a-z-]+$/.test(inner) ? open + inner + close : `${open}…${close}`;
    });

    // Unquoted paths after a token.
    text = text.replace(new RegExp(String.raw`(<library>|<data>|<temp>|~)((?:[\\/]${SEG})+)`, 'g'), (_m, token: string, rest: string) => token + tail(rest));
    // Other absolute paths: Unix, Windows drive and network ones. Not URLs, not app:// paths.
    text = text.replace(new RegExp(String.raw`(?<![\w.:/\\<>~-])/(?:${SEG}/)+(?:${SEG})?`, 'g'), (m) => `<path>${tail(m)}`);
    text = text.replace(new RegExp(String.raw`\b[A-Za-z]:[\\/](?:${SEG}[\\/]?)*`, 'g'), (m) => `<path>${tail(m)}`);
    text = text.replace(new RegExp(String.raw`\\\\${SEG}(?:\\${SEG})*`, 'g'), (m) => `<path>${tail(m)}`);

    text = text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>');
    text = text.replace(/\b[A-Z2-7]{7}(-[A-Z2-7]{7}){7}\b/g, '<device>');
    text = text.replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>');
    text = text.replace(/(https?:\/\/[^\s?#'"]+)[?#][^\s'"]*/g, '$1');
    return text;
  };
}
