import { useQuery } from '@tanstack/react-query';
import type { CollectionItem, CollectionRules, SmartQuery } from '@shared/collection';
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
  const result = await call('collections:change', id, { ...(items.length ? { add: items } : {}), ...(packs.length ? { addPacks: packs } : {}) });
  const open = { action: { label: 'Open', run: () => useNav.getState().go({ to: 'collection', id }) } };
  if (result.added || result.addedPacks) notify.success(`Added ${count(result.added, result.addedPacks)} to ${name}.`, open);
  if (result.refused.length) {
    // The collection's rules turned something away: say what and why, rather than losing it quietly.
    const first = result.refused[0]!;
    notify.warning(
      result.refused.length === 1 ? `${name} doesn’t take ${first.name}: ${first.why} doesn’t fit its rules.` : `${name} turned away ${result.refused.length} things, starting with ${first.name}: ${first.why} doesn’t fit its rules.`,
      { details: result.refused.map((r) => `${r.name}: ${r.why}`).join('\n') },
    );
  }
}

export async function newCollection(name: string, init: { items?: CollectionItem[]; packs?: string[]; query?: SmartQuery; description?: string; rules?: CollectionRules; projectId?: string | null }): Promise<string> {
  const id = await call('collections:create', name, init);
  const made = count(init.items?.length ?? 0, init.packs?.length ?? 0);
  notify.success(init.query ? `Saved “${name}”.` : `Created “${name}”${made === 'nothing' ? '' : ` with ${made}`}.`, { action: { label: 'Open', run: () => useNav.getState().go({ to: 'collection', id }) } });
  return id;
}
