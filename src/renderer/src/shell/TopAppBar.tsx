import Search from '@mui/icons-material/Search';
import InputBase from '@mui/material/InputBase';
import Popper from '@mui/material/Popper';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { platform } from '../api';
import { Logo } from '../components/Logo';
import { md, mdAlpha, SHAPE } from '../theme';
import { useCommands } from './commands';
import { RAIL_WIDTH } from './NavigationRail';

export const TOP_BAR_HEIGHT = 64;
/** Room for the window buttons Windows and Linux draw over the bar's right end. */
const OVERLAY_ROOM = platform === 'darwin' ? 16 : 150;

// Electron's draggable-region property isn't in React's CSS types.
const drag = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties;

export const modKey = platform === 'darwin' ? '⌘' : 'Ctrl';

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [shown, setShown] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const anchor = useRef<HTMLLabelElement>(null);
  const q = value.trim();
  const done = useCallback(() => {
    setShown(false);
    input.current?.blur();
  }, []);
  const { commands, link } = useCommands(q, focused, done);
  useEffect(() => setActive(-1), [q]);
  const open = focused && shown && commands.length > 0;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShown(true);
      setActive((a) => Math.min(commands.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Enter on a suggestion runs it; otherwise the search stays in Browse.
      if (active >= 0) commands[active]?.run();
      else setShown(false);
    } else if (e.key === 'Escape') {
      if (open) setShown(false);
      else input.current?.blur();
    }
  };

  let lastGroup = '';
  return (
    <>
      <label
        ref={anchor}
        style={{
          ...noDrag,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          height: 44,
          width: '100%',
          paddingInline: 16,
          borderRadius: open ? `${SHAPE.xl}px ${SHAPE.xl}px 0 0` : SHAPE.full,
          background: md('surfaceContainerHighest'),
          color: md('onSurfaceVariant'),
          cursor: 'text',
        }}
      >
        <Search fontSize="small" />
        <InputBase
          inputRef={input}
          value={value}
          onChange={(e) => {
            setShown(true);
            onChange(e.target.value);
          }}
          onFocus={() => {
            setFocused(true);
            setShown(true);
            input.current?.select();
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          inputProps={{ 'aria-label': 'Search', spellCheck: false, id: 'global-search', role: 'combobox', 'aria-expanded': open, 'aria-controls': 'search-suggestions' }}
          sx={{ flex: 1, color: md('onSurface'), typography: 'bodyLarge', '& input::placeholder': { color: md('onSurfaceVariant'), opacity: 1 } }}
        />
        <Typography variant="labelMedium" sx={{ px: 1, py: '2px', borderRadius: `${SHAPE.xs}px`, border: `1px solid ${md('outlineVariant')}` }}>
          {modKey} F
        </Typography>
      </label>
      <Popper open={open} anchorEl={anchor.current} placement="bottom-start" style={{ zIndex: 1300, width: anchor.current?.offsetWidth }}>
        <div
          id="search-suggestions"
          role="listbox"
          // Keep the focus in the box while choosing.
          onMouseDown={(e) => e.preventDefault()}
          style={{ maxHeight: 420, overflowY: 'auto', padding: 8, background: md('surfaceContainerHighest'), borderRadius: `0 0 ${SHAPE.xl}px ${SHAPE.xl}px`, borderTop: `1px solid ${md('outlineVariant')}`, boxShadow: `0 8px 24px ${mdAlpha('shadow', 0.2)}` }}
        >
          {commands.map((c, i) => {
            const header = c.group !== lastGroup;
            lastGroup = c.group;
            const Icon = c.icon;
            return (
              <div key={c.id}>
                {header && (
                  <Typography variant="labelMedium" component="div" sx={{ px: 1.5, pt: i ? 1 : 0.25, pb: 0.5, color: md('onSurfaceVariant') }}>
                    {c.group}
                  </Typography>
                )}
                <div
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={c.run}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, height: 36, padding: '0 12px', borderRadius: SHAPE.sm, cursor: 'default', background: i === active ? mdAlpha('onSurface', 0.08) : 'transparent' }}
                >
                  <Icon sx={{ fontSize: 20, color: md('onSurfaceVariant') }} />
                  <Typography variant="bodyMedium" noWrap sx={{ color: md('onSurface'), flex: 1 }}>
                    {c.label}
                  </Typography>
                  {c.detail && (
                    <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant'), maxWidth: 240 }}>
                      {c.detail}
                    </Typography>
                  )}
                </div>
              </div>
            );
          })}
          {q && (
            <Typography variant="bodySmall" component="div" sx={{ px: 1.5, pt: 1, color: md('onSurfaceVariant') }}>
              Matching assets are in Browse. Enter to stay there, ↓ to pick one of these.
            </Typography>
          )}
        </div>
      </Popper>
      {link.dialog}
    </>
  );
}

/** The bar across the top of the window. It is also the window's title bar, so empty parts drag the window. */
export function TopAppBar({ search, trailing }: { search: ReactNode; trailing?: ReactNode }) {
  return (
    <header
      style={{
        ...drag,
        height: TOP_BAR_HEIGHT,
        // Equal outer columns keep the search box centred whatever sits at either end.
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 680px) minmax(0, 1fr)',
        alignItems: 'center',
        gap: 16,
        paddingRight: OVERLAY_ROOM,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
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
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>{search}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
        <div style={{ ...noDrag, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{trailing}</div>
      </div>
    </header>
  );
}
