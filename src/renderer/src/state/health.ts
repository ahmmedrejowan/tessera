import { useQuery } from '@tanstack/react-query';
import { call } from '../api';
import { useStats } from './library';

const days = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null);

/** What the open library is worth seeing to: Review, licences, backups, sync. */
export function useHealth() {
  const stats = useStats().data;
  const health = useQuery({ queryKey: ['health'], queryFn: () => call('library:health'), staleTime: 30_000 }).data;
  const backup = useQuery({ queryKey: ['backup-health'], queryFn: () => call('backup:status'), staleTime: 30_000 }).data;
  const sync = useQuery({ queryKey: ['sync-health'], queryFn: () => call('sync:status'), staleTime: 30_000 }).data;
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
