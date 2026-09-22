import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { md, SHAPE } from '../theme';
import type { Role } from '../theme/m3';

export type SlotTone = 'error' | 'warning' | 'info' | 'success';

export interface SlotMessage {
  tone: SlotTone;
  text: ReactNode;
  action?: ReactNode;
  /** Something is under way: a spinner takes the icon's place. */
  busy?: boolean;
}

const LOOK: Record<SlotTone, { bg: Role; fg: Role; icon: typeof InfoOutlined }> = {
  error: { bg: 'errorContainer', fg: 'onErrorContainer', icon: ErrorOutlineRounded },
  warning: { bg: 'tertiaryContainer', fg: 'onTertiaryContainer', icon: WarningAmberRounded },
  info: { bg: 'surfaceContainerHigh', fg: 'onSurfaceVariant', icon: InfoOutlined },
  success: { bg: 'secondaryContainer', fg: 'onSecondaryContainer', icon: CheckCircleOutlineRounded },
};

/** The fixed height of a slot: two lines of text with room around them. */
export const SLOT_HEIGHT = 52;

/**
 * The one place a form says something about itself: a problem, a warning, a note. Its space is
 * always kept, so a message coming or going never moves anything else in the form.
 */
export function StatusSlot({ message }: { message: SlotMessage | null }) {
  if (!message) return <div style={{ height: SLOT_HEIGHT, flexShrink: 0 }} aria-hidden />;
  const { bg, fg, icon: Icon } = LOOK[message.tone];
  return (
    <div role={message.tone === 'error' ? 'alert' : 'status'} style={{ height: SLOT_HEIGHT, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 0 14px', borderRadius: SHAPE.md, background: md(bg), color: md(fg), transition: 'background-color 150ms' }}>
      {message.busy ? <CircularProgress size={18} thickness={5} sx={{ color: 'inherit', flexShrink: 0 }} /> : <Icon sx={{ fontSize: 20, flexShrink: 0 }} />}
      <Typography variant="bodySmall" component="div" sx={{ flex: 1, fontSize: 13, lineHeight: '18px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {message.text}
      </Typography>
      {message.action}
    </div>
  );
}
