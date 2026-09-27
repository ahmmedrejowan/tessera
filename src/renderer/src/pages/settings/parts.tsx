import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import TuneRounded from '@mui/icons-material/TuneRounded';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { md, mdAlpha, SHAPE } from '../../theme';

/**
 * Which half of Settings something belongs to.
 *
 * Settings that follow the library are not the same as settings that follow Tessera: change a
 * backup and it goes with the library to another computer; change the theme and it stays here.
 * Mixing the two up is the one mistake this page invites, so the halves are told apart wherever
 * they appear, not only in a heading you may have scrolled past.
 */
export type Part = 'library' | 'app';

const TAG: Record<Part, string> = { library: 'Library Settings', app: 'App Settings' };

/** The badge each group wears, so no group has to be traced back to a heading. */
export function PartTag({ part }: { part: Part }) {
  const library = part === 'library';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        height: 22,
        padding: '0 9px',
        borderRadius: SHAPE.full,
        border: `1px solid ${library ? mdAlpha('secondary', 0.4) : md('outlineVariant')}`,
        background: library ? mdAlpha('secondaryContainer', 0.5) : 'transparent',
        color: library ? md('onSecondaryContainer') : md('onSurfaceVariant'),
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        whiteSpace: 'nowrap',
      }}
    >
      {library ? <AutoStoriesOutlined sx={{ fontSize: 13 }} /> : <TuneRounded sx={{ fontSize: 13 }} />}
      {TAG[part]}
    </span>
  );
}

/**
 * The line that starts a half of the page: whose settings follow, and what that means for them.
 * It sits in the scroll rather than clinging to the top, so the change of half is a place you
 * pass through and not a label that quietly swaps over.
 */
export function PartHeading({ part, name }: { part: Part; name: string }) {
  const library = part === 'library';
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            background: library ? md('secondaryContainer') : md('surfaceContainerHigh'),
            color: library ? md('onSecondaryContainer') : md('onSurface'),
          }}
        >
          {library ? <AutoStoriesOutlined sx={{ fontSize: 22 }} /> : <TuneRounded sx={{ fontSize: 22 }} />}
        </span>
        <div style={{ minWidth: 0 }}>
          <Typography variant="titleLarge" component="h2" noWrap sx={{ color: md('onSurface') }}>
            {library ? name : 'App Settings'}
          </Typography>
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
            {library ? 'Kept inside this library, and travels with it to your other computers' : 'Kept on this computer, and the same whichever library is open'}
          </Typography>
        </div>
      </div>
      <div style={{ height: 2, marginTop: 14, borderRadius: 2, background: library ? mdAlpha('secondary', 0.7) : md('outlineVariant') }} />
    </div>
  );
}

/** A titled group of settings rows, with a line saying what the group is for. */
export function Group({ title, note, part, children }: { title: string; note?: ReactNode; part?: Part; children: ReactNode }) {
  const library = part === 'library';
  return (
    <section style={{ marginBottom: 36 }}>
      {/* No badge where there are no halves to tell apart, as on the About page. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Typography variant="titleMedium" component="h3" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        {part && <PartTag part={part} />}
      </div>
      {note && (
        <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5, maxWidth: 680 }}>
          {note}
        </Typography>
      )}
      <Box
        sx={{
          mt: 1.5,
          borderRadius: `${SHAPE.lg}px`,
          // The library's own settings are tinted, so a glance says which half you are in
          // without reading a word of it.
          backgroundColor: library ? mdAlpha('secondaryContainer', 0.22) : md('surfaceContainerLow'),
          borderLeft: `3px solid ${library ? mdAlpha('secondary', 0.7) : 'transparent'}`,
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

/**
 * One setting: what it is, a line on what it does, and its control. The line under it is set
 * here rather than inline, so the group can take it off the last row.
 */
export function Row({ title, body, children }: { title: ReactNode; body?: ReactNode; children?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, py: 2.25, borderBottom: `1px solid ${md('outlineVariant')}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="bodyLarge" component="div" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        {body && (
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.25, wordBreak: 'break-word', maxWidth: 680 }}>
            {body}
          </Typography>
        )}
      </div>
      {children && <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>}
    </Box>
  );
}
