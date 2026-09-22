import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import InfoRounded from '@mui/icons-material/InfoRounded';
import WarningRounded from '@mui/icons-material/WarningRounded';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useEffect, useState, type ComponentType } from 'react';
import { md, mdAlpha, SHAPE } from '../theme';
import type { Role } from '../theme/m3';
import { ask } from './dialogs';
import { useNotices, type Level, type Notice } from './store';

export const LEVELS: Record<Level, { icon: ComponentType<{ sx?: object }>; tint: Role; label: string }> = {
  info: { icon: InfoRounded, tint: 'inversePrimary', label: 'Info' },
  success: { icon: CheckCircleRounded, tint: 'inversePrimary', label: 'Done' },
  warning: { icon: WarningRounded, tint: 'tertiaryContainer', label: 'Warning' },
  error: { icon: ErrorRounded, tint: 'errorContainer', label: 'Error' },
};

/** How long a toast stays; warnings and errors stay until closed. */
const lifetime = (n: Notice) => (n.level === 'warning' || n.level === 'error' ? null : n.action ? 8000 : 5000);

export function showDetails(n: Pick<Notice, 'level' | 'title' | 'body' | 'details'>) {
  void ask({ tone: n.level === 'error' ? 'error' : n.level === 'warning' ? 'warning' : 'info', title: n.title, ...(n.body ? { body: n.body } : {}), ...(n.details ? { details: n.details } : {}), actions: [{ label: 'Close', value: true, kind: 'primary' }], record: false });
}

function Toast({ notice }: { notice: Notice }) {
  const dismiss = useNotices((s) => s.dismiss);
  const [hover, setHover] = useState(false);
  const life = lifetime(notice);
  useEffect(() => {
    if (life === null || hover) return;
    const t = setTimeout(() => dismiss(notice.id), life);
    return () => clearTimeout(t);
  }, [life, hover, notice.at, notice.id, dismiss]);
  const { icon: Icon, tint } = LEVELS[notice.level];
  return (
    <div
      role={notice.level === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="tessera-toast"
      style={{
        pointerEvents: 'auto',
        width: 380,
        maxWidth: 'calc(100vw - 48px)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 8px 12px 16px',
        borderRadius: SHAPE.lg,
        background: md('inverseSurface'),
        color: md('inverseOnSurface'),
        boxShadow: `0 2px 6px ${mdAlpha('shadow', 0.15)}, 0 12px 32px ${mdAlpha('shadow', 0.22)}`,
      }}
    >
      <Icon sx={{ color: md(tint), fontSize: 22, mt: '1px', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
        <Typography variant="bodyMedium" component="div" sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>
          {notice.title}
          {notice.count > 1 && (
            <span style={{ marginLeft: 8, padding: '0 6px', borderRadius: SHAPE.full, background: mdAlpha('inverseOnSurface', 0.16), fontSize: 12 }}>×{notice.count}</span>
          )}
        </Typography>
        {notice.body && (
          <Typography variant="bodySmall" component="div" sx={{ opacity: 0.8, mt: 0.25, overflowWrap: 'anywhere' }}>
            {notice.body}
          </Typography>
        )}
        {(notice.action || notice.details) && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6, marginLeft: -8 }}>
            {notice.action && (
              <Button
                size="small"
                sx={{ color: md('inversePrimary') }}
                onClick={() => {
                  notice.action!.run();
                  dismiss(notice.id);
                }}
              >
                {notice.action.label}
              </Button>
            )}
            {notice.details && (
              <Button size="small" sx={{ color: md('inversePrimary') }} onClick={() => showDetails(notice)}>
                Details
              </Button>
            )}
          </div>
        )}
      </div>
      <IconButton size="small" aria-label="Dismiss" onClick={() => dismiss(notice.id)} sx={{ color: 'inherit', opacity: 0.7, '&:hover': { opacity: 1 } }}>
        <CloseRounded fontSize="small" />
      </IconButton>
    </div>
  );
}

/** Toasts stack in the bottom-right corner, newest at the bottom, over the page rather than in it. */
export function NoticeHost() {
  const visible = useNotices((s) => s.visible);
  const lift = useNotices((s) => s.lift);
  return (
    <div aria-live="polite" style={{ position: 'fixed', right: 24, bottom: 24 + lift, zIndex: 1400, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'none', transition: 'bottom 200ms' }}>
      <style>{`
        @keyframes tessera-toast-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }
        .tessera-toast { animation: tessera-toast-in 220ms cubic-bezier(.2,.8,.2,1); }
        @media (prefers-reduced-motion: reduce) { .tessera-toast { animation: none; } }
      `}</style>
      {visible.map((n) => (
        <Toast key={n.id} notice={n} />
      ))}
    </div>
  );
}
