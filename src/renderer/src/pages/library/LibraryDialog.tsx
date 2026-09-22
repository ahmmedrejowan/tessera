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
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { create } from 'zustand';
import { baseName } from '@shared/folders';
import { call } from '../../api';
import { StatusSlot, type SlotMessage } from '../../components/StatusSlot';
import { failed, notify } from '../../notices/store';
import { md, mdAlpha, SHAPE } from '../../theme';
import { FolderCard, LocationFields, SectionLabel, tidyPath, useFolder, useLocation } from './Location';

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

/** One size for every state, so nothing jumps as the form changes. */
export const DIALOG_HEIGHT = 600;
export const DIALOG_WIDTH = 960;

interface Tip {
  icon: ComponentType<{ sx?: object }>;
  title: string;
  body: string;
}

const SIDES: Record<Mode, { icon: ComponentType<{ sx?: object }>; title: string; lead: string; tips: Tip[] }> = {
  create: {
    icon: LibraryAddRounded,
    title: 'Create a library',
    lead: 'A home for every pack you own.',
    tips: [
      { icon: Inventory2Outlined, title: 'Kept as downloaded', body: 'Packs are never changed.' },
      { icon: SavingsOutlined, title: 'Room to grow', body: 'Pick a roomy drive.' },
      { icon: DriveFileMoveOutlined, title: 'Just a folder', body: 'Move or back it up anytime.' },
    ],
  },
  open: {
    icon: FolderOpenRounded,
    title: 'Open a library',
    lead: 'One you already have.',
    tips: [
      { icon: SearchRounded, title: 'Close is fine', body: 'A folder in it or above it works.' },
      { icon: UsbRounded, title: 'On a drive?', body: 'Connect it first.' },
      { icon: DevicesRounded, title: 'On another computer?', body: 'Use “From another computer”.' },
    ],
  },
};

/** The coloured side of a setup dialog: what this is, and a few things worth knowing. */
export function Side({ icon: Icon, title, lead, children }: { icon: ComponentType<{ sx?: object }>; title: string; lead: ReactNode; children?: ReactNode }) {
  return (
    <div
      style={{
        padding: '32px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
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
        <Typography variant="bodyMedium" component="div" sx={{ mt: 1, opacity: 0.85 }}>
          {lead}
        </Typography>
      </div>
      {children}
    </div>
  );
}

function Tips({ tips }: { tips: Tip[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {tips.map(({ icon: TipIcon, title, body }) => (
        <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: mdAlpha('surface', 0.55), flexShrink: 0 }}>
            <TipIcon sx={{ fontSize: 18 }} />
          </span>
          <div>
            <Typography variant="labelLarge" component="div">
              {title}
            </Typography>
            <Typography variant="bodySmall" component="div" sx={{ opacity: 0.8 }}>
              {body}
            </Typography>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The frame every setup dialog shares: side panel, content that scrolls if it must, and actions. */
export function SetupFrame({ side, onClose, children, footer }: { side: ReactNode; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', height: '100%' }}>
      {side}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', top: 12, right: 12, zIndex: 1 }}>
          <CloseRounded />
        </IconButton>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '36px 32px 16px' }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '16px 24px 20px', borderTop: `1px solid ${md('outlineVariant')}` }}>{footer}</div>
      </div>
    </div>
  );
}

function ModeSide({ mode }: { mode: Mode }) {
  const s = SIDES[mode];
  return (
    <Side icon={s.icon} title={s.title} lead={s.lead}>
      <Tips tips={s.tips} />
    </Side>
  );
}

function CreatePane({ start, onClose, onOpenInstead }: { start: string | null; onClose: () => void; onOpenInstead: (path: string) => void }) {
  const loc = useLocation('Tessera Library', start, onOpenInstead);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!loc.target || loc.blocked) return;
    setBusy(true);
    try {
      const s = await call('library:create', loc.target, loc.libraryName);
      if (s.status === 'ready') onClose();
      else if (s.status === 'error') notify.error('Couldn’t create the library', { body: s.message });
    } catch (e) {
      failed(e, 'Couldn’t create the library');
    } finally {
      setBusy(false);
    }
  };
  return (
    <SetupFrame
      side={<ModeSide mode="create" />}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" disabled={busy || loc.blocked} onClick={() => void create()} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LibraryAddRounded />} sx={{ px: 3 }}>
            Create library
          </Button>
        </>
      }
    >
      <LocationFields loc={loc} pickerTitle="Choose where your library goes" />
    </SetupFrame>
  );
}

function FoundCard({ lib, selected, onSelect }: { lib: { path: string; name: string; packs: number }; selected: boolean; onSelect: () => void }) {
  return (
    <ButtonBase
      onClick={onSelect}
      sx={{
        width: '100%',
        height: 76,
        flexShrink: 0,
        justifyContent: 'flex-start',
        gap: 1.75,
        px: 1.75,
        borderRadius: `${SHAPE.lg}px`,
        textAlign: 'left',
        border: `2px solid ${selected ? md('primary') : md('outlineVariant')}`,
        backgroundColor: selected ? md('primaryContainer') : md('surfaceContainerLow'),
        transition: 'background-color 150ms, border-color 150ms',
      }}
    >
      <span style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: selected ? md('primary') : md('secondaryContainer'), color: selected ? md('onPrimary') : md('onSecondaryContainer'), flexShrink: 0 }}>
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
  const info = useFolder(picked).data;
  const result = useQuery({ queryKey: ['locate', picked], queryFn: () => call('library:locate', picked!), enabled: !!picked, staleTime: 0 });
  const found = result.data?.found ?? [];
  useEffect(() => setChosen(found.length === 1 ? found[0]!.path : null), [result.data]);

  const choose = async () => {
    const p = await call('dialog:folder', 'Choose your library', { message: 'Choose your library’s folder', buttonLabel: 'Choose', ...(picked ? { defaultPath: picked } : {}) });
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

  const via = result.data?.via;
  const message: SlotMessage | null =
    via === 'none'
      ? {
          tone: 'error',
          text: `No library in “${baseName(picked ?? '')}”.`,
          action: (
            <Button size="small" color="inherit" startIcon={<LibraryAddRounded />} onClick={() => onCreateHere(picked!)}>
              Create one here
            </Button>
          ),
        }
      : via === 'parent'
        ? { tone: 'info', text: 'That folder is inside a library; the library opens.' }
        : via === 'inside' && found.length > 1
          ? { tone: 'info', text: `${found.length} libraries here. Pick one.` }
          : null;

  return (
    <SetupFrame
      side={<ModeSide mode="open" />}
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
        style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        <div>
          <SectionLabel n={1}>Choose its folder</SectionLabel>
          <FolderCard info={info} path={picked} onChange={() => void choose()} placeholder="Choose, or drop a folder here" />
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <SectionLabel n={2}>Library</SectionLabel>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              borderRadius: SHAPE.lg,
              border: found.length ? 'none' : `2px dashed ${dragging ? md('primary') : md('outlineVariant')}`,
              background: dragging && !found.length ? md('primaryContainer') : 'transparent',
              ...(found.length ? {} : { alignItems: 'center', justifyContent: 'center' }),
            }}
          >
            {found.length ? (
              found.map((lib) => <FoundCard key={lib.path} lib={lib} selected={chosen === lib.path} onSelect={() => setChosen(lib.path)} />)
            ) : result.isFetching ? (
              <CircularProgress size={24} />
            ) : (
              <ButtonBase onClick={() => void choose()} sx={{ flexDirection: 'column', gap: 1, p: 2, borderRadius: `${SHAPE.md}px`, color: md('onSurfaceVariant') }}>
                <SearchRounded />
                <Typography variant="bodySmall">{picked ? 'Nothing found' : 'Found libraries show up here'}</Typography>
              </ButtonBase>
            )}
          </div>
        </div>
        <StatusSlot message={message} />
      </div>
    </SetupFrame>
  );
}

/** Create or open a library: one dialog of fixed size with the folder, the name and anything worth knowing. */
export function LibraryDialog() {
  const { mode, start, show, hide } = useLibraryDialog();
  // Keep the last mode while the dialog animates out.
  const [shown, setShown] = useState<Mode>('create');
  useEffect(() => {
    if (mode) setShown(mode);
  }, [mode]);
  const current = mode ?? shown;
  return (
    <Dialog
      open={!!mode}
      onClose={hide}
      maxWidth={false}
      slotProps={{ paper: { sx: { width: DIALOG_WIDTH, height: DIALOG_HEIGHT, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 48px)', borderRadius: `${SHAPE.xl}px`, overflow: 'hidden', backgroundImage: 'none', p: 0 } } }}
    >
      {current === 'create' ? (
        <CreatePane key={`c${start}`} start={start} onClose={hide} onOpenInstead={(p) => show('open', p)} />
      ) : (
        <OpenPane key={`o${start}`} start={start} onClose={hide} onCreateHere={(p) => show('create', p)} />
      )}
    </Dialog>
  );
}
