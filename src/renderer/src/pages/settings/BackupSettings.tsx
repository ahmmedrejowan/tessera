import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import KeyRounded from '@mui/icons-material/KeyRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import Tooltip from '@mui/material/Tooltip';
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
import { failed, notify } from '../../notices/store';
import { useUpdateSettings } from '../../state/queries';
import { md } from '../../theme';
import { Row } from './parts';
import { ToolSetup } from '../setup/ToolSetup';
import { BackupGuide } from '../setup/BackupGuide';
import { RestoreCopy } from '../setup/RestoreCopy';

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
};

const STORE_NAME: Record<string, string> = { darwin: 'Keychain Access', win32: 'Credential Manager', linux: 'your keyring' };

const MONO = 'ui-monospace, Menlo, Consolas, monospace';

/** The backup password: see it, change it, and keep copies where they'll be found. */
function PasswordRow() {
  const [shown, setShown] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setMenu(null);
    try {
      await fn();
      if (done) notify.success(done);
    } catch (e) {
      failed(e);
    }
  };
  const reveal = async () => shown ?? (await call('backup:revealPassword'));
  return (
    <>
      <Row
        title="Password"
        body={
          <>
            <span style={{ display: 'block', height: 22, lineHeight: '22px', fontFamily: MONO, fontSize: 14, letterSpacing: shown ? 0.5 : 2, color: md('onSurface'), userSelect: shown ? 'text' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {shown ?? '•••• •••• •••• ••••'}
            </span>
            Needed to restore on another computer. Keep a copy away from this one.
          </>
        }
      >
        <Tooltip title={shown ? 'Hide' : 'Show'}>
          <IconButton aria-label={shown ? 'Hide the password' : 'Show the password'} onClick={() => (shown ? setShown(null) : void act(async () => setShown(await call('backup:revealPassword'))))}>
            {shown ? <VisibilityOffOutlined /> : <VisibilityOutlined />}
          </IconButton>
        </Tooltip>
        <Button onClick={() => void act(async () => {
          const path = await call('backup:saveKit', { includeKeys: false });
          if (path) notify.success('Recovery kit saved.', { body: path });
        })}>
          Recovery kit…
        </Button>
        <IconButton aria-label="More password actions" onClick={(e) => setMenu(e.currentTarget)}>
          <MoreVertRounded />
        </IconButton>
        <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          <MenuItem onClick={() => void act(async () => navigator.clipboard.writeText(await reveal()), 'Password copied.')}>
            <ListItemIcon><ContentCopyRounded fontSize="small" /></ListItemIcon>
            Copy
          </MenuItem>
          <MenuItem onClick={() => void act(() => call('backup:saveToKeychain'), `Saved in ${STORE_NAME[window.tessera.platform]}.`)}>
            <ListItemIcon><KeyRounded fontSize="small" /></ListItemIcon>
            Save in {STORE_NAME[window.tessera.platform]}
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => { setMenu(null); setChanging(true); }}>
            <ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon>
            Change the password…
          </MenuItem>
        </Menu>
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
      <Row title="Restore" body="Bring back the library as it was at an earlier backup, as a copy beside it.">
        <Button onClick={() => setRestoring(true)}>Restore…</Button>
      </Row>
      <Row title="Turn off backups" body="Tessera stops backing up. The backups already made stay in their folder.">
        <Button color="error" onClick={() => void call('backup:turnOff')}>
          Turn off
        </Button>
      </Row>
      <RestoreCopy open={restoring} onClose={() => setRestoring(false)} />
    </>
  );
}
