import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { call, on } from '../../api';
import { formatBytes } from '../../components/labels';
import { SegmentedButton } from '../../components/SegmentedButton';
import { failed, notify } from '../../notices/store';
import { useUpdateSettings } from '../../state/queries';
import { md } from '../../theme';
import { Row } from './parts';

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
};

function SetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [folder, setFolder] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setFolder(null);
      setPassword('');
      setAgain('');
      setError(null);
    }
  }, [open]);
  const ok = !!folder && password.length >= 8 && (mode === 'existing' || password === again);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await call('backup:setup', folder!, password, mode === 'new');
      notify.success('Backups are on. The first one is running now.');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Set up backups</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          Backups are encrypted and only store what changed since last time. Keep them on another drive — an external disk or a network folder — so one failure can’t take both.
        </Typography>
        <SegmentedButton
          label="Backup store"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'new', label: 'Start new backups' },
            { value: 'existing', label: 'Use existing backups' },
          ]}
        />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button variant="outlined" onClick={async () => setFolder((await call('backup:chooseFolder')) ?? folder)}>
            Choose folder…
          </Button>
          <Typography variant="bodySmall" noWrap sx={{ color: folder ? md('onSurface') : md('onSurfaceVariant') }} title={folder ?? ''}>
            {folder ?? 'No folder chosen'}
          </Typography>
        </div>
        <TextField type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} helperText="At least 8 characters. Without it the backups can’t be read — not even by you — so keep it somewhere safe." />
        {mode === 'new' && <TextField type="password" label="Password again" value={again} onChange={(e) => setAgain(e.target.value)} error={!!again && again !== password} helperText={again && again !== password ? 'The two don’t match.' : ' '} />}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!ok || busy} onClick={() => void submit()}>
          {busy ? 'Setting up…' : 'Turn on backups'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RestoreDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const snapshots = useQuery({ queryKey: ['snapshots'], queryFn: () => call('backup:snapshots'), enabled: open });
  const restore = async (id: string) => {
    try {
      const target = await call('backup:restore', id);
      if (target) notify.success(`Restored into ${target}.`);
      onClose();
    } catch (e) {
      failed(e);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Restore a backup</DialogTitle>
      <DialogContent>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), mb: 2 }}>
          The files are restored into a folder you choose; your library isn’t touched. To use the restored copy, open it as a library.
        </Typography>
        {snapshots.isLoading && <Typography variant="bodyMedium">Reading backups…</Typography>}
        {snapshots.error && <Alert severity="error">{String((snapshots.error as Error).message)}</Alert>}
        {snapshots.data?.map((s) => (
          <div key={s.id} className="tile" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8 }}>
            <div style={{ flex: 1 }}>
              <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
                {new Date(s.startTime).toLocaleString()}
              </Typography>
              <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                {s.files.toLocaleString()} files · {formatBytes(s.size)}
              </Typography>
            </div>
            <Button onClick={() => void restore(s.id)}>Restore…</Button>
          </div>
        ))}
        {snapshots.data?.length === 0 && <Typography variant="bodyMedium">No backups yet.</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/** The Backups section of Settings. */
export function BackupSettings() {
  const client = useQueryClient();
  useEffect(() => on('backup:changed', () => void client.invalidateQueries({ queryKey: ['backup'] })), [client]);
  const status = useQuery({ queryKey: ['backup'], queryFn: () => call('backup:status'), refetchInterval: 60_000 }).data;
  const update = useUpdateSettings();
  const [setup, setSetup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  if (!status) return null;

  if (!status.available) {
    return (
      <Row
        title="Backups are off"
        body={
          <>
            Tessera backs up with Kopia, a free, open-source backup tool. Install it from{' '}
            <a href="https://kopia.io/docs/installation/" target="_blank" rel="noreferrer" style={{ color: md('primary') }}>
              kopia.io
            </a>
            , then come back here.
          </>
        }
      />
    );
  }
  if (!status.repoPath) {
    return (
      <>
        <Row title="Backups are off" body={`Kopia ${status.version ?? ''} is installed. Back up the library to another drive, encrypted, keeping only what changed each time.`}>
          <Button variant="contained" onClick={() => setSetup(true)}>
            Set up
          </Button>
        </Row>
        <SetupDialog open={setup} onClose={() => setSetup(false)} />
      </>
    );
  }
  return (
    <>
      <Row
        title={status.running ? 'Backing up…' : status.lastBackupAt ? `Last backup ${ago(status.lastBackupAt)}` : 'No backup yet'}
        body={
          <>
            To {status.repoPath}
            {status.lastError && <span style={{ color: md('error'), display: 'block' }}>Last attempt failed: {status.lastError}</span>}
          </>
        }
      >
        <Button variant="contained" disabled={status.running} onClick={() => void call('backup:now').catch((e: unknown) => failed(e))}>
          Back up now
        </Button>
      </Row>
      <Row title="Automatically" body="While Tessera is open.">
        <Select size="small" value={status.intervalHours} onChange={(e) => update.mutate({ backupIntervalHours: Number(e.target.value) })}>
          <MenuItem value={0}>Only when I ask</MenuItem>
          <MenuItem value={6}>Every 6 hours</MenuItem>
          <MenuItem value={24}>Every day</MenuItem>
          <MenuItem value={168}>Every week</MenuItem>
        </Select>
      </Row>
      <Row title="Restore" body="Bring back the library as it was at an earlier backup.">
        <Button onClick={() => setRestoring(true)}>Restore…</Button>
      </Row>
      <Row title="Turn off backups" body="Tessera stops backing up. The backups already made stay in their folder.">
        <Button color="error" onClick={() => void call('backup:turnOff')}>
          Turn off
        </Button>
      </Row>
      <RestoreDialog open={restoring} onClose={() => setRestoring(false)} />
    </>
  );
}
