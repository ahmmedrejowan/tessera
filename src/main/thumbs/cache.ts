/**
 * What the previews are costing, and what to let go of when there is too much.
 *
 * Every thumbnail is named `<pack>.<kind>.<hash>`, so both questions are answered by reading one
 * folder: no index, no database, nothing to keep in step. Deleting one costs nothing but the time
 * to draw it again, which is why this can be as blunt as it is.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readThumbName } from './service';

export interface PreviewCost {
  /** Bytes and count for each kind of thing drawn: models, images, audio, fonts, HDRIs. */
  byKind: Record<string, { bytes: number; count: number }>;
  /** Bytes and count per pack, for clearing the ones nobody opens. */
  byPack: Record<string, { bytes: number; count: number }>;
  bytes: number;
  count: number;
  /** Files that failed to draw, kept as markers so they are not retried on every scroll. */
  failed: number;
  /** Drawn by an older version, under a name nothing looks for any more. Only taking up room. */
  stale: { bytes: number; count: number };
}

interface Entry {
  file: string;
  pack: string;
  kind: string;
  bytes: number;
  /** When it was last drawn. Good enough for "least wanted" without touching a file on every view. */
  at: number;
  /** Left over from an older version of the drawing, under a name nothing asks for. */
  stale: boolean;
}

async function entries(dir: string): Promise<Entry[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: Entry[] = [];
  for (const file of names) {
    const s = await stat(join(dir, file)).catch(() => null);
    if (!s || !s.isFile()) continue;
    const parsed = readThumbName(file);
    // Anything whose name we no longer understand was drawn by an older version. It is counted so
    // it can be reported and swept, but it is not a model or an image any more: it is just room.
    out.push({ file, pack: parsed?.pack ?? '', kind: parsed?.kind ?? '', bytes: s.size, at: s.mtimeMs, stale: !parsed });
  }
  return out;
}

/** What previews cost, split by kind and by pack. */
export async function previewCost(dir: string | null): Promise<PreviewCost> {
  const empty: PreviewCost = { byKind: {}, byPack: {}, bytes: 0, count: 0, failed: 0, stale: { bytes: 0, count: 0 } };
  if (!dir) return empty;
  const cost = { ...empty, byKind: {} as PreviewCost['byKind'], byPack: {} as PreviewCost['byPack'], stale: { bytes: 0, count: 0 } };
  for (const e of await entries(dir)) {
    if (e.stale) {
      cost.stale.bytes += e.bytes;
      cost.stale.count++;
      continue;
    }
    if (e.file.endsWith('.fail')) {
      cost.failed++;
      continue;
    }
    const kind = (cost.byKind[e.kind] ??= { bytes: 0, count: 0 });
    kind.bytes += e.bytes;
    kind.count++;
    const pack = (cost.byPack[e.pack] ??= { bytes: 0, count: 0 });
    pack.bytes += e.bytes;
    pack.count++;
    cost.bytes += e.bytes;
    cost.count++;
  }
  return cost;
}

/**
 * Bring the folder back under its limit.
 *
 * What goes first is decided by how much its pack is used, then by how long ago it was drawn, so a
 * pack someone works in every day keeps its previews while one opened once a year does not. A
 * limit of 0 means no limit.
 */
export async function evictOver(dir: string | null, limitBytes: number, scoreOfPack: (packShort: string) => number): Promise<{ removed: number; freed: number }> {
  if (!dir || limitBytes <= 0) return { removed: 0, freed: 0 };
  const all = (await entries(dir)).filter((e) => !e.file.endsWith('.fail'));
  let total = all.reduce((n, e) => n + e.bytes, 0);
  if (total <= limitBytes) return { removed: 0, freed: 0 };

  // Leftovers from an older version go first, because nothing will ever ask for them again. After
  // that, least wanted: the lowest-scoring pack, and within a pack the one drawn longest ago.
  all.sort((a, b) => Number(b.stale) - Number(a.stale) || scoreOfPack(a.pack) - scoreOfPack(b.pack) || a.at - b.at);
  let removed = 0;
  let freed = 0;
  for (const e of all) {
    if (total <= limitBytes) break;
    await rm(join(dir, e.file), { force: true }).catch(() => undefined);
    total -= e.bytes;
    freed += e.bytes;
    removed++;
  }
  return { removed, freed };
}

/** Throw away the previews for particular packs, or the ones that failed to draw. */
export async function clearFor(dir: string | null, opts: { packs?: string[]; failedOnly?: boolean; staleOnly?: boolean }): Promise<number> {
  if (!dir) return 0;
  const wanted = opts.packs ? new Set(opts.packs.map((p) => p.slice(0, 8))) : null;
  let removed = 0;
  for (const e of await entries(dir)) {
    if (opts.staleOnly && !e.stale) continue;
    if (opts.failedOnly && !e.file.endsWith('.fail')) continue;
    if (wanted && !wanted.has(e.pack)) continue;
    await rm(join(dir, e.file), { force: true }).catch(() => undefined);
    removed++;
  }
  return removed;
}
