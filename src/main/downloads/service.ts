/**
 * Downloads: links the user brings, fetched into Tessera's own folder and then added to the
 * library like any other pack. A few at a time, each one resumable, and nothing is ever run: 
 * a download is a file on disk until the user (or the library's own rule) adds it.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { hostLabel, isWebLink, linksIn, nameFromUrl } from '@shared/links';
import type { DownloadItem, DownloadState } from '@shared/types';
import { resolveLink } from './sites';
import { readJson, writeJson } from '../fsx';
import { log } from '../log';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

interface Deps {
  /** Where downloads are kept until they're added or cleared (inside the app's data folder). */
  dir: string;
  fetch: Fetch;
  /** How many may run at once (the user's setting). */
  atOnce?: () => number;
  /** Something about the list changed: the window should show it. */
  onChanged: () => void;
  /** A download finished. */
  onReady: (item: DownloadItem) => void;
}

/** Enough at once to keep a connection busy, few enough to stay polite to a site. */
const AT_ONCE = 3;
const UA = 'Tessera asset library';
/** Links pasted in one go; more than this is a mistake, not a batch. */
export const MOST_AT_ONCE = 500;
/** A dropped connection is worth another go; how long to wait before each. */
const WAITS = [2_000, 8_000, 20_000];

const nowIso = () => new Date().toISOString();
const sizeOf = (p: string) => stat(p).then((s) => s.size).catch(() => 0);
/** An error worth no further tries: the link itself is wrong, not the connection. */
const permanent = (e: unknown) => e instanceof Error && 'permanent' in e && !!e.permanent;
const refuse = (message: string) => Object.assign(new Error(message), { permanent: true });

/** A name that is safe as a file name, keeping the extension the link gave. */
export function safeName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    // What's left of a path: "../.." says nothing about the file.
    .replace(/(^|\s)\.+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 120) || 'download';
}

/** The file name a response says it has, else the one its link suggests. */
export function nameFor(url: string, disposition: string | null): string {
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposition ?? '')?.[1];
  const plain = /filename="?([^";]+)"?/i.exec(disposition ?? '')?.[1];
  const said = star ? decodeURIComponent(star.trim().replace(/^"|"$/g, '')) : plain?.trim();
  return safeName(said || nameFromUrl(url) || hostLabel(url));
}

/** The web links inside files the user dropped: a list, a JSON file, bookmarks, .url shortcuts. */
export async function linksInFiles(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const path of paths.slice(0, 20)) {
    try {
      if ((await stat(path)).size > 4 * 1024 * 1024) continue;
      out.push(...linksIn(await readFile(path, 'utf8')));
    } catch {
      // not a text file, or unreadable: skip it
    }
  }
  return [...new Set(out)];
}

interface Live extends DownloadItem {
  stop?: AbortController;
  /** Set while it waits to try again by itself. */
  timer?: NodeJS.Timeout;
}

export class DownloadService {
  private items: Live[] = [];
  private saving: Promise<void> = Promise.resolve();
  private announce: NodeJS.Timeout | null = null;

  constructor(private readonly d: Deps) {}

  /** Read back the list from last time; anything that was going is paused, ready to carry on. */
  async load(): Promise<void> {
    const raw = (await readJson(join(this.d.dir, 'downloads.json')).catch(() => null)) as { items?: DownloadItem[] } | null;
    this.items = (raw?.items ?? []).map((i) => ({
      ...i,
      speed: 0,
      eta: null,
      state: i.state === 'running' || i.state === 'waiting' ? 'paused' : i.state,
    }));
    this.changed();
  }

  list(): DownloadItem[] {
    return this.items.map(({ stop: _stop, timer: _timer, ...rest }) => rest);
  }

  /** Queue these links. Ones already in the list (and not finished with) are left alone. */
  add(urls: string[]): { added: number; skipped: number } {
    let added = 0;
    let skipped = 0;
    for (const url of urls.slice(0, MOST_AT_ONCE)) {
      if (!isWebLink(url) || this.items.some((i) => i.url === url && i.state !== 'failed' && i.state !== 'cancelled')) {
        skipped++;
        continue;
      }
      added++;
      this.items.unshift(this.fresh(url));
    }
    this.changed();
    this.fill();
    return { added, skipped };
  }

  /** Fetch a link again that was downloaded (or refused) before: a new row, a new file. */
  again(id: string): void {
    const item = this.find(id);
    if (!item) return;
    this.items.unshift(this.fresh(item.url));
    this.changed();
    this.fill();
  }

  pause(id: string): void {
    const item = this.find(id);
    if (!item || (item.state !== 'running' && item.state !== 'waiting')) return;
    this.hold(item);
    item.state = 'paused';
    item.speed = 0;
    item.eta = null;
    this.changed();
    this.fill();
  }

  resume(id: string): void {
    const item = this.find(id);
    if (!item || (item.state !== 'paused' && item.state !== 'failed')) return;
    item.state = 'waiting';
    item.error = null;
    item.tries = 0;
    this.changed();
    this.fill();
  }

  cancel(id: string): void {
    const item = this.find(id);
    if (!item) return;
    this.hold(item);
    item.state = 'cancelled';
    item.speed = 0;
    item.eta = null;
    item.finishedAt = nowIso();
    void this.wipe(item);
    this.changed();
    this.fill();
  }

  /** Take one row off the list (and its file with it). */
  remove(id: string): void {
    const item = this.find(id);
    if (!item) return;
    this.hold(item);
    this.items = this.items.filter((i) => i.id !== id);
    void this.wipe(item);
    this.changed();
    this.fill();
  }

  pauseAll(): void {
    for (const item of this.items) if (item.state === 'running' || item.state === 'waiting') this.pause(item.id);
  }

  resumeAll(): void {
    for (const item of this.items) if (item.state === 'paused') this.resume(item.id);
  }

  /** Try every failed download again. */
  retryFailed(): void {
    for (const item of this.items) if (item.state === 'failed') this.resume(item.id);
  }

  /** Forget the rows that are finished with, and delete the files they kept. */
  async clear(): Promise<void> {
    const going = this.items.filter((i) => i.state === 'waiting' || i.state === 'running' || i.state === 'paused');
    const gone = this.items.filter((i) => !going.includes(i));
    this.items = going;
    this.changed();
    for (const item of gone) await this.wipe(item);
  }

  /**
   * The download is in the library now. Its file stays until the list is cleared: the library
   * has its own copy, but nothing the user downloaded is thrown away behind their back.
   */
  done(id: string, packName: string | null): void {
    const item = this.find(id);
    if (!item) return;
    item.state = 'added';
    item.packName = packName;
    item.speed = 0;
    item.eta = null;
    this.changed();
  }

  /** What a finished download is called on disk, for adding it to the library. */
  fileOf(id: string): string | null {
    const item = this.find(id);
    return item?.state === 'ready' || item?.state === 'added' ? item.file : null;
  }

  urlOf(id: string): string | null {
    return this.find(id)?.url ?? null;
  }

  /** Stop everything (the app is closing); part-files stay for next time. */
  stopAll(): void {
    for (const item of this.items) {
      if (item.state === 'running') {
        item.state = 'paused';
        this.hold(item);
      }
    }
    void this.save();
  }

  private fresh(url: string): Live {
    return {
      id: `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      host: hostLabel(url),
      name: safeName(nameFromUrl(url) || hostLabel(url)),
      state: 'waiting',
      received: 0,
      total: null,
      speed: 0,
      eta: null,
      error: null,
      file: null,
      addedAt: nowIso(),
      startedAt: null,
      finishedAt: null,
      tries: 0,
    };
  }

  /** Stop whatever this row is doing right now (a fetch in flight, or a wait before another go). */
  private hold(item: Live): void {
    item.stop?.abort();
    item.stop = undefined;
    if (item.timer) clearTimeout(item.timer);
    item.timer = undefined;
  }

  /** Read the state as it is now: a pause or a cancel may have changed it mid-download. */
  private stateOf(item: Live): DownloadState {
    return item.state;
  }

  private find(id: string): Live | undefined {
    return this.items.find((i) => i.id === id);
  }

  private dirOf(item: DownloadItem): string {
    return join(this.d.dir, item.id);
  }

  private async wipe(item: DownloadItem): Promise<void> {
    await rm(this.dirOf(item), { recursive: true, force: true }).catch((e: unknown) => log.warn('downloads', 'could not remove a download', e));
  }

  /** Start as many as are allowed to run at once, oldest first. */
  private fill(): void {
    const atOnce = Math.min(5, Math.max(1, this.d.atOnce?.() ?? AT_ONCE));
    const running = this.items.filter((i) => i.state === 'running').length;
    for (const item of this.items.filter((i) => i.state === 'waiting' && !i.timer).reverse().slice(0, Math.max(0, atOnce - running))) {
      void this.run(item);
    }
  }

  private changed(): void {
    this.d.onChanged();
    void this.save();
  }

  /** Progress moves all the time: the window hears about it a few times a second at most. */
  private tick(): void {
    if (this.announce) return;
    this.announce = setTimeout(() => {
      this.announce = null;
      this.d.onChanged();
    }, 400);
  }

  private save(): Promise<void> {
    const items = this.list();
    this.saving = this.saving
      .then(() => mkdir(this.d.dir, { recursive: true }))
      .then(() => writeJson(join(this.d.dir, 'downloads.json'), { items }))
      .catch((e: unknown) => log.warn('downloads', 'could not save the list', e));
    return this.saving;
  }

  /** A connection that dropped is worth another go by itself; a wrong link isn't. */
  private later(item: Live, error: Error): void {
    const wait = WAITS[item.tries - 1];
    if (permanent(error) || wait === undefined) {
      item.state = 'failed';
      item.error = error.message;
      item.finishedAt = nowIso();
      this.changed();
      return;
    }
    item.state = 'waiting';
    item.error = `${error.message} Trying again…`;
    item.timer = setTimeout(() => {
      item.timer = undefined;
      this.changed();
      this.fill();
    }, wait);
    this.changed();
  }

  private async run(item: Live): Promise<void> {
    item.state = 'running';
    item.error = null;
    item.tries++;
    item.startedAt ??= nowIso();
    const stop = new AbortController();
    item.stop = stop;
    this.changed();
    const dir = this.dirOf(item);
    const part = join(dir, 'part');
    try {
      await mkdir(dir, { recursive: true });
      // A page of a site Tessera knows leads to the file behind it; anything else is fetched as it is.
      const found = await resolveLink(item.url, this.d.fetch);
      if (found?.name && item.name !== found.name) {
        item.name = safeName(found.name);
        this.changed();
      }
      // Carry on where a pause or a closed app left off, when the site allows it.
      let from = await sizeOf(part);
      const headers: Record<string, string> = { 'User-Agent': UA, Accept: '*/*' };
      if (from) headers.Range = `bytes=${from}-`;
      const res = await this.d.fetch(found?.url ?? item.url, { headers, signal: stop.signal, redirect: 'follow' });
      if (!res.ok) {
        const message = res.status === 404 ? 'The link doesn’t lead to a file any more (404).' : res.status === 403 ? 'The site wouldn’t hand the file over (403). It may need a sign-in.' : `The site answered ${res.status}.`;
        throw res.status >= 500 || res.status === 429 ? new Error(message) : refuse(message);
      }
      if (from && res.status !== 206) from = 0;
      const type = res.headers.get('content-type') ?? '';
      // A page, not a file: Tessera can't tell what to download from it yet.
      if (/text\/html|application\/xhtml/i.test(type)) throw refuse('That link opens a web page, not a file. Open it in your browser and bring the download link.');
      if (!res.body) throw refuse('The site sent nothing.');

      item.name = safeName(found?.name ?? nameFor(res.url || item.url, res.headers.get('content-disposition')));
      const length = Number(res.headers.get('content-length') ?? 0);
      item.total = length ? from + length : null;
      item.received = from;
      this.changed();

      const out = createWriteStream(part, { flags: from ? 'a' : 'w' });
      const reader = res.body.getReader();
      let mark = Date.now();
      let at = from;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
          item.received += value.byteLength;
          const since = Date.now() - mark;
          if (since >= 500) {
            const now = Math.round(((item.received - at) * 1000) / since);
            // Smoothed, so the speed and the time left don't jump about.
            item.speed = item.speed ? Math.round(item.speed * 0.7 + now * 0.3) : now;
            item.eta = item.total && item.speed ? Math.round((item.total - item.received) / item.speed) : null;
            mark = Date.now();
            at = item.received;
            this.tick();
          }
        }
      } finally {
        await new Promise<void>((resolve) => out.end(() => resolve()));
      }

      const file = join(dir, item.name);
      await rename(part, file);
      item.file = file;
      item.total = item.received;
      item.speed = 0;
      item.eta = null;
      item.state = 'ready';
      item.finishedAt = nowIso();
      item.stop = undefined;
      this.changed();
      this.d.onReady({ ...item, stop: undefined, timer: undefined } as DownloadItem);
    } catch (e) {
      item.speed = 0;
      item.eta = null;
      item.stop = undefined;
      // A pause or a cancel isn't a failure (either changed the state while this was in flight).
      const state = this.stateOf(item);
      if (state === 'paused' || state === 'cancelled') this.changed();
      else {
        const error = e instanceof Error ? e : new Error(String(e));
        log.warn('downloads', `could not download ${item.url}`, e);
        this.later(item, error);
      }
    } finally {
      this.fill();
    }
  }
}
