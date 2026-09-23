import Typography from '@mui/material/Typography';
import type { ComponentType, ReactNode } from 'react';
import { md, SHAPE } from '../theme';

/**
 * Nothing to show, and what to do about it. The same shape wherever it appears: it fills the space
 * it is given, sits in the middle of it, and never stretches its words across the page.
 */
export function EmptyState({ icon: Icon, title, body, actions, details }: { icon: ComponentType<{ sx?: object }>; title: string; body: ReactNode; actions?: ReactNode; details?: string }) {
  return (
    <div style={{ width: '100%', height: '100%', flex: 1, minHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 32px 64px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 460, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 64, height: 64, borderRadius: SHAPE.lg, display: 'grid', placeItems: 'center', background: md('secondaryContainer'), color: md('onSecondaryContainer'), marginBottom: 6 }}>
          <Icon sx={{ fontSize: 30 }} />
        </div>
        <Typography variant="titleLarge" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          {body}
        </Typography>
        {details && (
          <Typography variant="bodySmall" component="code" sx={{ color: md('onSurfaceVariant'), fontFamily: 'ui-monospace, Menlo, Consolas, monospace', px: 1.5, py: 0.75, borderRadius: 1, backgroundColor: md('surfaceContainerHigh'), overflowWrap: 'anywhere' }}>
            {details}
          </Typography>
        )}
        {actions && <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>{actions}</div>}
      </div>
    </div>
  );
}
