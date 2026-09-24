import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { md, SHAPE } from '../theme';

/**
 * A block in Home's side column: a quiet heading with an optional note and action, then the card
 * itself. Everything in that column is built from this, so the column reads as one thing.
 */
export function SideBlock({ title, note, action, children }: { title: string; note?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', minHeight: 30 }}>
        <Typography variant="titleSmall" component="h2" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        {note && (
          <Typography variant="bodySmall" component="div" noWrap sx={{ flex: 1, minWidth: 0, color: md('onSurfaceVariant'), display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {note}
          </Typography>
        )}
        {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
      </div>
      <div style={{ borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>{children}</div>
    </section>
  );
}
