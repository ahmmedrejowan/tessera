import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { md, SHAPE } from '../../theme';

/** A titled group of settings rows. */
export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <Typography variant="titleSmall" sx={{ color: md('primary'), mb: 1 }}>
        {title}
      </Typography>
      <div style={{ borderRadius: SHAPE.lg, background: md('surfaceContainerLow'), padding: '4px 20px' }}>{children}</div>
    </section>
  );
}

/** One setting: what it is, a line on what it does, and its control. */
export function Row({ title, body, children }: { title: string; body?: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderBottom: `1px solid ${md('outlineVariant')}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="bodyLarge" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        {body && (
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), wordBreak: 'break-word' }}>
            {body}
          </Typography>
        )}
      </div>
      {children}
    </div>
  );
}
