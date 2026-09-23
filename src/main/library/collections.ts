import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Collection, FAVOURITES, FAVOURITES_NAME, type CollectionItem, type SmartQuery } from '@shared/collection';
import { readJson, writeJson } from '../fsx';
import { DIRS } from './layout';

const fileOf = (root: string, id: string) => join(root, DIRS.collections, `${id}.json`);

export async function listCollections(root: string): Promise<Collection[]> {
  const dir = join(root, DIRS.collections);
  const out: Collection[] = [];
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (!name.endsWith('.json')) continue;
    const parsed = Collection.safeParse(await readJson(join(dir, name)).catch(() => null));
    if (parsed.success) out.push(parsed.data);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readCollection(root: string, id: string): Promise<Collection | null> {
  const parsed = Collection.safeParse(await readJson(fileOf(root, id)).catch(() => null));
  return parsed.success ? parsed.data : null;
}

async function save(root: string, c: Collection): Promise<Collection> {
  const next = Collection.parse({ ...c, updatedAt: new Date().toISOString() });
  await mkdir(join(root, DIRS.collections), { recursive: true });
  await writeJson(fileOf(root, c.id), next);
  return next;
}

export async function createCollection(root: string, name: string, init: { description?: string; items?: CollectionItem[]; query?: SmartQuery | null }): Promise<Collection> {
  const now = new Date().toISOString();
  return save(
    root,
    Collection.parse({
      id: randomUUID(),
      name,
      description: init.description ?? '',
      kind: init.query ? 'smart' : 'manual',
      items: init.items ?? [],
      query: init.query ?? null,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

/** The library's Favourites collection, made the first time something is starred. */
export async function favourites(root: string): Promise<Collection> {
  const existing = await readCollection(root, FAVOURITES);
  if (existing) return existing;
  const now = new Date().toISOString();
  return save(root, Collection.parse({ id: FAVOURITES, name: FAVOURITES_NAME, kind: 'manual', createdAt: now, updatedAt: now }));
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

export async function deleteCollection(root: string, id: string): Promise<void> {
  await rm(fileOf(root, id), { force: true });
}
