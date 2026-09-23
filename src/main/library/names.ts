/**
 * Folder names that are valid on macOS, Windows and Linux alike, so a library copied or synced
 * between them never hits a name one of them refuses.
 */

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const MAX = 80;

const isControl = (ch: string) => {
  const code = ch.charCodeAt(0);
  return code < 32 || code === 127;
};

export function safeFolderName(name: string): string {
  let s = [...name.normalize('NFC')]
    .filter((ch) => !isControl(ch))
    .join('')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (s.length > MAX) s = s.slice(0, MAX).replace(/[. ]+$/, '');
  if (!s || /^\.+$/.test(s)) s = 'Untitled';
  if (RESERVED.test(s)) s = `${s}_`;
  return s;
}

/** `name`, or `name 2`, `name 3`…, the first that `taken` says is free. */
export function uniqueName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} ${i}`;
    if (!taken(candidate)) return candidate;
  }
}
