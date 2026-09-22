import Alert from '@mui/material/Alert';
import { StatusSlot } from '../../components/StatusSlot';
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
import { failed, notify } from '../../notices/store';
import { useUpdateSettings } from '../../state/queries';
import { md } from '../../theme';
import { Row } from './parts';
import { ToolSetup } from '../setup/ToolSetup';
import { BackupGuide } from '../setup/BackupGuide';

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
};

const STORE_NAME: Record<string, string> = { darwin: 'Keychain Access', win32: 'Credential Manager', linux: 'your keyring' };

/** The backup password: see it, change it, and keep copies where they'll be found. */
function PasswordRow() {
  const [shown, setShown] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) notify.success(done);
    } catch (e) {
      failed(e);
    }
  };
  return (
    <>
      <Row
        title="Password"
        body={
          shown ? (
            <span style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', userSelect: 'text', color: md('onSurface') }}>{shown}</span>
          ) : (
            'Needed to restore on another computer. Keep a copy away from this one.'
          )
        }
      >
        <Button onClick={() => (shown ? setShown(null) : void act(async () => setShown(await call('backup:revealPassword'))))}>{shown ? 'Hide' : 'Show'}</Button>
        <Button onClick={() => void act(async () => {
          const path = await call('backup:saveKit', { includeKeys: false });
          if (path) notify.success('Recovery kit saved.', { body: path });
        })}>
          Recovery kit…
        </Button>
        <Button onClick={() => void act(() => call('backup:saveToKeychain'), `Saved in ${STORE_NAME[window.tessera.platform]}.`)}>Save in {STORE_NAME[window.tessera.platform]}</Button>
        <Button onClick={() => setChanging(true)}>Change…</Button>
      </Row>
      <ChangePassword open={changing} onClose={() => setChanging(false)} />
    </>
  );
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setNext('');
      setAgain('');
      setError(null);
    }
  }, [open]);
  const ok = next.length >= 8 && next === again;
  const change = async () => {
    setBusy(true);
    setError(null);
    try {
      await call('backup:changePassword', next);
      notify.success('Password changed.', { body: 'Save a new recovery kit: the old one no longer opens the backups.' });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Change the backup password</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          All backups, old and new, open with the new password afterwards.
        </Typography>
        <TextField type="password" label="New password" value={next} onChange={(e) => setNext(e.target.value)} helperText="At least 8 characters." autoComplete="new-password" />
        <TextField type="password" label="New password again" value={again} onChange={(e) => setAgain(e.target.value)} error={!!again && again !== next} helperText={again && again !== next ? 'The two don’t match.' : ' '} autoComplete="new-password" />
        <StatusSlot message={error ? { tone: 'error', text: error } : null} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!ok || busy} onClick={() => void change()}>
          {busy ? 'Changing…' : 'Change'}
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
  const [setup, setSetup] = useState(false);
  // The guide sits outside the rows, so it stays put (and finishes on its "Backups are on" page)
  // when the rows change from "Backups are off" to the backups that are on.
  return (
    <>
      <BackupRows onSetup={() => setSetup(true)} />
      <BackupGuide open={setup} onClose={() => setSetup(false)} />
    </>
  );
}

function BackupRows({ onSetup }: { onSetup: () => void }) {
  const client = useQueryClient();
  useEffect(() => on('backup:changed', () => void client.invalidateQueries({ queryKey: ['backup'] })), [client]);
  const status = useQuery({ queryKey: ['backup'], queryFn: () => call('backup:status'), refetchInterval: 60_000 }).data;
  const update = useUpdateSettings();
  const [restoring, setRestoring] = useState(false);
  if (!status) return null;

  if (!status.available) {
    return (
      <div style={{ padding: '16px 0' }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurface'), mb: 2 }}>
          Encrypted backups of the library to another drive or a cloud folder.
        </Typography>
        <ToolSetup tool="kopia" available={false} bundled={false} compact />
      </div>
    );
  }
  if (!status.repoPath) {
    return (
      <>
        <Row title="Backups are off" body={`Kopia ${status.version ?? ''} is ready. Encrypted backups to a drive, a cloud drive, cloud storage or a server.`}>
          <Button variant="contained" onClick={onSetup}>
            Set up
          </Button>
        </Row>
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
      <PasswordRow />
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
