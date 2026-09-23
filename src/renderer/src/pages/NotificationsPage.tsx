import DeleteSweepOutlined from '@mui/icons-material/DeleteSweepOutlined';
import DoneAllRounded from '@mui/icons-material/DoneAllRounded';
import InventoryOutlined from '@mui/icons-material/InventoryOutlined';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { LEVELS, showDetails } from '../notices/NoticeHost';
import { isArchived, useNotices, type Notice } from '../notices/store';
import { SegmentedButton } from '../components/SegmentedButton';
import { md, SHAPE } from '../theme';
import { Page } from './Placeholder';

/** When it arrived, in words: the time today, the day this week, the date before that. */
function when(at: number): string {
  const now = new Date();
  const then = new Date(at);
  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay) return then.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(then.toDateString()).getTime()) / 86_400_000);
  if (days === 1) return `Yesterday, ${then.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (days < 7) return then.toLocaleDateString([], { weekday: 'long' });
  return then.toLocaleDateString([], { dateStyle: 'medium' });
}

function Row({ n }: { n: Notice }) {
  const { icon: Icon } = LEVELS[n.level];
  const colour = n.level === 'error' ? md('error') : n.level === 'warning' ? md('tertiary') : md('primary');
  const openable = !!(n.details || n.body);
  return (
    <ButtonBase
      onClick={() => {
        useNotices.getState().markRead(n.id);
        if (openable) showDetails(n);
      }}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        p: 2,
        textAlign: 'left',
        borderRadius: `${SHAPE.lg}px`,
        backgroundColor: md('surfaceContainerLow'),
        '&:hover': { backgroundColor: md('surfaceContainer') },
      }}
    >
      <Icon sx={{ fontSize: 20, color: colour, mt: '2px' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleSmall" component="div" sx={{ color: md('onSurface') }}>
          {n.title}
          {n.count > 1 ? ` (×${n.count})` : ''}
        </Typography>
        {n.body && (
          <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.25 }}>
            {n.body}
          </Typography>
        )}
        {n.details && (
          <Typography variant="bodySmall" component="div" noWrap sx={{ color: md('onSurfaceVariant'), mt: 0.5, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
            {n.details}
          </Typography>
        )}
      </span>
      <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), flexShrink: 0 }}>
        {when(n.at)}
      </Typography>
    </ButtonBase>
  );
}

/**
 * Every message Tessera has shown. Recent holds today's unread ones; anything opened, ticked off
 * or from an earlier day moves to the archive, which is kept between runs.
 */
export function NotificationsPage() {
  const history = useNotices((s) => s.history);
  const [tab, setTab] = useState<'recent' | 'archive'>('recent');
  const recent = history.filter((n) => !isArchived(n));
  const archive = history.filter(isArchived);
  const rows = tab === 'recent' ? recent : archive;

  return (
    <Page
      title="Notifications"
      subtitle="What Tessera has told you, and what it told you before"
      aside={
        <SegmentedButton<'recent' | 'archive'>
          label="Which messages"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'recent', label: recent.length ? `Recent (${recent.length})` : 'Recent' },
            { value: 'archive', label: archive.length ? `Archive (${archive.length})` : 'Archive' },
          ]}
        />
      }
      actions={
        tab === 'recent' ? (
          <Button startIcon={<DoneAllRounded />} disabled={!recent.length} onClick={() => useNotices.getState().markAllRead()}>
            Mark all as read
          </Button>
        ) : (
          <Button startIcon={<DeleteSweepOutlined />} disabled={!archive.length} onClick={() => useNotices.getState().clearArchive()}>
            Clear the archive
          </Button>
        )
      }
    >
      {rows.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((n) => (
            <Row key={n.id} n={n} />
          ))}
        </div>
      ) : (
        <div style={{ minHeight: 320 }}>
          <EmptyState
            icon={tab === 'recent' ? NotificationsNoneOutlined : InventoryOutlined}
            title={tab === 'recent' ? 'Nothing new' : 'The archive is empty'}
            body={
              tab === 'recent'
                ? 'Messages about adding packs, downloads, backups and anything that went wrong show up here. Once read, or once the day is over, they move to the archive.'
                : 'Messages you have read, and ones from earlier days, are kept here.'
            }
          />
        </div>
      )}
    </Page>
  );
}
