import CloseRounded from '@mui/icons-material/CloseRounded';
import KeyboardOutlined from '@mui/icons-material/KeyboardOutlined';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Fragment } from 'react';
import { create } from 'zustand';
import { platform } from '../api';
import { md, SHAPE } from '../theme';

export const useShortcuts = create<{ open: boolean; toggle: () => void; close: () => void }>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));

const mac = platform === 'darwin';
/** Key names as this platform writes them. */
const K = { mod: mac ? '⌘' : 'Ctrl', shift: mac ? '⇧' : 'Shift', alt: mac ? '⌥' : 'Alt' };

/** Each shortcut is a list of alternatives; each alternative a list of keys pressed together. */
type Keys = string[][];

const GROUPS: { title: string; items: [string, Keys][] }[] = [
  {
    title: 'Anywhere',
    items: [
      ['Search, or go to a page or action', [[K.mod, 'F']]],
      ['Go to Home … Inbox (in rail order)', [[K.mod, '1'], [K.mod, '5']]],
      ['Back · Forward', mac ? [[K.mod, '['], [K.mod, ']']] : [[K.alt, '←'], [K.alt, '→']]],
      ['Add downloads', [[K.mod, 'O']]],
      ['Add a folder of packs', [[K.mod, K.shift, 'O']]],
      ['Settings', [[K.mod, ',']]],
      ['Keyboard shortcuts', [[K.mod, '/']]],
    ],
  },
  {
    title: 'Search box',
    items: [
      ['Move through the suggestions', [['↑'], ['↓']]],
      ['Run the suggestion (or stay in Browse)', [['Enter']]],
      ['Close the suggestions', [['Esc']]],
    ],
  },
  {
    title: 'Browse',
    items: [
      ['Move between assets', [['←'], ['→'], ['↑'], ['↓']]],
      ['Look at an asset', [['Space'], ['Enter']]],
      ['Select more · a range', [[K.mod, 'click'], [K.shift, 'click']]],
      ['Clear the selection', [['Esc']]],
    ],
  },
  {
    title: 'Viewer',
    items: [
      ['Previous · next asset', [['←'], ['→']]],
      ['Fit to the window · actual size', [['F'], ['1']]],
      ['Show or hide details', [['I']]],
      ['Close', [['Space'], ['Esc']]],
    ],
  },
  {
    title: 'Window',
    items: [
      ['Zoom in · out · reset', [[K.mod, '+'], [K.mod, '−'], [K.mod, '0']]],
      ['Full screen', mac ? [['⌃', K.mod, 'F']] : [['F11']]],
    ],
  },
];

function Key({ children }: { children: string }) {
  return (
    <span style={{ display: 'inline-grid', placeItems: 'center', minWidth: 26, height: 26, padding: '0 7px', borderRadius: SHAPE.xs + 2, border: `1px solid ${md('outlineVariant')}`, borderBottomWidth: 2, background: md('surfaceContainerHigh'), color: md('onSurface'), fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
      {children}
    </span>
  );
}

/** Every keyboard shortcut, grouped by where it works. */
export function ShortcutsDialog() {
  const open = useShortcuts((s) => s.open);
  const close = useShortcuts((s) => s.close);
  return (
    <Dialog open={open} onClose={close} maxWidth={false} slotProps={{ paper: { sx: { width: 760, maxWidth: 'calc(100vw - 48px)', borderRadius: `${SHAPE.xl}px`, p: 0 } } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 20px 8px 28px' }}>
        <KeyboardOutlined sx={{ color: md('primary') }} />
        <Typography variant="titleLarge" sx={{ flex: 1, color: md('onSurface') }}>
          Keyboard shortcuts
        </Typography>
        <IconButton aria-label="Close" onClick={close}>
          <CloseRounded />
        </IconButton>
      </div>
      <div style={{ padding: '8px 28px 28px', columns: '2 320px', columnGap: 40 }}>
        {GROUPS.map((g) => (
          <section key={g.title} style={{ breakInside: 'avoid', marginBottom: 20 }}>
            <Typography variant="labelLarge" component="h3" sx={{ color: md('primary'), mb: 1 }}>
              {g.title}
            </Typography>
            {g.items.map(([label, keys]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 34 }}>
                <Typography variant="bodyMedium" sx={{ flex: 1, color: md('onSurfaceVariant') }}>
                  {label}
                </Typography>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {keys.map((combo, i) => (
                    <Fragment key={i}>
                      {i > 0 && <span style={{ color: md('outline'), fontSize: 12 }}>{label.startsWith('Go to Home') ? '–' : '/'}</span>}
                      <span style={{ display: 'flex', gap: 3 }}>
                        {combo.map((k) => (
                          <Key key={k}>{k}</Key>
                        ))}
                      </span>
                    </Fragment>
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Dialog>
  );
}

/** The keyboard button beside the bell. */
export function ShortcutsButton() {
  return (
    <Tooltip title={`Keyboard shortcuts (${K.mod} /)`}>
      <ButtonBase aria-label="Keyboard shortcuts" onClick={() => useShortcuts.getState().toggle()} sx={{ width: 40, height: 40, borderRadius: `${SHAPE.full}px`, '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}>
        <KeyboardOutlined sx={{ fontSize: 22, color: md('onSurfaceVariant') }} />
      </ButtonBase>
    </Tooltip>
  );
}
