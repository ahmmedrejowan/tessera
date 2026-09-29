/**
 * How much each pack is actually used, on this computer.
 *
 * Kept beside the library's other working files rather than in the library itself: it is a record
 * of what one person does, not of what the pack is, so it neither syncs between computers nor
 * belongs in `pack.json`. It also survives the index being rebuilt, which is the point: the index
 * can be thrown away and remade, but nobody wants to be told their favorite pack is a stranger
 * again afterwards.
 */
import { join } from 'node:path';
import { readJson, writeJson } from './fsx';
import { log } from './log';

/** What counts as using a pack. Weighted, because they do not mean the same thing. */
export type UseKind = 'opened' | 'viewed' | 'linked';

/** Putting a pack in a game is the strongest signal; opening its page is the weakest. */
const WEIGHT: Record<UseKind, number> = { opened: 1, viewed: 2, linked: 10 };

export interface PackUse {
  opened: number;
  viewed: number;
  linked: number;
  /** When it was last used at all, so a pack can go quiet without being forgotten at once. */
  lastAt: string;
}

interface File {
  uses: Record<string, PackUse>;
  /** Packs whose previews are not wanted: nothing is drawn for them, and tiles show an icon. */
  previewsOff: string[];
}

/** The first version of this file was the uses alone. Read either shape. */
function readFile(raw: unknown): File {
  if (!raw || typeof raw !== 'object') return { uses: {}, previewsOff: [] };
  const o = raw as Partial<File> & Record<string, unknown>;
  if (o.uses && typeof o.uses === 'object') return { uses: o.uses as File['uses'], previewsOff: Array.isArray(o.previewsOff) ? o.previewsOff : [] };
  return { uses: raw as File['uses'], previewsOff: [] };
}

const empty = (): PackUse => ({ opened: 0, viewed: 0, linked: 0, lastAt: new Date(0).toISOString() });

/** One pack's standing, with recent use worth more than old use. */
export function scoreOf(use: PackUse, now = Date.now()): number {
  const raw = use.opened * WEIGHT.opened + use.viewed * WEIGHT.viewed + use.linked * WEIGHT.linked;
  const days = Math.max(0, (now - new Date(use.lastAt).getTime()) / 86_400_000);
  // Halves every three months, so what someone used last week outranks what they used last year
  // without ever quite reaching zero.
  return raw * Math.pow(0.5, days / 90);
}

export class UsageStore {
  private uses: File['uses'] = {};
  private off = new Set<string>();
  private file = '';
  private writing: Promise<void> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;

  /** Point at a library's own folder. Reading a broken or missing file starts from nothing. */
  async open(libraryDir: string): Promise<void> {
    await this.flush();
    this.file = join(libraryDir, 'usage.json');
    const read = readFile(await readJson(this.file).catch(() => null));
    this.uses = read.uses;
    this.off = new Set(read.previewsOff);
  }

  /** Write what is pending and let go. Awaited by anything that needs the file on disk now. */
  async close(): Promise<void> {
    await this.flush();
    this.file = '';
    this.uses = {};
    this.off.clear();
  }

  /** Write anything waiting, and wait for it. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flushNow();
    await this.writing;
  }

  /** Note that a pack was used. Written a moment later, so a scroll is not a hundred writes. */
  record(packId: string, kind: UseKind): void {
    if (!this.file || !packId) return;
    const use = (this.uses[packId] ??= empty());
    use[kind] += 1;
    use.lastAt = new Date().toISOString();
    this.later();
  }

  of(packId: string): PackUse {
    return this.uses[packId] ?? empty();
  }

  all(): Record<string, PackUse> {
    return this.uses;
  }

  /** Every pack that has been used, best first. */
  ranked(now = Date.now()): { packId: string; use: PackUse; score: number }[] {
    return Object.entries(this.uses)
      .map(([packId, use]) => ({ packId, use, score: scoreOf(use, now) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  /** Packs are forgotten with their pack, so the file does not grow for ever. */
  forget(packIds: string[]): void {
    let went = false;
    for (const id of packIds) {
      if (this.uses[id]) { delete this.uses[id]; went = true; }
      if (this.off.delete(id)) went = true;
    }
    if (went) this.later();
  }

  /** Whether previews are wanted for a pack. On unless someone said otherwise. */
  previewsOn(packId: string): boolean {
    return !this.off.has(packId);
  }

  setPreviews(packId: string, on: boolean): void {
    if (!this.file) return;
    if (on) this.off.delete(packId);
    else this.off.add(packId);
    this.later();
  }

  /** Every pack whose previews are turned off. */
  previewsOffList(): string[] {
    return [...this.off];
  }

  private later(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushNow();
    }, 2000);
  }

  private flushNow(): void {
    if (!this.file) return;
    const file = this.file;
    const data: File = { uses: { ...this.uses }, previewsOff: [...this.off] };
    this.writing = this.writing.then(() => writeJson(file, data)).catch((e: unknown) => log.warn('usage', 'could not save how packs are used', e));
  }
}
