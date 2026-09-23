/**
 * Links the user brought: typed, pasted one per line, or inside a file they dropped, a text or
 * CSV list, a JSON file, a browser's bookmarks export, or a .url shortcut. Only web links count.
 */

const LINK = /https?:\/\/[^\s"'<>)\]}]+/gi;
/** Punctuation that ends a sentence or a list, not a link. */
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** Every web link in some text, in the order they appear and without repeats. */
export function linksIn(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    // A comment in a list of links.
    if (/^\s*[#;]/.test(line)) continue;
    for (const raw of line.match(LINK) ?? []) {
      const url = raw.replace(TRAILING, '');
      if (!seen.has(url) && isWebLink(url)) {
        seen.add(url);
        out.push(url);
      }
    }
  }
  return out;
}

/** Only http and https, and only with a host: nothing local, nothing to run. */
export function isWebLink(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/** The site a link is on, for showing before anything is fetched. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** The file name a link suggests: the last part of its path, without the query. */
export function nameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
    return last.trim();
  } catch {
    return '';
  }
}
