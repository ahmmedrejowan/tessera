import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import type { SyncMode } from '@shared/types';
import { call } from '../api';
import { SegmentedButton } from '../components/SegmentedButton';
import { md } from '../theme';
import { DeviceId, MODES, useSyncStatus } from './settings/SyncSettings';

/**
 * Get a library from another computer: show this computer's ID for pairing, accept the other
 * computer and the library it offers, then open it once its first files have arrived.
 */
export function ReceiveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useSyncStatus(2000).data;
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SyncMode>('pull');
  const [arriving, setArriving] = useState<string | null>(null);

  useEffect(() => {
    if (open && status?.available && !status.running) void call('sync:receive').catch((e: Error) => setError(e.message));
  }, [open, status?.available, status?.running]);

  // Once the library's marker file has synced, open it.
  useEffect(() => {
    if (!arriving) return;
    const t = setInterval(async () => {
      if ((await call('library:inspect', arriving)) === 'library') {
        clearInterval(t);
        await call('sync:enable', mode).catch(() => undefined);
        await call('library:open', arriving);
        onClose();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [arriving, mode, onClose]);

  const accept = async (f: { id: string; label: string; offeredBy: string }) => {
    try {
      const path = await call('sync:acceptFolder', f.id, f.offeredBy, f.label, mode);
      if (path) setArriving(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Receive a library from another computer</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {status && !status.available ? (
          <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
            Libraries travel between computers with Syncthing, directly and privately. Install it from{' '}
            <a href="https://syncthing.net/downloads/" target="_blank" rel="noreferrer" style={{ color: md('primary') }}>
              syncthing.net
            </a>{' '}
            on both computers, then try again.
          </Typography>
        ) : arriving ? (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <CircularProgress size={28} />
            <Typography variant="bodyMedium">The library is arriving in {arriving}. It opens as soon as its first files are here; the rest keep coming in the background.</Typography>
          </div>
        ) : (
          <>
            <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
              1. On the computer that has the library, open Tessera’s Settings › Sync, choose “Add a computer” and paste this computer’s ID:
            </Typography>
            {status?.myId ? <DeviceId id={status.myId} /> : <CircularProgress size={24} />}
            {status?.pendingDevices.map((d) => (
              <Alert key={d.id} severity="info" action={<Button color="inherit" onClick={() => void call('sync:addDevice', d.id, d.name)}>Accept</Button>}>
                {d.name || 'A computer'} wants to connect.
              </Alert>
            ))}
            <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
              2. Its library shows up here. Choose how this computer should sync, then accept it:
            </Typography>
            <SegmentedButton label="Sync direction" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m.value, label: m.label }))} />
            <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
              {MODES.find((m) => m.value === mode)!.help}
            </Typography>
            {status?.pendingFolders.length ? (
              status.pendingFolders.map((f) => (
                <Alert key={f.id + f.offeredBy} severity="success" action={<Button color="inherit" onClick={() => void accept(f)}>Accept…</Button>}>
                  “{f.label}” is offered.
                </Alert>
              ))
            ) : (
              <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                Waiting for the other computer…
              </Typography>
            )}
          </>
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
