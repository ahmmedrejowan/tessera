import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import Badge from '@mui/material/Badge';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import { useState, type KeyboardEvent } from 'react';
import { LEVELS, showDetails } from '../notices/NoticeHost';
import { isArchived, useNotices, type Notice } from '../notices/store';
import type { Job } from '@shared/types';
import { useJobs } from '../state/library';
import { useNav } from '../state/nav';
import { md, SHAPE } from '../theme';
import { timeText } from '../components/labels';

/** Where a job's topic leads. Kept here so the main process never has to know a route. */
const TOPICS = { backups: { to: 'settings', section: 'backups' } } as const;

/** Makes a job row open the page that says more about it, by click or by keyboard. */
function openTopic(topic: NonNullable<Job['topic']>, close: () => void) {
  const go = () => {
    close();
    useNav.getState().go({ ...TOPICS[topic] });
  };
  return {
    role: 'button',
    tabIndex: 0,
    style: { cursor: 'pointer' },
    onClick: go,
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      go();
    },
  };
}

const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return timeText(at);
};

function HistoryItem({ n, onOpen }: { n: Notice; onOpen: () => void }) {
  const { icon: Icon } = LEVELS[n.level];
  const color = n.level === 'error' ? md('error') : n.level === 'warning' ? md('tertiary') : md('primary');
  return (
    <ButtonBase
      onClick={() => {
        useNotices.getState().markRead(n.id);
        onOpen();
        if (n.details || n.body) showDetails(n);
      }}
      sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1, mx: -1, borderRadius: `${SHAPE.sm}px`, textAlign: 'left', justifyContent: 'flex-start', '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
    >
      <Icon sx={{ fontSize: 18, color, mt: '2px' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurface'), overflowWrap: 'anywhere' }}>
          {n.title}
          {n.count > 1 ? ` (×${n.count})` : ''}
        </Typography>
        <Typography variant="bodySmall" component="div" noWrap sx={{ color: md('onSurfaceVariant') }}>
          {ago(n.at)}
          {n.body ? ` · ${n.body}` : ''}
        </Typography>
      </span>
    </ButtonBase>
  );
}

/**
 * Background work (reading the library, adding packs, copying, backing up) as a small spinner in
 * the top bar, and the messages shown so far. Clicking it lists both. Always there, so nothing
 * around it moves when work starts or ends.
 */
export function Activity() {
  const jobs = useJobs();
  const history = useNotices((s) => s.history);
  /**
   * What this panel lists: what has not been read, and nothing from before today.
   *
   * It used to show the last six whatever their state, so "Mark all as read" set a flag that
   * nothing rendered and appeared to do nothing at all, and yesterday's messages sat there as
   * though they had just arrived. Nothing is lost by leaving: Notifications keeps the lot, with
   * exactly this divide between what is recent and what is archived.
   */
  const unread = history.filter((n) => !isArchived(n));
  const unseen = useNotices((s) => s.unseen);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const running = jobs.filter((j) => j.state === 'running');
  const failed = jobs.some((j) => j.state === 'failed');
  const main = running[0];
  const unseenProblem = history.slice(0, unseen).some((n) => n.level === 'error' || n.level === 'warning');
  return (
    <>
      <ButtonBase
        onClick={(e) => {
          setAnchor(e.currentTarget);
          useNotices.getState().markSeen();
        }}
        aria-label="Activity and messages"
        sx={{ gap: 1, height: 40, minWidth: 40, px: main ? 1.5 : 1, borderRadius: `${SHAPE.full}px`, '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
      >
        {main ? (
          <>
            <CircularProgress size={18} thickness={5} {...(main.progress !== null ? { variant: 'determinate', value: main.progress * 100 } : {})} />
            <Typography variant="labelMedium" noWrap sx={{ color: md('onSurfaceVariant'), maxWidth: 180 }}>
              {running.length > 1 ? `${running.length} tasks` : main.label}
            </Typography>
          </>
        ) : (
          <Badge variant="dot" invisible={!unseen && !failed} color={unseenProblem || failed ? 'error' : 'primary'}>
            {failed ? <ErrorOutlineOutlined sx={{ fontSize: 22, color: md('error') }} /> : <NotificationsNoneOutlined sx={{ fontSize: 22, color: md('onSurfaceVariant') }} />}
          </Badge>
        )}
      </ButtonBase>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 380, maxHeight: 520, p: 2, borderRadius: `${SHAPE.lg}px` } } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {jobs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
                Activity
              </Typography>
              {jobs.map((j) => (
                // A job that has somewhere to go is the way of getting there: a backup says in
                // Settings how much it has sent and how long is left, and this is where somebody
                // is when they wonder.
                <div key={j.id} {...(j.topic ? openTopic(j.topic, () => setAnchor(null)) : {})}>
                  <Typography variant="labelLarge" sx={{ color: md('onSurface') }}>
                    {j.label}
                  </Typography>
                  <Typography variant="bodySmall" noWrap sx={{ color: j.state === 'failed' ? md('error') : md('onSurfaceVariant'), display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    {j.state === 'done' && <CheckCircleOutlined sx={{ fontSize: 14, color: md('primary') }} />}
                    {j.state === 'failed' ? j.error : j.state === 'done' ? `Done${j.detail ? ` · ${j.detail}` : ''}` : j.detail || 'Working…'}
                  </Typography>
                  {j.state === 'running' && <LinearProgress {...(j.progress !== null ? { variant: 'determinate', value: j.progress * 100 } : {})} />}
                </div>
              ))}
            </div>
          )}
          {!jobs.length && !unread.length && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '20px 8px', textAlign: 'center' }}>
              <NotificationsNoneOutlined sx={{ fontSize: 28, color: md('onSurfaceVariant') }} />
              <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
                All quiet
              </Typography>
              <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                Adding packs, copying, backups and messages show up here.
              </Typography>
            </div>
          )}
          {unread.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
                  Messages
                </Typography>
                <Button size="small" onClick={() => useNotices.getState().markAllRead()}>
                  Mark all as read
                </Button>
              </div>
              {unread.slice(0, 6).map((n) => (
                <HistoryItem key={n.id} n={n} onOpen={() => setAnchor(null)} />
              ))}
            </div>
          )}
          <Button
            fullWidth
            startIcon={<OpenInFullRounded />}
            onClick={() => {
              setAnchor(null);
              useNav.getState().go({ to: 'notifications' });
            }}
          >
            View all notifications
          </Button>
        </div>
      </Popover>
    </>
  );
}
