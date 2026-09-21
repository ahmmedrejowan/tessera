import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { md } from '../theme';

/** Page frame: a headline and the page's content below it. */
export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '24px 32px 8px' }}>
        <Typography variant="headlineSmall" component="h1" sx={{ color: md('onSurface'), flex: 1 }}>
          {title}
        </Typography>
        {actions}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </div>
  );
}
