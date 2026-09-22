import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useState, type ComponentType } from 'react';
import { md, SHAPE } from '../theme';
import type { Role } from '../theme/m3';
import { useDialogs, type Tone } from './dialogs';

const TONES: Record<Tone, { icon: ComponentType<{ sx?: object }>; bg: Role; fg: Role }> = {
  error: { icon: ErrorOutlineRounded, bg: 'errorContainer', fg: 'onErrorContainer' },
  warning: { icon: WarningAmberRounded, bg: 'tertiaryContainer', fg: 'onTertiaryContainer' },
  info: { icon: InfoOutlined, bg: 'secondaryContainer', fg: 'onSecondaryContainer' },
  question: { icon: HelpOutlineRounded, bg: 'secondaryContainer', fg: 'onSecondaryContainer' },
};

function Details({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ alignSelf: 'stretch', textAlign: 'left' }}>
      <Button size="small" onClick={() => setOpen(!open)} endIcon={<ExpandMoreRounded sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />} sx={{ ml: -1, color: md('onSurfaceVariant') }}>
        Details
      </Button>
      <Collapse in={open}>
        <div style={{ position: 'relative', marginTop: 4, borderRadius: SHAPE.md, background: md('surfaceContainerHighest') }}>
          <pre style={{ margin: 0, padding: '12px 44px 12px 14px', maxHeight: 200, overflow: 'auto', font: '12px/1.5 ui-monospace, Menlo, Consolas, monospace', color: md('onSurface'), whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'text' }}>{text}</pre>
          <Tooltip title={copied ? 'Copied' : 'Copy'}>
            <IconButton size="small" onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))} sx={{ position: 'absolute', top: 6, right: 6 }}>
              <ContentCopyRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        </div>
      </Collapse>
    </div>
  );
}

/**
 * The one dialog for messages that need an answer: an icon, a headline, a line or two, and the
 * choices. Anything technical is folded under Details.
 */
export function DialogHost() {
  const current = useDialogs((s) => s.queue[0]);
  const close = useDialogs((s) => s.close);
  // Keep the last dialog's content while it animates out.
  const [shown, setShown] = useState(current);
  useEffect(() => {
    if (current) setShown(current);
  }, [current]);
  const d = current ?? shown;
  if (!d) return null;
  const { spec } = d;
  const tone = TONES[spec.tone];
  const Icon = spec.icon ?? tone.icon;
  return (
    <Dialog open={!!current} onClose={() => close(d.id, null)} maxWidth={false} slotProps={{ paper: { sx: { width: 440, maxWidth: 'calc(100vw - 48px)', borderRadius: `${SHAPE.xl}px`, p: 3, backgroundImage: 'none' } } }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, display: 'grid', placeItems: 'center', background: md(tone.bg), color: md(tone.fg) }}>
          <Icon sx={{ fontSize: 28 }} />
        </div>
        <Typography variant="headlineSmall" component="h2" sx={{ color: md('onSurface'), overflowWrap: 'anywhere' }}>
          {spec.title}
        </Typography>
        {spec.body && (
          <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurfaceVariant'), mt: -0.5 }}>
            {spec.body}
          </Typography>
        )}
        {spec.extra}
        {spec.details && <Details text={spec.details} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 24 }}>
        {spec.actions.map((a, i) => (
          <Button
            key={a.label}
            autoFocus={a.kind === 'primary' || (i === spec.actions.length - 1 && !spec.actions.some((x) => x.kind === 'primary'))}
            variant={a.kind === 'primary' ? 'contained' : 'text'}
            color={a.kind === 'danger' ? 'error' : 'primary'}
            onClick={() => close(d.id, a.value)}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </Dialog>
  );
}
