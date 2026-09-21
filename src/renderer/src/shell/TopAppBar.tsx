import Search from '@mui/icons-material/Search';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import type { CSSProperties, ReactNode } from 'react';
import { platform } from '../api';
import { Logo } from '../components/Logo';
import { md, SHAPE } from '../theme';
import { RAIL_WIDTH } from './NavigationRail';

export const TOP_BAR_HEIGHT = 64;
/** Room for the window buttons Windows and Linux draw over the bar's right end. */
const OVERLAY_ROOM = platform === 'darwin' ? 16 : 150;

// Electron's draggable-region property isn't in React's CSS types.
const drag = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties;

export const modKey = platform === 'darwin' ? '⌘' : 'Ctrl';

export function SearchField({ value, onChange, onFocus }: { value: string; onChange: (v: string) => void; onFocus?: () => void }) {
  return (
    <label
      style={{
        ...noDrag,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 44,
        width: '100%',
        maxWidth: 680,
        paddingInline: 16,
        borderRadius: SHAPE.full,
        background: md('surfaceContainerHighest'),
        color: md('onSurfaceVariant'),
        cursor: 'text',
      }}
    >
      <Search fontSize="small" />
      <InputBase
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...(onFocus ? { onFocus } : {})}
        placeholder="Search packs, assets and tags"
        inputProps={{ 'aria-label': 'Search', spellCheck: false }}
        sx={{ flex: 1, color: md('onSurface'), typography: 'bodyLarge', '& input::placeholder': { color: md('onSurfaceVariant'), opacity: 1 } }}
      />
      <Typography variant="labelMedium" sx={{ px: 1, py: '2px', borderRadius: `${SHAPE.xs}px`, border: `1px solid ${md('outlineVariant')}` }}>
        {modKey} K
      </Typography>
    </label>
  );
}

/** The bar across the top of the window. It is also the window's title bar, so empty parts drag the window. */
export function TopAppBar({ search, trailing }: { search: ReactNode; trailing?: ReactNode }) {
  return (
    <header
      style={{
        ...drag,
        height: TOP_BAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        paddingRight: OVERLAY_ROOM,
      }}
    >
      {/* On macOS the traffic lights sit above the rail; elsewhere the logo does. */}
      <div style={{ width: RAIL_WIDTH, flexShrink: 0, display: 'grid', placeItems: 'center' }}>{platform !== 'darwin' && <Logo />}</div>
      {platform === 'darwin' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: -8 }}>
          <Logo size={24} />
          <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
            Tessera
          </Typography>
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>{search}</div>
      <div style={{ ...noDrag, display: 'flex', alignItems: 'center', gap: 8 }}>{trailing}</div>
    </header>
  );
}
