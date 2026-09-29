import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Collection, CollectionRules, eitherSpelling, FAVORITES, FAVORITES_NAME, type CollectionItem, type SmartQuery } from '@shared/collection';
import { readJson, writeJson } from '../fsx';
import { DIRS } from './layout';

const fileOf = (root: string, id: string) => join(root, DIRS.collections, `${id}.json`);

export async function listCollections(root: string): Promise<Collection[]> {
  const dir = join(root, DIRS.collections);
  const out: Collection[] = [];
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (!name.endsWith('.json')) continue;
    const parsed = Collection.safeParse(eitherSpelling(await readJson(join(dir, name)).catch(() => null)));
    if (parsed.success) out.push(parsed.data);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readCollection(root: string, id: string): Promise<Collection | null> {
  const parsed = Collection.safeParse(eitherSpelling(await readJson(fileOf(root, id)).catch(() => null)));
  return parsed.success ? parsed.data : null;
}

async function save(root: string, c: Collection): Promise<Collection> {
  const next = Collection.parse({ ...c, updatedAt: new Date().toISOString() });
  await mkdir(join(root, DIRS.collections), { recursive: true });
  await writeJson(fileOf(root, c.id), next);
  return next;
}

export async function createCollection(root: string, name: string, init: { description?: string; items?: CollectionItem[]; packs?: string[]; query?: SmartQuery | null; rules?: CollectionRules; projectId?: string | null }): Promise<Collection> {
  const now = new Date().toISOString();
  return save(
    root,
    Collection.parse({
      id: randomUUID(),
      name,
      description: init.description ?? '',
      kind: init.query ? 'smart' : 'manual',
      items: init.items ?? [],
      packs: init.packs ?? [],
      rules: init.rules ?? CollectionRules.parse({}),
      projectId: init.projectId ?? null,
      query: init.query ?? null,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

/** The library's Favorites collection, made the first time something is starred. */
export async function favorites(root: string): Promise<Collection> {
  const existing = await readCollection(root, FAVORITES);
  if (existing) return existing;
  const now = new Date().toISOString();
  return save(root, Collection.parse({ id: FAVORITES, name: FAVORITES_NAME, kind: 'manual', createdAt: now, updatedAt: now }));
}

export async function updateCollection(root: string, id: string, change: (c: Collection) => Collection): Promise<Collection> {
  const c = await readCollection(root, id);
  if (!c) throw new Error('That collection no longer exists.');
  return save(root, change(c));
}

const same = (a: CollectionItem, b: CollectionItem) => a.packId === b.packId && a.ref === b.ref;

/** Add items, keeping the order they were added in and skipping ones already there. */
export const withItems = (c: Collection, items: CollectionItem[]): Collection => ({ ...c, items: [...c.items, ...items.filter((i, n) => !c.items.some((x) => same(x, i)) && items.findIndex((y) => same(y, i)) === n)] });
export const withoutItems = (c: Collection, items: CollectionItem[]): Collection => ({ ...c, items: c.items.filter((x) => !items.some((i) => same(x, i))) });

/** Add whole packs, keeping the order they were added in. */
export const withPacks = (c: Collection, ids: string[]): Collection => ({ ...c, packs: [...c.packs, ...ids.filter((id, n) => !c.packs.includes(id) && ids.indexOf(id) === n)] });
export const withoutPacks = (c: Collection, ids: string[]): Collection => ({ ...c, packs: c.packs.filter((id) => !ids.includes(id)) });

/**
 * Rewrite every item of one pack after that pack's files moved within the library.
 *
 * A collection and the Favorites star both remember an asset as its pack and its ref, so a pack
 * whose files move (taking a kept pack in copies them under `original/<folder>/`) leaves every
 * one of them pointing at a name that no longer exists. Returns how many items were moved.
 */
export async function moveCollectionRefs(root: string, packId: string, move: (ref: string) => string): Promise<number> {
  let moved = 0;
  for (const c of await listCollections(root)) {
    if (!c.items.some((i) => i.packId === packId)) continue;
    const items = c.items.map((i) => (i.packId === packId ? { ...i, ref: move(i.ref) } : i));
    const changed = items.filter((i, n) => i.ref !== c.items[n]!.ref).length;
    if (!changed) continue;
    moved += changed;
    await save(root, { ...c, items });
  }
  return moved;
}

export async function deleteCollection(root: string, id: string): Promise<void> {
  await rm(fileOf(root, id), { force: true });
}
