import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { DownloadItem } from '@shared/types';
import { call, on } from '../api';
import { failed, notify } from '../notices/store';
import { useAdding } from './adding';

/** The downloads list, kept up to date as they run. */
export function useDownloads() {
  const client = useQueryClient();
  useEffect(() => on('downloads:changed', (list) => client.setQueryData(['downloads'], list)), [client]);
  return useQuery({ queryKey: ['downloads'], queryFn: () => call('downloads:list') });
}

export const isGoing = (d: DownloadItem) => d.state === 'waiting' || d.state === 'running' || d.state === 'paused';

/** Queue every link in what was pasted, typed or dropped. */
export async function queueLinks(text: string): Promise<void> {
  try {
    const { added, skipped } = await call('downloads:add', text);
    if (!added) notify.info(skipped ? 'Those links are already in the list.' : 'No links there. Tessera takes web links (http or https).');
    else notify.success(`${added} link${added > 1 ? 's' : ''} queued${skipped ? `, ${skipped} skipped` : ''}.`);
  } catch (e) {
    failed(e);
  }
}

/** Take finished downloads to the add page, with the link each came from already filled in. */
export async function addDownloads(ids: string[]): Promise<void> {
  try {
    const files = await call('downloads:files', ids);
    if (!files.length) return;
    await useAdding.getState().start(files.map((f) => f.path), 'auto', Object.fromEntries(files.map((f) => [f.path, f.url])));
    await call('downloads:done', files.map((f) => f.id));
  } catch (e) {
    failed(e);
  }
}
