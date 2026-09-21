import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import type { Job, LibraryState } from '@shared/types';
import { call, on } from '../api';

/**
 * The index version increases whenever the library's contents change. Library queries include it
 * in their keys, so everything showing library data refetches after a change — no manual invalidation.
 */
let indexVersion = 0;
const versionListeners = new Set<() => void>();
on('index:changed', (v) => {
  indexVersion = v;
  for (const l of versionListeners) l();
});

export function useIndexVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      versionListeners.add(cb);
      return () => versionListeners.delete(cb);
    },
    () => indexVersion,
  );
}

export function useLibraryState() {
  const client = useQueryClient();
  useEffect(() => on('library:changed', (s) => client.setQueryData(['library-state'], s)), [client]);
  return useQuery<LibraryState>({ queryKey: ['library-state'], queryFn: () => call('library:state') });
}

/** The open library's id, or null. Part of every library query key. */
export function useLibraryId(): string | null {
  const s = useLibraryState().data;
  return s?.status === 'ready' ? s.library.id : null;
}

export function useJobs(): Job[] {
  const client = useQueryClient();
  useEffect(() => on('jobs:changed', (jobs) => client.setQueryData(['jobs'], jobs)), [client]);
  return useQuery<Job[]>({ queryKey: ['jobs'], queryFn: () => call('jobs:list') }).data ?? [];
}

export function useStats() {
  const id = useLibraryId();
  const v = useIndexVersion();
  return useQuery({ queryKey: ['stats', id, v], queryFn: () => call('library:stats'), enabled: !!id, placeholderData: (prev) => prev });
}

/** URL of a pack's file for <img>, <audio> and loaders. */
export const fileUrl = (packId: string, ref: string) =>
  `tessera://pack/${encodeURIComponent(packId)}/${ref.split('/').map((seg) => encodeURIComponent(seg).replace(/%21/g, '!')).join('/')}`;
