import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useJobs } from '../state/library';
import { md, SHAPE } from '../theme';

/**
 * Background work (reading the library, adding packs, copying, backing up) as a small spinner in
 * the top bar; clicking it lists what's happening. Nothing shows when the app is idle.
 */
export function Activity() {
  const jobs = useJobs();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!jobs.length) return null;
  const running = jobs.filter((j) => j.state === 'running');
  const failed = jobs.some((j) => j.state === 'failed');
  const main = running[0] ?? jobs[jobs.length - 1]!;
  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Background activity"
        sx={{ gap: 1, height: 40, px: 1.5, borderRadius: `${SHAPE.full}px`, '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
      >
        {running.length ? (
          <CircularProgress size={18} thickness={5} {...(main.progress !== null ? { variant: 'determinate', value: main.progress * 100 } : {})} />
        ) : failed ? (
          <ErrorOutlineOutlined sx={{ fontSize: 20, color: md('error') }} />
        ) : (
          <CheckCircleOutlined sx={{ fontSize: 20, color: md('primary') }} />
        )}
        <Typography variant="labelMedium" noWrap sx={{ color: md('onSurfaceVariant'), maxWidth: 180 }}>
          {running.length > 1 ? `${running.length} tasks` : main.label}
        </Typography>
      </ButtonBase>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { width: 340, p: 2, borderRadius: `${SHAPE.md}px` } } }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {jobs.map((j) => (
            <div key={j.id}>
              <Typography variant="labelLarge" sx={{ color: md('onSurface') }}>
                {j.label}
              </Typography>
              <Typography variant="bodySmall" noWrap sx={{ color: j.state === 'failed' ? md('error') : md('onSurfaceVariant'), display: 'block', mb: 0.5 }}>
                {j.state === 'failed' ? j.error : j.state === 'done' ? `Done${j.detail ? ` · ${j.detail}` : ''}` : j.detail || 'Working…'}
              </Typography>
              {j.state === 'running' && <LinearProgress {...(j.progress !== null ? { variant: 'determinate', value: j.progress * 100 } : {})} />}
            </div>
          ))}
        </div>
      </Popover>
    </>
  );
}
