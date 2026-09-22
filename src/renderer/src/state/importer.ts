import { create } from 'zustand';
import type { ImportItem } from '@shared/types';
import { call } from '../api';
import { failed, notify } from '../notices/store';
import { useNav } from './nav';
import { useAdding } from './adding';

interface ImportState {
  planning: boolean;
  running: boolean;
  /**
   * Add these paths: the add page opens with them, filled in from what's found. A folder is one
   * pack or several as it looks (`eachInside` 'auto'), unless told.
   */
  plan(paths: string[], eachInside?: boolean | 'auto'): Promise<void>;
  /** Choose files (each a pack) or a folder (one pack, or several when it's a folder of downloads). */
  choose(what: 'files' | 'folder' | 'folderOfPacks'): Promise<void>;
  /** Add the sample packs that come with Tessera, without asking: they're known and CC0. */
  addSamples(): Promise<void>;
}

export const useImport = create<ImportState>((set) => ({
  planning: false,
  running: false,

  async plan(paths, eachInside = 'auto') {
    if (!paths.length) return;
    set({ planning: true });
    try {
      await useAdding.getState().start(paths, eachInside);
    } finally {
      set({ planning: false });
    }
  },

  async choose(what) {
    const paths = await call('import:choose', what);
    if (paths) await useImport.getState().plan(paths, what === 'folderOfPacks' ? true : what === 'folder' ? 'auto' : false);
  },

  async addSamples() {
    set({ planning: true });
    try {
      const items = await call('import:plan', await call('import:samples'), false);
      set({ planning: false });
      await runItems(items.filter((i) => !i.duplicateOf), set);
    } catch (e) {
      set({ planning: false });
      failed(e, 'Couldn’t add the sample packs');
    }
  },
}));

/** Add packs and say how it went. */
async function runItems(picked: ImportItem[], set: (s: Partial<ImportState>) => void): Promise<void> {
  if (!picked.length) {
    notify.info('Those packs are already in the library.');
    return;
  }
  set({ running: true });
  try {
    const result = await call('import:run', picked);
    const inbox = result.added.filter((a) => a.status === 'inbox').length;
    const library = result.added.length - inbox;
    const parts = [library && `${library} to the library`, inbox && `${inbox} to Review`, result.failed.length && `${result.failed.length} failed`].filter(Boolean);
    const review = inbox ? { action: { label: 'Review', run: () => useNav.getState().go({ to: 'inbox' }) } } : {};
    const failures = result.failed.length ? { details: result.failed.map((f) => `${f.name}: ${f.error}`).join('\n') } : {};
    if (!result.added.length) notify.error('Nothing was added', { body: result.failed[0]?.error ?? '', ...failures });
    else (result.failed.length ? notify.warning : notify.success)(`Added ${result.added.length} pack${result.added.length > 1 ? 's' : ''}: ${parts.join(', ')}.`, { ...review, ...failures });
  } catch (e) {
    failed(e);
  } finally {
    set({ running: false });
  }
}
