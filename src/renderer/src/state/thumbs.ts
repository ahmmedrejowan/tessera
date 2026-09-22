import { useEffect, useSyncExternalStore } from 'react';
import type { ThumbState } from '@shared/types';
import { call, on } from '../api';

/**
 * Thumbnail states by asset key (pack + path; ids are reused after re-indexing, so a thumbnail
 * keyed by id could land on the wrong asset). Tiles ask for their thumbnail as they render; requests are
 * gathered for a moment and sent together, and finished thumbnails arrive as events. Each tile
 * listens to its own key only, so one thumbnail arriving redraws one tile.
 */

const states = new Map<string, ThumbState>();
const listeners = new Map<string, Set<() => void>>();
const requested = new Set<string>();
let batch = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function notify(id: string): void {
  for (const l of listeners.get(id) ?? []) l();
}

function set(id: string, state: ThumbState): void {
  states.set(id, state);
  notify(id);
}

async function flush(): Promise<void> {
  timer = null;
  // Newest first: the tiles just scrolled into view are the ones worth drawing now.
  const ids = [...batch].reverse();
  batch = new Set();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    try {
      const result = await call('thumbs:get', chunk);
      for (const [id, state] of Object.entries(result)) set(id, state);
    } catch {
      for (const id of chunk) requested.delete(id);
    }
  }
}

function request(id: string): void {
  if (requested.has(id)) return;
  requested.add(id);
  batch.add(id);
  timer ??= setTimeout(() => void flush(), 40);
}

on('thumbs:ready', (ready) => {
  for (const [id, state] of Object.entries(ready)) set(id, state);
});

// Files may have changed with the index: ask again for anything on screen.
on('index:changed', () => {
  const ids = [...states.keys()];
  states.clear();
  requested.clear();
  for (const id of ids) notify(id);
});

export function useThumb(id: string | undefined): ThumbState | undefined {
  const state = useSyncExternalStore(
    (cb) => {
      if (id === undefined) return () => undefined;
      let set = listeners.get(id);
      if (!set) listeners.set(id, (set = new Set()));
      set.add(cb);
      return () => {
        set.delete(cb);
        if (!set.size) listeners.delete(id);
      };
    },
    () => (id === undefined ? undefined : states.get(id)),
  );
  useEffect(() => {
    if (id !== undefined && state === undefined) request(id);
  }, [id, state]);
  return state;
}
