import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import Badge from '@mui/material/Badge';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { LEVELS, showDetails } from '../notices/NoticeHost';
import { useNotices, type Notice } from '../notices/store';
import { useJobs } from '../state/library';
import { md, SHAPE } from '../theme';

const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

function HistoryItem({ n }: { n: Notice }) {
  const { icon: Icon } = LEVELS[n.level];
  const color = n.level === 'error' ? md('error') : n.level === 'warning' ? md('tertiary') : md('primary');
  return (
    <ButtonBase
      onClick={() => (n.details || n.body ? showDetails(n) : undefined)}
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
 * the top bar, and the messages shown so far. Clicking it lists both. Nothing shows until there's
 * something to show.
 */
export function Activity() {
  const jobs = useJobs();
  const history = useNotices((s) => s.history);
  const unseen = useNotices((s) => s.unseen);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!jobs.length && !history.length) return null;
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
                <div key={j.id}>
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
          {history.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
                  Messages
                </Typography>
                <Button size="small" onClick={() => useNotices.getState().clearHistory()}>
                  Clear
                </Button>
              </div>
              {history.map((n) => (
                <HistoryItem key={n.id} n={n} />
              ))}
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}
