import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import RestoreRounded from '@mui/icons-material/RestoreRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import type { LibraryState } from '@shared/types';
import { call } from '../api';
import { Logo } from '../components/Logo';
import { MosaicHero } from '../components/MosaicHero';
import { ask } from '../notices/dialogs';
import { useLibraryDialog } from './library/LibraryDialog';
import { tidyPath } from './library/Location';
import { baseName } from '@shared/folders';
import { failed } from '../notices/store';
import { useLibraries } from '../state/library';
import { md, mdAlpha, SHAPE, STATE } from '../theme';
import { useGuides } from './library/guides';

const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))) || p;

/** A library opened before: click to open it; one that can't be found says so. */
function RecentCard({ name, path, missing, onOpen, onForget }: { name: string; path: string; missing: boolean; onOpen: () => void; onForget: () => void }) {
  return (
    <div style={{ position: 'relative' }} className="recent">
      <ButtonBase
        onClick={onOpen}
        sx={{
          width: '100%',
          justifyContent: 'flex-start',
          gap: 2,
          p: 1.5,
          pr: 6,
          borderRadius: `${SHAPE.lg}px`,
          backgroundColor: md('surfaceContainerLow'),
          textAlign: 'left',
          transition: 'background-color 150ms',
          '&:hover': { backgroundColor: md('surfaceContainerHigh') },
        }}
      >
        <span style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: 'grid', placeItems: 'center', background: missing ? md('surfaceContainerHighest') : md('secondaryContainer'), color: missing ? md('onSurfaceVariant') : md('onSecondaryContainer') }}>
          {missing ? <LinkOffRounded /> : <FolderRounded />}
        </span>
        <span style={{ minWidth: 0 }}>
          <Typography variant="titleSmall" component="div" noWrap sx={{ color: md('onSurface') }}>
            {name}
          </Typography>
          <Typography variant="bodySmall" component="div" noWrap sx={{ color: md('onSurfaceVariant') }}>
            {missing ? 'Not found — moved, or on a drive that isn’t connected' : tidyPath(path)}
          </Typography>
        </span>
      </ButtonBase>
      <Tooltip title="Remove from recent">
        <IconButton size="small" onClick={onForget} aria-label="Remove from recent" sx={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.6, '&:hover': { opacity: 1 } }}>
          <CloseRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    </div>
  );
}

/** Shown when no library is open: create one, open one, receive one, or pick up a recent one. */
export function Welcome({ state }: { state: LibraryState }) {
  const recent = useLibraries().data ?? [];
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  const open = (path: string) =>
    act(async () => {
      // A library that fails to open comes back as the error state, which asks what to do.
      await call('library:open', path);
    });

  const forget = (path: string) => {
    const known = recent.find((l) => l.path === path);
    if (known) void call('libraries:forget', known.id).catch((e: unknown) => failed(e));
  };

  // A library that couldn't be opened is serious enough to ask about, once per failure.
  const asked = useRef<LibraryState | null>(null);
  useEffect(() => {
    if (state.status !== 'error' || asked.current === state) return;
    asked.current = state;
    const name = baseName(state.path);
    if (state.code === 'library-missing') {
      void ask({
        tone: 'warning',
        icon: LinkOffRounded,
        title: `Can’t find “${name}”`,
        body: state.message,
        actions: [
          { label: 'Remove from recent', value: 'forget' as const },
          { label: 'Locate…', value: 'locate' as const, kind: 'primary' },
        ],
      }).then((choice) => {
        if (choice === 'forget') forget(state.path);
        if (choice === 'locate') useLibraryDialog.getState().show('open', parentOf(state.path));
      });
    } else {
      void ask({
        tone: 'error',
        title: `Couldn’t open “${name}”`,
        body: state.message,
        actions: [
          { label: 'Close', value: false },
          { label: 'Try again', value: true, kind: 'primary' },
        ],
      }).then((again) => again && void open(state.path));
    }
    // Only a new failure should ask again.
  }, [state]);

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(420px, 1fr)', gap: 12, padding: 12 }}>
      <MosaicHero />

      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ margin: 'auto', width: '100%', maxWidth: 460, padding: '40px 40px', display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Logo size={30} />
            <Typography variant="titleLarge" sx={{ color: md('onSurface'), fontWeight: 500 }}>
              Tessera
            </Typography>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Typography component="h1" sx={{ color: md('onSurface'), fontSize: 52, lineHeight: '58px', fontWeight: 450, letterSpacing: '-1px' }}>
              Every asset.
              <br />
              <span style={{ color: md('primary') }}>One library.</span>
            </Typography>
            <Typography variant="bodyLarge" sx={{ color: md('onSurfaceVariant'), fontSize: 18, lineHeight: '28px' }}>
              Your packs, their licences and your game’s credits, kept together.
            </Typography>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              disabled={busy}
              onClick={() => useLibraryDialog.getState().show('create')}
              sx={{ height: 60, fontSize: 17, fontWeight: 500, borderRadius: `${SHAPE.full}px`, boxShadow: `0 6px 20px ${mdAlpha('primary', 0.28)}`, '&:hover': { boxShadow: `0 8px 26px ${mdAlpha('primary', 0.34)}` } }}
            >
              Create a library
            </Button>
            <Button
              startIcon={<FolderOpenRounded />}
              disabled={busy}
              onClick={() => useLibraryDialog.getState().show('open')}
              sx={{ height: 56, fontSize: 16, borderRadius: `${SHAPE.full}px`, backgroundColor: md('secondaryContainer'), color: md('onSecondaryContainer'), '&:hover': { backgroundColor: mdAlpha('secondaryContainer', 1 - STATE.hover) } }}
            >
              Open a library
            </Button>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 4 }}>
              <Button startIcon={<DevicesRounded />} onClick={() => useGuides.getState().show('receive')} sx={{ color: md('onSurfaceVariant'), whiteSpace: 'nowrap', flexShrink: 0 }}>
                From another computer
              </Button>
              <Button startIcon={<RestoreRounded />} onClick={() => useGuides.getState().show('restore')} sx={{ color: md('onSurfaceVariant'), whiteSpace: 'nowrap', flexShrink: 0 }}>
                From a backup
              </Button>
            </div>
          </div>

          {recent.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Typography variant="labelLarge" sx={{ color: md('onSurfaceVariant'), px: 0.5 }}>
                Recent
              </Typography>
              {recent.slice(0, 3).map((l) => (
                <RecentCard key={l.id} name={l.name} path={l.path} missing={!l.found} onOpen={() => void open(l.path)} onForget={() => forget(l.path)} />
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
