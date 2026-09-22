import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import DriveFileMoveOutlined from '@mui/icons-material/DriveFileMoveOutlined';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import LibraryAddRounded from '@mui/icons-material/LibraryAddRounded';
import SavingsOutlined from '@mui/icons-material/SavingsOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import UsbRounded from '@mui/icons-material/UsbRounded';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { create } from 'zustand';
import { baseName } from '@shared/folders';
import { call } from '../../api';
import { failed, notify } from '../../notices/store';
import { md, mdAlpha, SHAPE } from '../../theme';
import { LocationFields, Note, tidyPath, useLocation } from './Location';

type Mode = 'create' | 'open';

interface LibraryDialogState {
  mode: Mode | null;
  /** A folder to start from: where to create, or what to open. */
  start: string | null;
  show(mode: Mode, start?: string | null): void;
  hide(): void;
}

export const useLibraryDialog = create<LibraryDialogState>((set) => ({
  mode: null,
  start: null,
  show: (mode, start = null) => set({ mode, start }),
  hide: () => set({ mode: null }),
}));

interface Tip {
  icon: ComponentType<{ sx?: object }>;
  title: string;
  body: string;
}

const TIPS: Record<Mode, { icon: ComponentType<{ sx?: object }>; title: string; lead: string; tips: Tip[] }> = {
  create: {
    icon: LibraryAddRounded,
    title: 'Create a library',
    lead: 'One folder for every pack you own, with its licence kept beside it.',
    tips: [
      { icon: Inventory2Outlined, title: 'Downloads, untouched', body: 'Packs are stored as they arrived. Nothing is converted or renamed.' },
      { icon: SavingsOutlined, title: 'Room to grow', body: 'Libraries get big. A roomy drive, inside or external, is ideal.' },
      { icon: DriveFileMoveOutlined, title: 'Just a folder', body: 'Move it, back it up or sync it whenever you like.' },
    ],
  },
  open: {
    icon: FolderOpenRounded,
    title: 'Open a library',
    lead: 'Pick up a library you already have, on this computer or a drive.',
    tips: [
      { icon: SearchRounded, title: 'Close is good enough', body: 'Pick the library, a folder inside it, or the folder that holds it. Tessera finds it.' },
      { icon: UsbRounded, title: 'On another drive?', body: 'Connect the drive first, then choose the library on it.' },
      { icon: DevicesRounded, title: 'On another computer?', body: 'Use “Get one from another computer” on the welcome screen instead.' },
    ],
  },
};

/** The coloured side of the dialog: what this is, and a few things worth knowing. */
function Side({ mode }: { mode: Mode }) {
  const { icon: Icon, title, lead, tips } = TIPS[mode];
  return (
    <div
      style={{
        padding: '32px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        background: `radial-gradient(120% 70% at 0% 0%, ${mdAlpha('primaryContainer', 0.9)} 0%, transparent 70%), radial-gradient(100% 60% at 100% 100%, ${mdAlpha('tertiaryContainer', 0.7)} 0%, transparent 70%), ${md('secondaryContainer')}`,
        color: md('onSecondaryContainer'),
      }}
    >
      <div>
        <span style={{ width: 56, height: 56, borderRadius: 18, display: 'grid', placeItems: 'center', background: md('primary'), color: md('onPrimary'), marginBottom: 20, boxShadow: `0 6px 18px ${mdAlpha('primary', 0.3)}` }}>
          <Icon sx={{ fontSize: 28 }} />
        </span>
        <Typography variant="headlineSmall" component="h2" sx={{ fontWeight: 500 }}>
          {title}
        </Typography>
        <Typography variant="bodyMedium" sx={{ mt: 1, opacity: 0.85 }}>
          {lead}
        </Typography>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {tips.map(({ icon: TipIcon, title: t, body }) => (
          <div key={t} style={{ display: 'flex', gap: 12 }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: mdAlpha('surface', 0.55), flexShrink: 0 }}>
              <TipIcon sx={{ fontSize: 18 }} />
            </span>
            <div>
              <Typography variant="labelLarge" component="div">
                {t}
              </Typography>
              <Typography variant="bodySmall" component="div" sx={{ opacity: 0.8 }}>
                {body}
              </Typography>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Shell({ mode, onClose, children, footer }: { mode: Mode; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', minHeight: 560 }}>
      <Side mode={mode} />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', top: 12, right: 12 }}>
          <CloseRounded />
        </IconButton>
        <div style={{ flex: 1, overflowY: 'auto', padding: '36px 32px 16px' }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '16px 24px 20px', borderTop: `1px solid ${md('outlineVariant')}` }}>{footer}</div>
      </div>
    </div>
  );
}

function CreatePane({ start, onClose, onOpenInstead }: { start: string | null; onClose: () => void; onOpenInstead: (path: string) => void }) {
  const loc = useLocation('Tessera Library', start);
  const [libName, setLibName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The library's name follows the folder's until it's changed by hand.
  const name = libName ?? (loc.itself ? (loc.parentInfo?.name ?? '') : loc.name.trim());
  const create = async () => {
    if (!loc.target || loc.blocker) return;
    setBusy(true);
    try {
      const s = await call('library:create', loc.target, name.trim() || baseName(loc.target));
      if (s.status === 'ready') onClose();
      else if (s.status === 'error') notify.error('Couldn’t create the library', { body: s.message });
    } catch (e) {
      failed(e, 'Couldn’t create the library');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell
      mode="create"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" disabled={busy || !!loc.blocker} onClick={() => void create()} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LibraryAddRounded />} sx={{ px: 3 }}>
            Create library
          </Button>
        </>
      }
    >
      <LocationFields loc={loc} what="library" pickerTitle="Choose where your library goes" onOpenExisting={onOpenInstead} />
      <div style={{ marginTop: 24 }}>
        <TextField
          fullWidth
          size="small"
          label="Library name (shown in Tessera)"
          value={name}
          onChange={(e) => setLibName(e.target.value)}
          helperText="You can change it later. The folder keeps its own name."
        />
      </div>
    </Shell>
  );
}

function FoundCard({ lib, selected, onSelect }: { lib: { path: string; name: string; packs: number }; selected: boolean; onSelect: () => void }) {
  return (
    <ButtonBase
      onClick={onSelect}
      sx={{
        width: '100%',
        justifyContent: 'flex-start',
        gap: 1.75,
        p: 1.75,
        borderRadius: `${SHAPE.lg}px`,
        textAlign: 'left',
        border: `2px solid ${selected ? md('primary') : md('outlineVariant')}`,
        backgroundColor: selected ? md('primaryContainer') : md('surfaceContainerLow'),
        transition: 'all 150ms',
      }}
    >
      <span style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: selected ? md('primary') : md('secondaryContainer'), color: selected ? md('onPrimary') : md('onSecondaryContainer'), flexShrink: 0 }}>
        <AutoStoriesOutlined />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleMedium" component="div" noWrap sx={{ color: md('onSurface') }}>
          {lib.name}
        </Typography>
        <Typography variant="bodySmall" component="div" noWrap sx={{ color: md('onSurfaceVariant') }}>
          {lib.packs} pack{lib.packs === 1 ? '' : 's'} · {tidyPath(lib.path)}
        </Typography>
      </span>
      {selected && <CheckCircleRounded sx={{ color: md('primary') }} />}
    </ButtonBase>
  );
}

function OpenPane({ start, onClose, onCreateHere }: { start: string | null; onClose: () => void; onCreateHere: (path: string) => void }) {
  const [picked, setPicked] = useState<string | null>(start);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const result = useQuery({ queryKey: ['locate', picked], queryFn: () => call('library:locate', picked!), enabled: !!picked, staleTime: 0 });
  const found = result.data?.found ?? [];
  useEffect(() => setChosen(found.length === 1 ? found[0]!.path : null), [result.data]);

  const choose = async () => {
    const p = await call('dialog:folder', 'Choose your library', { message: 'Choose your library’s folder, or a folder inside it', buttonLabel: 'Choose', ...(picked ? { defaultPath: picked } : {}) });
    if (p) setPicked(p);
  };
  const open = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      const s = await call('library:open', chosen);
      if (s.status === 'ready') onClose();
      else if (s.status === 'error') notify.error('Couldn’t open the library', { body: s.message });
    } catch (e) {
      failed(e, 'Couldn’t open the library');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      mode="open"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" disabled={!chosen || busy} onClick={() => void open()} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <FolderOpenRounded />} sx={{ px: 3 }}>
            Open library
          </Button>
        </>
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const path = window.tessera.pathsFor([...e.dataTransfer.files])[0];
          if (path) setPicked(path);
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        {!picked ? (
          <ButtonBase
            onClick={() => void choose()}
            sx={{ flexDirection: 'column', gap: 1.5, py: 6, borderRadius: `${SHAPE.xl}px`, border: `2px dashed ${dragging ? md('primary') : md('outlineVariant')}`, backgroundColor: dragging ? md('primaryContainer') : md('surfaceContainerLow'), transition: 'all 150ms' }}
          >
            <span style={{ width: 64, height: 64, borderRadius: 20, display: 'grid', placeItems: 'center', background: md('secondaryContainer'), color: md('onSecondaryContainer') }}>
              <FolderOpenRounded sx={{ fontSize: 32 }} />
            </span>
            <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
              Choose the library’s folder
            </Typography>
            <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
              or drop it here
            </Typography>
          </ButtonBase>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 16px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow'), border: `1px ${dragging ? 'dashed' : 'solid'} ${dragging ? md('primary') : md('outlineVariant')}` }}>
              <FolderOpenRounded sx={{ color: md('onSurfaceVariant') }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography variant="labelMedium" component="div" sx={{ color: md('onSurfaceVariant') }}>
                  You chose
                </Typography>
                <Typography variant="bodyMedium" component="div" noWrap sx={{ color: md('onSurface') }} title={picked}>
                  {tidyPath(picked)}
                </Typography>
              </div>
              <Button variant="outlined" onClick={() => void choose()}>
                Change…
              </Button>
            </div>

            {result.isFetching && !result.data && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: md('onSurfaceVariant') }}>
                <CircularProgress size={18} /> Looking for a library…
              </div>
            )}
            {result.data && result.data.via !== 'none' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
                  {result.data.via === 'itself' ? 'Found it' : result.data.via === 'parent' ? 'This folder is part of a library' : found.length > 1 ? `${found.length} libraries in this folder — pick one` : 'Found a library in this folder'}
                </Typography>
                {found.map((lib) => (
                  <FoundCard key={lib.path} lib={lib} selected={chosen === lib.path} onSelect={() => setChosen(lib.path)} />
                ))}
              </div>
            )}
            {result.data?.via === 'none' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '28px 16px', borderRadius: SHAPE.xl, background: md('surfaceContainerLow') }}>
                <span style={{ width: 56, height: 56, borderRadius: 18, display: 'grid', placeItems: 'center', background: md('surfaceContainerHighest'), color: md('onSurfaceVariant') }}>
                  <SearchRounded />
                </span>
                <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
                  No library here
                </Typography>
                <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), maxWidth: 360 }}>
                  “{baseName(picked)}” isn’t a Tessera library, isn’t inside one, and doesn’t hold one.
                </Typography>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <Button onClick={() => void choose()}>Choose another</Button>
                  <Button variant="outlined" startIcon={<LibraryAddRounded />} onClick={() => onCreateHere(picked)}>
                    Create one here
                  </Button>
                </div>
              </div>
            )}
            {result.data?.via === 'parent' && <Note tone="info">You picked a folder inside the library; it’s the library itself that opens.</Note>}
          </>
        )}
      </div>
    </Shell>
  );
}

/** Create or open a library: one roomy dialog with the choice of folder, the name and anything worth knowing. */
export function LibraryDialog() {
  const { mode, start, show, hide } = useLibraryDialog();
  // Keep the last mode while the dialog animates out.
  const [shown, setShown] = useState<Mode>('create');
  useEffect(() => {
    if (mode) setShown(mode);
  }, [mode]);
  const current = mode ?? shown;
  return (
    <Dialog open={!!mode} onClose={hide} maxWidth={false} slotProps={{ paper: { sx: { width: 920, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 48px)', borderRadius: `${SHAPE.xl}px`, overflow: 'hidden', backgroundImage: 'none', p: 0 } } }}>
      {current === 'create' ? (
        <CreatePane key={`c${start}`} start={start} onClose={hide} onOpenInstead={(p) => show('open', p)} />
      ) : (
        <OpenPane key={`o${start}`} start={start} onClose={hide} onCreateHere={(p) => show('create', p)} />
      )}
    </Dialog>
  );
}
