import { useQuery } from '@tanstack/react-query';
import type { CollectionItem, SmartQuery } from '@shared/collection';
import { call } from '../api';
import { notify } from '../notices/store';
import { useIndexVersion, useLibraryId } from './library';
import { useNav } from './nav';

export function useCollections() {
  const lib = useLibraryId();
  const v = useIndexVersion();
  return useQuery({ queryKey: ['collections', lib, v], queryFn: () => call('collections:list'), enabled: !!lib, placeholderData: (p) => p });
}

/** What was added, in words: packs are packs, assets are assets. */
const count = (items: number, packs: number) =>
  [packs ? `${packs} pack${packs === 1 ? '' : 's'}` : '', items ? `${items} asset${items === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ') || 'nothing';

/** Put assets, whole packs, or both into a collection. A pack joins as itself, not as its files. */
export async function addToCollection(id: string, name: string, items: CollectionItem[], packs: string[] = []): Promise<void> {
  await call('collections:change', id, { ...(items.length ? { add: items } : {}), ...(packs.length ? { addPacks: packs } : {}) });
  notify.success(`Added ${count(items.length, packs.length)} to ${name}.`, { action: { label: 'Open', run: () => useNav.getState().go({ to: 'collection', id }) } });
}

export async function newCollection(name: string, init: { items?: CollectionItem[]; packs?: string[]; query?: SmartQuery; description?: string }): Promise<string> {
  const id = await call('collections:create', name, init);
  const made = count(init.items?.length ?? 0, init.packs?.length ?? 0);
  notify.success(init.query ? `Saved “${name}”.` : `Created “${name}”${made === 'nothing' ? '' : ` with ${made}`}.`, { action: { label: 'Open', run: () => useNav.getState().go({ to: 'collection', id }) } });
  return id;
}
