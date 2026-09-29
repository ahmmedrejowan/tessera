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
import type { BackupStatus } from '@shared/types';
import { md } from '../../theme';
import { Row } from './parts';
import { ToolSetup } from '../setup/ToolSetup';
import { useBrowse } from '../../state/browse';
import { useNav } from '../../state/nav';
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

/**
 * Ask, do it, then say what happened, without the box closing in between.
 *
 * These two answers are the ones people hesitate over: one is reversible and sounds worse than it
 * is, the other lets go of the only way back into a set of backups. Saying exactly what each does
 * before it happens, and exactly what it did afterwards, is the difference between a button and a
 * decision.
 */
function Confirm({ open, onClose, title, body, confirm, done, run, danger }: { open: boolean; onClose: () => void; title: string; body: string; confirm: string; done: string; run: () => Promise<unknown>; danger?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => {
    if (open) setResult(null);
  }, [open]);
  const go = async () => {
    setBusy(true);
    try {
      await run();
      setResult(done);
    } catch (e) {
      failed(e);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{result ? 'Done' : title}</DialogTitle>
      <DialogContent>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          {result ?? body}
        </Typography>
      </DialogContent>
      <DialogActions>
        {result ? (
          <Button variant="contained" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="contained" color={danger ? 'error' : 'primary'} disabled={busy} onClick={() => void go()}>
              {busy ? 'Working…' : confirm}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

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

/** Back up this library to where another library's backups go, with the same password. */
function JoinRow({ other }: { other: BackupStatus['others'][number] }) {
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    try {
      await call('backup:join', other.libraryId);
      notify.success('Backups are on.', { body: `To ${other.repo}, with the same password as “${other.libraryName}”.` });
    } catch (e) {
      failed(e, 'Couldn’t turn on backups');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Row title={`Same place as “${other.libraryName}”`} body={`${other.repo} · same password, nothing to sign in to`}>
      <Button variant="contained" disabled={busy} onClick={() => void join()}>
        {busy ? 'Turning on…' : 'Use it'}
      </Button>
    </Row>
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
  // Read again whenever Settings opens: the library may have changed since.
  const status = useQuery({ queryKey: ['backup'], queryFn: () => call('backup:status'), refetchInterval: 60_000, staleTime: 0 }).data;
  const [restoring, setRestoring] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
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
        <KeptWarning />
        <Row title="Backups are off for this library" body={`Kopia ${status.version ?? ''} is ready. Encrypted backups to a drive, a cloud drive, cloud storage or a server.`}>
          <Button variant={status.others.length ? 'outlined' : 'contained'} onClick={onSetup}>
            Set up
          </Button>
        </Row>
        {status.others.map((o) => (
          <JoinRow key={o.libraryId} other={o} />
        ))}
      </>
    );
  }
  return (
    <>
      <KeptWarning />
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
        <Select size="small" value={status.intervalHours} onChange={(e) => void call('backup:setInterval', Number(e.target.value)).catch((err: unknown) => failed(err))}>
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
      <Row
        title={status.paused ? 'Backups are paused' : 'Pause backups'}
        body={
          status.paused
            ? 'Nothing is backed up on its own. Where they go, the password and how often are all still set.'
            : 'Stop backing up on its own for a while. Nothing is disconnected and nothing is forgotten.'
        }
      >
        <Button onClick={() => setPausing(true)}>{status.paused ? 'Resume' : 'Pause…'}</Button>
      </Row>
      <Row title="Disconnect" body="Let go of the place these backups go. The backups already made stay where they are.">
        <Button color="error" onClick={() => setDisconnecting(true)}>
          Disconnect…
        </Button>
      </Row>
      <RestoreCopy open={restoring} onClose={() => setRestoring(false)} />
      <Confirm
        open={pausing}
        onClose={() => setPausing(false)}
        title={status.paused ? 'Start backing up again?' : 'Pause backups?'}
        body={
          status.paused
            ? 'Tessera will back this library up on its own again, starting from where it left off. Nothing has to be set up again.'
            : 'Nothing is backed up on its own until you start it again. Where the backups go, the password and how often are all kept, and you can still back up now yourself whenever you want to.'
        }
        confirm={status.paused ? 'Start again' : 'Pause'}
        done={
          status.paused
            ? 'Backups are on again. The next one happens on its usual schedule.'
            : 'Backups are paused. Nothing goes up on its own until you start them again; “Back up now” still works.'
        }
        run={() => call('backup:pause', !status.paused)}
      />
      <Confirm
        open={disconnecting}
        onClose={() => setDisconnecting(false)}
        danger
        title="Disconnect these backups?"
        body={`Tessera lets go of ${status.repoPath ?? 'the place the backups go'} and forgets the password for it. The backups already made are not deleted: they stay exactly where they are, and you can restore from them later with “From a backup”, as long as you still have the password. Setting backups up again, here or somewhere else, starts a new set from nothing.`}
        confirm="Disconnect"
        done="Disconnected. The backups already made are still where they were, and Tessera no longer has the password for them: keep your recovery kit."
        run={() => call('backup:turnOff')}
      />
    </>
  );
}

/**
 * Packs whose files are not in the library are not in its backups either.
 *
 * Shown here, on the page about keeping things safe, because that is where somebody forms the
 * belief this warning has to correct. The way out is offered with it, rather than left to be
 * found on each pack in turn.
 */
function KeptWarning() {
  const stats = useQuery({ queryKey: ['library-stats-kept'], queryFn: () => call('library:stats'), staleTime: 0 }).data;
  const go = useNav((s) => s.go);
  if (!stats?.kept) return null;
  return (
    <Row
      title={`${stats.kept} pack${stats.kept === 1 ? ' is' : 's are'} indexed where they lie`}
      body={`Their records, licenses and tags are backed up with everything else. Their files are not, because they were never brought into the library. Take one into the library from its own page to have it backed up too.`}
    >
      <Button onClick={() => (useBrowse.getState().setMode('packs'), useBrowse.getState().setKept(true), go({ to: 'browse' }))}>Show them</Button>
    </Row>
  );
}
