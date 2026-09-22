import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RenderJob, ThumbState } from '@shared/types';
import type { LibraryQueries } from '../index/query';
import { log } from '../log';
import { assetKey, packFileUrl, splitAssetKey, thumbUrl } from '@shared/urls';

/** Bump when thumbnails should be redrawn (a better renderer, a new size). */
export const THUMB_VERSION = 4;
const SIZE = 384;

/** Web images up to this size are drawn straight from the file; bigger ones get a small copy. */
const DIRECT_MAX = 160 * 1024;
// SVGs aren't drawn directly: many have no viewBox, so they won't scale in an <img>.
const DIRECT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']);
const MODEL = new Set(['glb', 'gltf', 'fbx', 'obj', 'dae', 'stl', 'ply', '3ds', 'usdz', 'vox']);
const IMAGE = new Set([...DIRECT, 'tga', 'svg', 'tif', 'tiff', 'psd']);
const HDR = new Set(['hdr', 'exr']);
const AUDIO = new Set(['ogg', 'wav', 'mp3', 'flac', 'm4a', 'opus', 'aif', 'aiff']);
const FONT = new Set(['ttf', 'otf', 'woff', 'woff2']);

type Info = ReturnType<LibraryQueries['thumbInfo']>[number];

/** What kind of drawing an asset needs, or a state that needs none. */
export function plan(a: Pick<Info, 'ext' | 'size'>): RenderJob['kind'] | 'direct' | 'none' {
  if (MODEL.has(a.ext)) return 'model';
  if (DIRECT.has(a.ext) && a.size <= DIRECT_MAX) return 'direct';
  if (IMAGE.has(a.ext)) return 'image';
  if (HDR.has(a.ext)) return 'hdr';
  if (AUDIO.has(a.ext)) return 'audio';
  if (FONT.has(a.ext)) return 'font';
  return 'none';
}

export const thumbName = (a: Pick<Info, 'packId' | 'ref' | 'size' | 'mtime'>) =>
  createHash('sha1').update(`${a.packId}|${a.ref}|${a.size}|${a.mtime}|v${THUMB_VERSION}`).digest('hex').slice(0, 24);

interface Queued {
  name: string;
  job: RenderJob;
  keys: Set<string>;
  /** Higher runs first: the most recent request wins, so what's on screen now comes first. */
  priority: number;
}

export interface ThumbDeps {
  queries: () => LibraryQueries | null;
  thumbDir: () => string | null;
  /** Draw one job; resolves with WebP bytes. */
  render: (job: RenderJob) => Promise<Uint8Array>;
  /** Push finished states to the window. */
  publish: (states: Record<string, ThumbState>) => void;
}

/**
 * Makes and caches thumbnails. Each is a small WebP named by a hash of the file's pack, path, size
 * and time, so a changed file gets a new one and an unchanged file is never drawn twice. Failures
 * leave a `.fail` marker so broken files aren't retried on every scroll.
 */
export class ThumbService {
  private readonly queue = new Map<string, Queued>();
  private counter = 0;
  private running = 0;
  private readonly concurrency = 2;
  private ready: Record<string, ThumbState> = {};
  private made = 0;
  private spent = 0;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private readonly d: ThumbDeps) {}

  /** Forget queued work (the library closed or was re-indexed). */
  reset(): void {
    this.queue.clear();
  }

  get pending(): number {
    return this.queue.size + this.running;
  }

  async get(keys: string[]): Promise<Record<string, ThumbState>> {
    const queries = this.d.queries();
    const dir = this.d.thumbDir();
    const out: Record<string, ThumbState> = {};
    if (!queries || !dir) return out;
    const priority = ++this.counter;
    for (const a of queries.thumbInfo(keys.map(splitAssetKey))) {
      const key = assetKey(a.packId, a.ref);
      const how = plan(a);
      if (how === 'direct' || how === 'none') {
        out[key] = how;
        continue;
      }
      const name = thumbName(a);
      if (existsSync(join(dir, `${name}.webp`))) out[key] = thumbUrl(`${name}.webp`);
      else if (existsSync(join(dir, `${name}.fail`))) out[key] = 'failed';
      else {
        out[key] = 'pending';
        this.enqueue(a, key, how, name, priority, queries);
      }
    }
    this.pump();
    return out;
  }

  private enqueue(a: Info, key: string, kind: RenderJob['kind'], name: string, priority: number, queries: LibraryQueries): void {
    const existing = this.queue.get(name);
    if (existing) {
      existing.keys.add(key);
      existing.priority = priority;
      return;
    }
    const job: RenderJob = { id: name, kind, ext: a.ext, url: packFileUrl(a.packId, a.ref), size: SIZE };
    if (kind === 'model') {
      const textures: Record<string, string> = {};
      for (const img of queries.packImages(a.packId)) {
        textures[img.name.toLowerCase()] ??= packFileUrl(a.packId, img.ref);
      }
      job.textures = textures;
    }
    this.queue.set(name, { name, job, keys: new Set([key]), priority });
  }

  private pump(): void {
    while (this.running < this.concurrency && this.queue.size) {
      let next: Queued | null = null;
      for (const q of this.queue.values()) if (!next || q.priority > next.priority) next = q;
      if (!next) return;
      this.queue.delete(next.name);
      this.running++;
      void this.run(next).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async run(q: Queued): Promise<void> {
    const dir = this.d.thumbDir();
    if (!dir) return;
    await mkdir(dir, { recursive: true });
    let state: ThumbState;
    const started = Date.now();
    try {
      const data = await this.d.render(q.job);
      this.made++;
      this.spent += Date.now() - started;
      if (process.env.TESSERA_DEBUG_THUMBS) log.info('thumbs', `${q.job.kind} ${q.job.ext} ${Date.now() - started} ms ${decodeURIComponent(q.job.url).slice(-60)}`);
      if (this.made % 100 === 0) log.info('thumbs', `${this.made} drawn, ${Math.round(this.spent / this.made)} ms each on average`);
      await writeFile(join(dir, `${q.name}.webp`), data);
      state = thumbUrl(`${q.name}.webp`);
    } catch (e) {
      log.warn('thumbs', `could not draw ${q.job.url}`, e instanceof Error ? e.message : e);
      await writeFile(join(dir, `${q.name}.fail`), e instanceof Error ? e.message : String(e)).catch(() => undefined);
      state = 'failed';
    }
    for (const key of q.keys) this.ready[key] = state;
    this.flush();
  }

  /** Finished thumbnails are sent in batches, a few times a second. */
  private flush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      const batch = this.ready;
      this.ready = {};
      if (Object.keys(batch).length) this.d.publish(batch);
    }, 150);
  }
}
