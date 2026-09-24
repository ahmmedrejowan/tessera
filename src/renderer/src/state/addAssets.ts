import { create } from 'zustand';
import { useNav } from './nav';

/** A file waiting to be put into a pack. */
export interface Incoming {
  path: string;
  name: string;
  size: number;
  isFolder: boolean;
}

interface State {
  packId: string | null;
  files: Incoming[];
  /** Start the add-assets page for a pack, with the files already chosen. */
  start(packId: string, files: Incoming[]): void;
  /** More files, dropped or chosen while the page is open. */
  add(files: Incoming[]): void;
  remove(path: string): void;
  clear(): void;
}

/** What is being added to a pack, kept out of the page so a drop can start it from anywhere. */
export const useAddAssets = create<State>((set, get) => ({
  packId: null,
  files: [],
  start(packId, files) {
    set({ packId, files });
    useNav.getState().go({ to: 'addAssets', id: packId });
  },
  add(files) {
    const have = new Set(get().files.map((f) => f.path));
    set({ files: [...get().files, ...files.filter((f) => !have.has(f.path))] });
  },
  remove(path) {
    set({ files: get().files.filter((f) => f.path !== path) });
  },
  clear() {
    set({ packId: null, files: [] });
  },
}));
