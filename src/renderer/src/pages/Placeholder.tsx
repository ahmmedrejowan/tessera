import ArrowBack from '@mui/icons-material/ArrowBack';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { md } from '../theme';

/**
 * The measurements every page's top shares. One place to change them, so Home, Browse, a pack
 * and Settings all start at the same height and the same distance from the edge.
 */
export const PAGE = {
  /** Around the title row. */
  header: '20px 32px 12px',
  /** Around what's under it. */
  body: '0 32px 32px',
  gutter: 32,
} as const;

interface PageProps {
  title: ReactNode;
  /** A line under the title: a count, or what this page is for. */
  subtitle?: ReactNode;
  /** To the right of the title. */
  actions?: ReactNode;
  /** Anything else in the title row, between the title and the actions. */
  aside?: ReactNode;
  /** Go back (a pack, a collection or a project opened from somewhere else). */
  onBack?: () => void;
  /** Widest the content gets, centred; left as it is when not given. */
  width?: number;
  /** The content sees to its own padding (a grid that goes to the edges). */
  flush?: boolean;
  children: ReactNode;
}

/** Page frame: a headline, what the page says about itself, its actions, and the page below. */
export function Page({ title, subtitle, actions, aside, onBack, width, flush, children }: PageProps) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: PAGE.header }}>
        {onBack && (
          <Tooltip title="Back">
            <IconButton onClick={onBack} aria-label="Back" sx={{ ml: -1.5, mt: -0.5 }}>
              <ArrowBack />
            </IconButton>
          </Tooltip>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography variant="headlineSmall" component="h1" sx={{ color: md('onSurface') }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </div>
        {aside}
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {flush ? children : <div style={{ padding: PAGE.body, ...(width ? { maxWidth: width, margin: '0 auto' } : {}) }}>{children}</div>}
      </div>
    </div>
  );
}
