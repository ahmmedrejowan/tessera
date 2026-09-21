import CreateNewFolderOutlined from '@mui/icons-material/CreateNewFolderOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type ComponentType } from 'react';
import type { LibraryState } from '@shared/types';
import { call, platform } from '../api';
import { Logo } from '../components/Logo';
import { useSettings } from '../state/queries';
import { md, SHAPE, STATE } from '../theme';

const SEP = platform === 'win32' ? '\\' : '/';
const join = (dir: string, name: string) => (dir.endsWith(SEP) ? dir + name : dir + SEP + name);
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p;
const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))) || p;

function OptionCard({ icon: Icon, title, body, onClick }: { icon: ComponentType; title: string; body: string; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        flex: 1,
        minWidth: 240,
        p: 3,
        gap: 1.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        textAlign: 'left',
        borderRadius: `${SHAPE.md}px`,
        border: `1px solid ${md('outlineVariant')}`,
        backgroundColor: md('surfaceContainerLow'),
        position: 'relative',
        overflow: 'hidden',
        '&::after': { content: '""', position: 'absolute', inset: 0, backgroundColor: md('onSurface'), opacity: 0, transition: 'opacity 150ms' },
        '&:hover::after': { opacity: STATE.hover },
        '&.Mui-focusVisible': { outline: `2px solid ${md('primary')}`, outlineOffset: 2 },
      }}
    >
      <span style={{ width: 48, height: 48, borderRadius: SHAPE.md, display: 'grid', placeItems: 'center', background: md('primaryContainer'), color: md('onPrimaryContainer') }}>
        <Icon />
      </span>
      <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
        {title}
      </Typography>
      <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
        {body}
      </Typography>
    </ButtonBase>
  );
}

interface CreatePlan {
  parent: string;
  name: string;
  /** The picked folder has other files, so the library goes in a new folder inside it. */
  inside: boolean;
}

/** Shown when no library is open: create one, open one, or pick a recent one. */
export function Welcome({ state }: { state: LibraryState }) {
  const recent = useSettings().data?.recentLibraries ?? [];
  const [plan, setPlan] = useState<CreatePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        setError(`${folder} isn't a Tessera library. To start one there, choose "Create a library".`);
        return;
      }
      await open(folder);
    });

  return (
    <div style={{ height: '100%', overflow: 'auto', display: 'grid', placeItems: 'center', padding: 32 }}>
      <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', marginBottom: 8 }}>
          <Logo size={56} />
          <Typography variant="displaySmall" sx={{ color: md('onSurface') }}>
            Welcome to Tessera
          </Typography>
          <Typography variant="bodyLarge" sx={{ color: md('onSurfaceVariant'), maxWidth: 520 }}>
            One place for every asset pack you collect, with its licence and source on record, so you can find the piece you need and ship it with confidence.
          </Typography>
        </div>

        {state.status === 'error' && (
          <Alert severity="error" icon={<ErrorOutlineOutlined />} action={<Button color="inherit" onClick={() => void open(state.path)}>Try again</Button>}>
            Couldn't open the library at {state.path}. {state.message}
          </Alert>
        )}
        {error && (
          <Alert severity="warning" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <OptionCard
            icon={CreateNewFolderOutlined}
            title="Create a library"
            body="Choose a folder for it. Packs are kept there exactly as you downloaded them; Tessera never changes the originals."
            onClick={() => void startCreate()}
          />
          <OptionCard icon={FolderOpenOutlined} title="Open a library" body="Pick a folder that already holds a Tessera library, like one synced from another computer." onClick={() => void chooseExisting()} />
        </div>

        {recent.length > 0 && (
          <div>
            <Typography variant="titleSmall" sx={{ color: md('onSurfaceVariant'), mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <HistoryOutlined fontSize="small" /> Recent
            </Typography>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recent.map((p) => (
                <ButtonBase
                  key={p}
                  disabled={busy}
                  onClick={() => void open(p)}
                  sx={{ justifyContent: 'flex-start', gap: 2, px: 2, py: 1.25, borderRadius: `${SHAPE.sm}px`, '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
                >
                  <Typography variant="labelLarge" sx={{ color: md('onSurface') }}>
                    {baseName(p)}
                  </Typography>
                  <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant'), minWidth: 0 }}>
                    {p}
                  </Typography>
                </ButtonBase>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!plan} onClose={() => setPlan(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Name your library</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {plan?.inside && (
            <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
              That folder already has other files in it, so the library will get a folder of its own inside it.
            </Typography>
          )}
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
            {plan && join(plan.parent, plan.name.trim() || '…')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlan(null)}>Cancel</Button>
          <Button variant="contained" disabled={busy || !plan?.name.trim()} onClick={() => void create()}>
            Create library
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
