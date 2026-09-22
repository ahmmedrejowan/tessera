import { useQuery } from '@tanstack/react-query';
import type { CollectionItem, SmartQuery } from '@shared/collection';
import { call } from '../api';
import { toast } from '../components/Toast';
import { useIndexVersion, useLibraryId } from './library';
import { useNav } from './nav';

export function useCollections() {
  const lib = useLibraryId();
  const v = useIndexVersion();
  return useQuery({ queryKey: ['collections', lib, v], queryFn: () => call('collections:list'), enabled: !!lib, placeholderData: (p) => p });
}

const count = (n: number) => `${n} asset${n === 1 ? '' : 's'}`;

export async function addToCollection(id: string, name: string, items: CollectionItem[]): Promise<void> {
  await call('collections:change', id, { add: items });
  toast(`Added ${count(items.length)} to ${name}.`, { label: 'Open', run: () => useNav.getState().go({ to: 'collection', id }) });
}

export async function newCollection(name: string, init: { items?: CollectionItem[]; query?: SmartQuery; description?: string }): Promise<string> {
  const id = await call('collections:create', name, init);
  toast(init.query ? `Saved “${name}”.` : `Created “${name}”${init.items?.length ? ` with ${count(init.items.length)}` : ''}.`, { label: 'Open', run: () => useNav.getState().go({ to: 'collection', id }) });
  return id;
}
