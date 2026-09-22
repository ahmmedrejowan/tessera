import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { md, SHAPE } from '../../theme';

/** A titled group of settings rows, with a line saying what the group is for. */
export function Group({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <Typography variant="titleMedium" component="h3" sx={{ color: md('onSurface') }}>
        {title}
      </Typography>
      {note && (
        <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5, maxWidth: 640 }}>
          {note}
        </Typography>
      )}
      <Box
        sx={{
          mt: 1.5,
          borderRadius: `${SHAPE.lg}px`,
          backgroundColor: md('surfaceContainerLow'),
          px: 3,
          // The last row in a group needs no line under it.
          '& > *:last-child': { borderBottom: 'none' },
        }}
      >
        {children}
      </Box>
    </section>
  );
}

/** One setting: what it is, a line on what it does, and its control. */
export function Row({ title, body, children }: { title: ReactNode; body?: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '18px 0', borderBottom: `1px solid ${md('outlineVariant')}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="bodyLarge" component="div" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        {body && (
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.25, wordBreak: 'break-word', maxWidth: 560 }}>
            {body}
          </Typography>
        )}
      </div>
      {children && <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>}
    </div>
  );
}
