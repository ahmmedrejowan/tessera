import Typography from '@mui/material/Typography';
import type { ComponentType, ReactNode } from 'react';
import { md } from '../theme';

/** One message, what fills this place, and the action that fills it. */
export function EmptyState({ icon: Icon, title, body, actions, details }: { icon: ComponentType<{ sx?: object }>; title: string; body: ReactNode; actions?: ReactNode; details?: string }) {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 32 }}>
      <div style={{ maxWidth: 440, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 72, height: 72, borderRadius: 24, display: 'grid', placeItems: 'center', background: md('secondaryContainer'), color: md('onSecondaryContainer'), marginBottom: 8 }}>
          <Icon sx={{ fontSize: 36 }} />
        </div>
        <Typography variant="headlineSmall" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        <Typography variant="bodyLarge" sx={{ color: md('onSurfaceVariant') }}>
          {body}
        </Typography>
        {details && (
          <Typography variant="bodySmall" component="code" sx={{ color: md('onSurfaceVariant'), fontFamily: 'ui-monospace, Menlo, Consolas, monospace', px: 1.5, py: 0.75, borderRadius: 1, backgroundColor: md('surfaceContainerHigh'), overflowWrap: 'anywhere' }}>
            {details}
          </Typography>
        )}
        {actions && <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>{actions}</div>}
      </div>
    </div>
  );
}
