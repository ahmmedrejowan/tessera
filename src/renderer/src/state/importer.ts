import { create } from 'zustand';
import type { ImportItem } from '@shared/types';
import { call } from '../api';
import { toast } from '../components/Toast';
import { useNav } from './nav';

interface ImportState {
  /** Packs waiting for the user to confirm, or null when nothing is being added. */
  items: ImportItem[] | null;
  /** Ids the user left ticked. */
  chosen: Set<string>;
  planning: boolean;
  running: boolean;
  /** Work out what these paths would add and show it for confirming. */
  plan(paths: string[], eachInside?: boolean): Promise<void>;
  choose(what: 'files' | 'folder' | 'folderOfPacks'): Promise<void>;
  toggle(id: string): void;
  rename(id: string, name: string): void;
  cancel(): void;
  run(): Promise<void>;
}

export const useImport = create<ImportState>((set, get) => ({
  items: null,
  chosen: new Set(),
  planning: false,
  running: false,

  async plan(paths, eachInside = false) {
    if (!paths.length) return;
    set({ planning: true });
    try {
      const items = await call('import:plan', paths, eachInside);
      if (!items.length) {
        toast('Nothing to add there.');
        return;
      }
      // Likely duplicates start unticked.
      set({ items, chosen: new Set(items.filter((i) => !i.duplicateOf).map((i) => i.id)) });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      set({ planning: false });
    }
  },

  async choose(what) {
    const paths = await call('import:choose', what);
    if (paths) await get().plan(paths, what === 'folderOfPacks');
  },

  toggle(id) {
    const chosen = new Set(get().chosen);
    if (chosen.has(id)) chosen.delete(id);
    else chosen.add(id);
    set({ chosen });
  },

  rename(id, name) {
    set({ items: get().items?.map((i) => (i.id === id ? { ...i, name } : i)) ?? null });
  },

  cancel: () => set({ items: null, chosen: new Set() }),

  async run() {
    const { items, chosen } = get();
    const picked = (items ?? []).filter((i) => chosen.has(i.id) && i.name.trim());
    if (!picked.length) return;
    set({ items: null, chosen: new Set(), running: true });
    try {
      const result = await call('import:run', picked);
      const inbox = result.added.filter((a) => a.status === 'inbox').length;
      const library = result.added.length - inbox;
      const parts = [library && `${library} to the library`, inbox && `${inbox} to the Inbox`, result.failed.length && `${result.failed.length} failed`].filter(Boolean);
      toast(
        result.added.length ? `Added ${result.added.length} pack${result.added.length > 1 ? 's' : ''}: ${parts.join(', ')}.` : `Nothing added. ${result.failed[0]?.error ?? ''}`,
        inbox ? { label: 'Review', run: () => useNav.getState().go({ to: 'inbox' }) } : undefined,
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      set({ running: false });
    }
  },
}));
