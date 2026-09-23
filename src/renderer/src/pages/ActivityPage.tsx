import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { call, on } from '../api';
import { EmptyState } from '../components/EmptyState';
import { md, SHAPE } from '../theme';
import { ACTIVITY_ICONS, ago } from './HomePage';
import { Page } from './Placeholder';

/** Everything that has happened in this library, newest first. */
export function ActivityPage() {
  const client = useQueryClient();
  useEffect(() => on('activity:changed', () => void client.invalidateQueries({ queryKey: ['activity'] })), [client]);
  const entries = useQuery({ queryKey: ['activity', 'all'], queryFn: () => call('activity:list', 300), staleTime: 0 }).data ?? [];

  return (
    <Page title="Activity" subtitle="What has happened in this library" width={1000}>
      {entries.length ? (
        <div style={{ borderRadius: SHAPE.lg, background: md('surfaceContainerLow'), padding: '4px 20px' }}>
          {entries.map((e, i) => {
            const Icon = ACTIVITY_ICONS[e.kind] ?? HistoryOutlined;
            return (
              <div key={`${e.at}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderTop: i ? `1px solid ${md('outlineVariant')}` : 'none' }}>
                <Icon sx={{ fontSize: 20, color: md('onSurfaceVariant') }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
                    {e.text}
                  </Typography>
                  {e.detail && (
                    <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
                      {e.detail}
                    </Typography>
                  )}
                </div>
                <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), flexShrink: 0 }}>
                  {ago(e.at)}
                </Typography>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={HistoryOutlined} title="Nothing has happened yet" body="Adding packs, downloads, reviews, backups and links to games all show up here." />
      )}
    </Page>
  );
}
