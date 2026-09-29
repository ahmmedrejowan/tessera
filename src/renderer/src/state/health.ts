import { useQuery } from '@tanstack/react-query';
import { call } from '../api';
import { useIndexVersion, useLibraryId, useStats } from './library';

const days = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null);

/** What the open library is worth seeing to: Review, licenses, backups, sync. */
export function useHealth() {
  const stats = useStats().data;
  // Which library, and which version of it. Without those in the key, the dot in the top bar was
  // answering for whatever library was open when it first appeared: fixing a credit line left it
  // lit, and switching library showed the previous one's counts. The same figures are fetched
  // elsewhere under keys that do have them, so Home and Settings could contradict Help.
  const id = useLibraryId();
  const v = useIndexVersion();
  const health = useQuery({ queryKey: ['health', id, v], queryFn: () => call('library:health'), enabled: !!id, staleTime: 30_000, placeholderData: (prev) => prev }).data;
  const backup = useQuery({ queryKey: ['backup-health', id, v], queryFn: () => call('backup:status'), enabled: !!id, staleTime: 30_000, placeholderData: (prev) => prev }).data;
  const sync = useQuery({ queryKey: ['sync-health', id, v], queryFn: () => call('sync:status'), enabled: !!id, staleTime: 30_000, placeholderData: (prev) => prev }).data;
  const since = days(backup?.lastBackupAt ?? null);
  const review = stats?.inbox ?? 0;
  const needCredit = health?.noCreditLine.length ?? 0;
  const restricted = health?.restricted.length ?? 0;
  const backupWorry = !backup?.target || !!backup.lastError || (since !== null && since > 7);
  return {
    review,
    needCredit,
    restricted,
    backup,
    sync,
    sinceBackup: since,
    /** How many things want attention, the dot on the top bar's question mark. */
    worries: (review ? 1 : 0) + (needCredit || restricted ? 1 : 0) + (backupWorry ? 1 : 0),
  };
}
