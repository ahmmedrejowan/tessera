import { BrowserWindow, net, session } from 'electron';
import { UserError } from '../errors';

const web = (url: string) => /^https?:\/\//i.test(url);

let prepared = false;
/** Pages are opened in a session of their own: nothing stored, nothing downloaded. */
function snapshotSession() {
  const ses = session.fromPartition('page-snapshot');
  if (!prepared) {
    prepared = true;
    ses.on('will-download', (_e, item) => item.cancel());
    ses.setPermissionRequestHandler((_wc, _perm, done) => done(false));
  }
  return ses;
}

const within = <T>(ms: number, p: Promise<T>, what: string) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new UserError('page-timeout', `${what} took too long.`)), ms))]);

/**
 * A pack's download page as a PDF, kept with its licence proof: what the page said about the
 * licence when the pack was downloaded. Opened in a hidden window with its own empty session.
 */
export async function snapshotPage(url: string): Promise<Buffer> {
  if (!web(url)) throw new UserError('not-a-page', 'Only web pages can be saved.');
  const win = new BrowserWindow({ show: false, width: 1280, height: 1000, webPreferences: { session: snapshotSession(), sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.setAudioMuted(true);
  try {
    await within(45_000, win.loadURL(url), 'Opening the page');
    // Pages that fill in after loading get a moment.
    await new Promise((r) => setTimeout(r, 2000));
    return Buffer.from(await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' }));
  } catch (e) {
    throw e instanceof UserError ? e : new UserError('page-failed', `The page couldn’t be opened: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    win.destroy();
  }
}

/**
 * Ask the Internet Archive's Wayback Machine to keep a public copy of a page, and return where
 * that copy is. When saving isn't possible (the page refuses, or archive.org is busy), the latest
 * copy it already has will do.
 */
export async function archivePage(url: string): Promise<{ url: string; fresh: boolean }> {
  if (!web(url)) throw new UserError('not-a-page', 'Only web pages can be archived.');
  try {
    const res = await net.fetch(`https://web.archive.org/save/${url}`, { signal: AbortSignal.timeout(120_000), headers: { 'User-Agent': 'Tessera asset library' } });
    const at = /\/web\/\d{14}/.test(res.url) ? res.url : res.headers.get('content-location');
    if (res.ok && at) return { url: at.startsWith('http') ? at : `https://web.archive.org${at}`, fresh: true };
  } catch {
    // Fall back to an existing copy below.
  }
  const res = await net.fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(30_000) });
  const body = (await res.json().catch(() => null)) as { archived_snapshots?: { closest?: { url?: string; available?: boolean } } } | null;
  const closest = body?.archived_snapshots?.closest;
  if (closest?.available && closest.url) return { url: closest.url.replace(/^http:/, 'https:'), fresh: false };
  throw new UserError('archive-failed', 'archive.org couldn’t save the page right now.');
}
