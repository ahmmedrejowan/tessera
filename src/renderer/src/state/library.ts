import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import type { Job, LibraryRecord, LibraryState } from '@shared/types';
import { call, on } from '../api';
import { useSettings } from './queries';

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
export { packFileUrl as fileUrl } from '@shared/urls';

/** Every library this computer knows, most recently opened first (for the switcher and welcome). */
export function useLibraries() {
  const client = useQueryClient();
  useEffect(() => {
    const again = () => void client.invalidateQueries({ queryKey: ['libraries'] });
    const offs = [on('libraries:changed', again), on('library:changed', again), on('backup:changed', again)];
    return () => offs.forEach((off) => off());
  }, [client]);
  return useQuery({ queryKey: ['libraries'], queryFn: () => call('libraries:list'), staleTime: 0 });
}

/** The open library's own settings (Inbox rule, sync, backups), or null. */
export function useLibraryRecord(): LibraryRecord | null {
  const id = useLibraryId();
  const settings = useSettings().data;
  return (id && settings?.libraries[id]) || null;
}
