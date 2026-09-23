/**
 * Looking for a newer Tessera. The check is a plain read of the project's published releases —
 * nothing is downloaded, nothing is installed behind the user's back, and nothing about this
 * computer is sent: it asks for a list and compares version numbers.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { UpdateStatus } from '@shared/types';
import { log } from './log';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** A file a release publishes. */
interface Asset {
  name: string;
  url: string;
  size: number;
}

interface Deps {
  /** This build's version. */
  version: string;
  /** Where a fetched installer is kept. */
  dir: string;
  /** What this computer runs, for picking the right installer. */
  platform: NodeJS.Platform;
  /** Fetch the installer as soon as a newer version is found. */
  auto: () => boolean;
  /** Where releases are published; empty while the project is private. */
  feed: string;
  fetch: Fetch;
  onChanged: () => void;
}

/** Once a day is plenty for a desktop app. */
const EVERY = 24 * 60 * 60 * 1000;

/** "v1.2.3" and "1.2.3" are the same version; newer wins. */
export function isNewer(latest: string, current: string): boolean {
  const parts = (v: string) => v.replace(/^v/i, '').split(/[.-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : p));
  const a = parts(latest);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x === y) continue;
    // A version with a tail ("1.2.0-beta") is older than the plain one.
    if (typeof x === 'number' && typeof y === 'number') return x > y;
    if (typeof x === 'number') return true;
    if (typeof y === 'number') return false;
    return x > y;
  }
  return false;
}

/** The file a release publishes for this computer. */
export function installerFor(assets: Asset[], platform: NodeJS.Platform): Asset | null {
  const wants = platform === 'darwin' ? /\.dmg$/i : platform === 'win32' ? /\.exe$/i : /\.(appimage|deb)$/i;
  return assets.find((a) => wants.test(a.name)) ?? null;
}

export class Updates {
  private status: UpdateStatus;
  private assets: Asset[] = [];
  private checking: Promise<UpdateStatus> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly d: Deps) {
    this.status = { current: d.version, checking: false, latest: null, url: null, notes: null, publishedAt: null, lastCheckedAt: null, error: null, newer: false, canCheck: !!d.feed, downloading: false, installer: null };
  }

  get(): UpdateStatus {
    return this.status;
  }

  /** Check now, or join the check already running. */
  check(): Promise<UpdateStatus> {
    return (this.checking ??= this.run().finally(() => {
      this.checking = null;
    }));
  }

  /** Check on start and once a day, while the user leaves it on. */
  startSchedule(enabled: () => boolean): void {
    if (this.timer) clearInterval(this.timer);
    const go = () => {
      if (enabled() && this.d.feed) void this.check().catch(() => undefined);
    };
    this.timer = setInterval(go, EVERY);
    setTimeout(go, 8000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch };
    this.d.onChanged();
  }

  /** Fetch the installer this computer needs, into Tessera's own folder. */
  async download(): Promise<UpdateStatus> {
    const asset = installerFor(this.assets, this.d.platform);
    if (!asset) {
      this.set({ error: 'That release has no installer for this computer. The release page has the files.' });
      return this.status;
    }
    if (this.status.downloading) return this.status;
    this.set({ downloading: true, error: null });
    try {
      await mkdir(this.d.dir, { recursive: true });
      const file = join(this.d.dir, asset.name);
      // Already fetched and whole: nothing to do.
      const there = await stat(file).then((s) => s.size).catch(() => 0);
      if (there !== asset.size) {
        const res = await this.d.fetch(asset.url, { headers: { 'User-Agent': 'Tessera', Accept: 'application/octet-stream' } });
        if (!res.ok || !res.body) throw new Error(`The installer couldn’t be fetched (${res.status}).`);
        const out = createWriteStream(file);
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
        }
        await new Promise<void>((resolve) => out.end(() => resolve()));
      }
      this.set({ downloading: false, installer: file });
    } catch (e) {
      log.warn('updates', 'could not fetch the installer', e);
      this.set({ downloading: false, error: e instanceof Error ? e.message : String(e) });
    }
    return this.status;
  }

  private async run(): Promise<UpdateStatus> {
    if (!this.d.feed) {
      this.set({ error: 'This build has nowhere to check: no releases are published yet.', lastCheckedAt: new Date().toISOString() });
      return this.status;
    }
    this.set({ checking: true, error: null });
    try {
      const res = await this.d.fetch(this.d.feed, { headers: { 'User-Agent': 'Tessera', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(res.status === 404 ? 'No releases have been published yet.' : `The release list answered ${res.status}.`);
      const release = (await res.json()) as { tag_name?: string; name?: string; html_url?: string; body?: string; published_at?: string; draft?: boolean; prerelease?: boolean; assets?: { name: string; browser_download_url: string; size: number }[] };
      const tag = release.tag_name ?? release.name ?? null;
      if (!tag || release.draft) throw new Error('No finished release to compare with.');
      this.assets = (release.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size }));
      this.set({
        checking: false,
        latest: tag.replace(/^v/i, ''),
        url: release.html_url ?? null,
        notes: (release.body ?? '').split(/\r?\n/).filter(Boolean).slice(0, 8).join('\n') || null,
        publishedAt: release.published_at ?? null,
        lastCheckedAt: new Date().toISOString(),
        newer: isNewer(tag, this.d.version),
        installer: null,
      });
      // Fetching it early only saves time later; it is never run without being asked for.
      if (this.status.newer && this.d.auto()) void this.download().catch(() => undefined);
    } catch (e) {
      log.warn('updates', 'could not check for a newer version', e);
      this.set({ checking: false, error: e instanceof Error ? e.message : String(e), lastCheckedAt: new Date().toISOString() });
    }
    return this.status;
  }
}
