import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DriveFileMoveOutlined from '@mui/icons-material/DriveFileMoveOutlined';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import type { ComponentType, ReactNode } from 'react';
import { formatBytes } from '../../components/labels';
import { md, mdAlpha, SHAPE } from '../../theme';

export interface KeptChoice<T extends string> {
  value: T;
  title: string;
  body: string;
  icon: ComponentType<{ sx?: object }>;
  /** What it costs on disk, as a signed number of bytes. */
  adds?: number;
  /** Shown in the card itself, not as a footnote: the thing somebody would be cross to discover. */
  warning?: string;
  /** Under the body: the folder that will be read, the paths that were found. */
  detail?: ReactNode;
  disabled?: string;
  recommended?: boolean;
}

/**
 * The choice that decides what is written where.
 *
 * Cards rather than a dropdown, and never a tick box, because this is the one decision on the
 * page that cannot be shrugged off: it says whether somebody's 300 GB is about to be copied,
 * taken over, or left alone. Each card carries what it costs and what it costs you, in the card,
 * because a warning under three options is a warning nobody reads.
 */
export function HowKept<T extends string>({ label, value, choices, onChange }: { label: string; value: T; choices: KeptChoice<T>[]; onChange: (v: T) => void }) {
  return (
    <section>
      <Typography variant="titleSmall" component="h3" sx={{ color: md('onSurface'), mb: 1 }}>
        {label}
      </Typography>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {choices.map((c) => {
          const on = c.value === value;
          const off = !!c.disabled;
          return (
            <ButtonBase
              key={c.value}
              disabled={off}
              onClick={() => onChange(c.value)}
              aria-pressed={on}
              sx={{
                display: 'block',
                textAlign: 'left',
                width: '100%',
                p: 1.75,
                borderRadius: `${SHAPE.lg}px`,
                border: `1.5px solid ${on ? md('primary') : md('outlineVariant')}`,
                backgroundColor: on ? mdAlpha('primaryContainer', 0.45) : md('surfaceContainerLow'),
                opacity: off ? 0.5 : 1,
                '&:hover': { backgroundColor: on ? mdAlpha('primaryContainer', 0.5) : md('surfaceContainerHigh') },
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 11,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    background: on ? md('primary') : md('surfaceContainerHighest'),
                    color: on ? md('onPrimary') : md('onSurfaceVariant'),
                  }}
                >
                  {on ? <CheckCircleRounded sx={{ fontSize: 20 }} /> : <c.icon sx={{ fontSize: 20 }} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Typography variant="bodyLarge" sx={{ color: md('onSurface') }}>
                      {c.title}
                    </Typography>
                    {c.recommended && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: SHAPE.full, background: md('secondaryContainer'), color: md('onSecondaryContainer') }}>
                        recommended
                      </span>
                    )}
                    <span style={{ flex: 1 }} />
                    {c.adds !== undefined && (
                      <Typography variant="labelLarge" sx={{ color: c.adds > 0 ? md('onSurface') : md('onSurfaceVariant'), whiteSpace: 'nowrap' }}>
                        {c.adds > 0 ? `+${formatBytes(c.adds)}` : 'nothing more'}
                      </Typography>
                    )}
                  </div>
                  <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.25 }}>
                    {c.disabled ?? c.body}
                  </Typography>
                  {c.detail && !off && (
                    <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5, wordBreak: 'break-all', opacity: 0.85 }}>
                      {c.detail}
                    </Typography>
                  )}
                  {c.warning && !off && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 8 }}>
                      <WarningAmberOutlined sx={{ fontSize: 16, color: md('error'), mt: '1px' }} />
                      <Typography variant="bodySmall" sx={{ color: md('error') }}>
                        {c.warning}
                      </Typography>
                    </div>
                  )}
                </div>
              </div>
            </ButtonBase>
          );
        })}
      </div>
    </section>
  );
}

export const KEPT_ICONS = { copy: ContentCopyRounded, move: DriveFileMoveOutlined, keep: LinkOutlined };
