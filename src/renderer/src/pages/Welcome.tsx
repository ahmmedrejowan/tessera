import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { LibraryState } from '@shared/types';
import { call, platform } from '../api';
import { Logo } from '../components/Logo';
import { MosaicHero } from '../components/MosaicHero';
import { useSettings, useUpdateSettings } from '../state/queries';
import { md, mdAlpha, SHAPE, STATE } from '../theme';
import { ReceiveDialog } from './ReceiveDialog';

const SEP = platform === 'win32' ? '\\' : '/';
const join = (dir: string, name: string) => (dir.endsWith(SEP) ? dir + name : dir + SEP + name);
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p;
const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))) || p;
/** "/Users/sam/Documents/Game Assets" → "~/Documents/Game Assets" where the home folder is recognisable. */
const tidyPath = (p: string) => p.replace(/^\/(Users|home)\/[^/]+/, '~').replace(/^[A-Z]:\\Users\\[^\\]+/i, '~');

interface CreatePlan {
  parent: string;
  name: string;
  /** The picked folder has other files, so the library goes in a new folder inside it. */
  inside: boolean;
}

/** A library opened before: click to open it; one that can't be found says so. */
function RecentCard({ path, missing, onOpen, onForget }: { path: string; missing: boolean; onOpen: () => void; onForget: () => void }) {
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
            {baseName(path)}
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

/** A short, friendly message above the actions, with its own way out. */
function Notice({ tone, title, body, action, onClose }: { tone: 'error' | 'info'; title: string; body?: string; action?: { label: string; run: () => void }; onClose?: () => void }) {
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 14px 20px', borderRadius: SHAPE.lg, background: tone === 'error' ? md('errorContainer') : md('tertiaryContainer'), color: tone === 'error' ? md('onErrorContainer') : md('onTertiaryContainer') }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleSmall" component="div">
          {title}
        </Typography>
        {body && (
          <Typography variant="bodySmall" component="div" sx={{ opacity: 0.9 }}>
            {body}
          </Typography>
        )}
      </div>
      {action && (
        <Button size="small" color="inherit" onClick={action.run} sx={{ fontWeight: 600 }}>
          {action.label}
        </Button>
      )}
      {onClose && (
        <IconButton size="small" color="inherit" onClick={onClose} aria-label="Dismiss">
          <CloseRounded fontSize="small" />
        </IconButton>
      )}
    </div>
  );
}

/** Shown when no library is open: create one, open one, receive one, or pick up a recent one. */
export function Welcome({ state }: { state: LibraryState }) {
  const recent = useSettings().data?.recentLibraries ?? [];
  const update = useUpdateSettings();
  const [plan, setPlan] = useState<CreatePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const missing = useQuery({
    queryKey: ['recent-missing', recent],
    queryFn: async () => new Set((await Promise.all(recent.map(async (p) => ((await call('library:inspect', p)) === 'library' ? null : p)))).filter(Boolean)),
  }).data;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const open = (path: string) =>
    act(async () => {
      const s = await call('library:open', path);
      if (s.status === 'error') setError(s.message);
    });

  const startCreate = () =>
    act(async () => {
      const folder = await call('dialog:folder', 'Choose where to keep your library');
      if (!folder) return;
      const kind = await call('library:inspect', folder);
      if (kind === 'library') {
        await open(folder);
        return;
      }
      if (kind === 'other') setPlan({ parent: folder, name: 'Tessera Library', inside: true });
      else setPlan({ parent: parentOf(folder), name: baseName(folder), inside: false });
    });

  const create = () =>
    plan &&
    act(async () => {
      const path = join(plan.parent, plan.name.trim());
      const s = await call('library:create', path, plan.name.trim());
      if (s.status === 'error') setError(s.message);
      else setPlan(null);
    });

  const chooseExisting = () =>
    act(async () => {
      const folder = await call('dialog:folder', 'Open a Tessera library');
      if (!folder) return;
      const kind = await call('library:inspect', folder);
      if (kind !== 'library') {
        setError(`“${baseName(folder)}” isn’t a Tessera library. To start one there, choose Create a library.`);
        return;
      }
      await open(folder);
    });

  const forget = (path: string) => update.mutate({ recentLibraries: recent.filter((p) => p !== path) });
  const failed = state.status === 'error' && !dismissed ? state : null;

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

          {failed && (
            <Notice
              tone="error"
              title={failed.code === 'library-missing' ? `Can’t find “${baseName(failed.path)}”` : `Couldn’t open “${baseName(failed.path)}”`}
              body={failed.message}
              action={failed.code === 'library-missing' ? { label: 'Locate…', run: () => void chooseExisting() } : { label: 'Try again', run: () => void open(failed.path) }}
              onClose={() => setDismissed(true)}
            />
          )}
          {error && <Notice tone="info" title={error} onClose={() => setError(null)} />}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              disabled={busy}
              onClick={() => void startCreate()}
              sx={{ height: 60, fontSize: 17, fontWeight: 500, borderRadius: `${SHAPE.full}px`, boxShadow: `0 6px 20px ${mdAlpha('primary', 0.28)}`, '&:hover': { boxShadow: `0 8px 26px ${mdAlpha('primary', 0.34)}` } }}
            >
              Create a library
            </Button>
            <Button
              startIcon={<FolderOpenRounded />}
              disabled={busy}
              onClick={() => void chooseExisting()}
              sx={{ height: 56, fontSize: 16, borderRadius: `${SHAPE.full}px`, backgroundColor: md('secondaryContainer'), color: md('onSecondaryContainer'), '&:hover': { backgroundColor: mdAlpha('secondaryContainer', 1 - STATE.hover) } }}
            >
              Open a library
            </Button>
            <Button startIcon={<DevicesRounded />} onClick={() => setReceiving(true)} sx={{ alignSelf: 'center', mt: 0.5, color: md('onSurfaceVariant') }}>
              Get one from another computer
            </Button>
          </div>

          {recent.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Typography variant="labelLarge" sx={{ color: md('onSurfaceVariant'), px: 0.5 }}>
                Recent
              </Typography>
              {recent.slice(0, 3).map((p) => (
                <RecentCard key={p} path={p} missing={!!missing?.has(p)} onOpen={() => void open(p)} onForget={() => forget(p)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <ReceiveDialog open={receiving} onClose={() => setReceiving(false)} />
      <Dialog open={!!plan} onClose={() => setPlan(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Name your library</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            autoFocus
            label="Name"
            value={plan?.name ?? ''}
            onChange={(e) => plan && setPlan({ ...plan, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && plan?.name.trim() && void create()}
            fullWidth
            sx={{ mt: 1 }}
          />
          <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), wordBreak: 'break-all' }}>
            {plan && tidyPath(join(plan.parent, plan.name.trim() || '…'))}
            {plan?.inside && ' · in a folder of its own, as the one you picked has other files'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlan(null)}>Cancel</Button>
          <Button variant="contained" disabled={busy || !plan?.name.trim()} onClick={() => void create()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
