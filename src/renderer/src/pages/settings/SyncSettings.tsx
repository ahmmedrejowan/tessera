import ComputerOutlined from '@mui/icons-material/ComputerOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { SyncMode } from '@shared/types';
import { call, on } from '../../api';
import { formatBytes } from '../../components/labels';
import { SegmentedButton } from '../../components/SegmentedButton';
import { failed, notify } from '../../notices/store';
import { md, SHAPE } from '../../theme';
import { Row } from './parts';
import { StatusSlot } from '../../components/StatusSlot';
import { SyncthingSetup } from '../sync/SyncthingSetup';

export const MODES: { value: SyncMode; label: string; help: string }[] = [
  { value: 'push', label: 'Send only', help: 'This computer sends its changes; changes made elsewhere don’t come back. Good for the main computer.' },
  { value: 'pull', label: 'Receive only', help: 'This computer gets changes from the others but never changes them. Good for a laptop you only browse on.' },
  { value: 'full', label: 'Both ways', help: 'Changes go in both directions. Replaced or deleted files are kept for 30 days, in case two computers disagree.' },
];

export function useSyncStatus(poll = 5000) {
  const client = useQueryClient();
  useEffect(() => on('sync:changed', () => void client.invalidateQueries({ queryKey: ['sync'] })), [client]);
  return useQuery({ queryKey: ['sync'], queryFn: () => call('sync:status'), refetchInterval: poll });
}

/** This computer's device ID, to give to another computer. */
export function DeviceId({ id }: { id: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: SHAPE.sm, background: md('surfaceContainerHigh') }}>
      <Typography variant="bodySmall" sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', flex: 1, userSelect: 'text', wordBreak: 'break-all', color: md('onSurface') }}>
        {id}
      </Typography>
      <Tooltip title="Copy">
        <IconButton size="small" onClick={() => void navigator.clipboard.writeText(id).then(() => notify.success('Device ID copied.'))}>
          <ContentCopyOutlined fontSize="small" />
        </IconButton>
      </Tooltip>
    </div>
  );
}

function AddComputer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setId('');
      setName('');
      setError(null);
    }
  }, [open]);
  const add = async () => {
    try {
      await call('sync:addDevice', id, name);
      notify.success(`Paired with ${name || 'the computer'}. It will be asked to accept the library.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add a computer</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          On the other computer, choose “Get one from another computer” and copy its ID.
        </Typography>
        <TextField autoFocus label="Its device ID" value={id} onChange={(e) => setId(e.target.value)} placeholder="XXXXXXX-XXXXXXX-…" sx={{ mt: 1 }} />
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Desktop PC" />
        <StatusSlot message={error ? { tone: 'error', text: error } : null} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!id.trim()} onClick={() => void add()}>
          Pair
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** The Sync section of Settings. */
export function SyncSettings() {
  const status = useSyncStatus().data;
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!status) return null;
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

  if (!status.available) {
    return (
      <div style={{ padding: '16px 0' }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurface'), mb: 2 }}>
          Keep this library the same on your other computers.
        </Typography>
        <SyncthingSetup available={false} bundled={false} compact />
      </div>
    );
  }
  if (!status.enabled) {
    return (
      <Row title="Sync is off" body="Keep this library the same on your other computers.">
        <Button variant="contained" disabled={busy} onClick={() => void act(() => call('sync:enable', 'push'))}>
          Turn on
        </Button>
      </Row>
    );
  }
  const mode = MODES.find((m) => m.value === status.mode)!;
  return (
    <>
      <Row title="This computer" body={mode.help}>
        <SegmentedButton label="Sync direction" value={status.mode} onChange={(m) => void act(() => call('sync:setMode', m))} options={MODES.map((m) => ({ value: m.value, label: m.label }))} />
      </Row>
      {status.myId && (
        <div style={{ padding: '12px 0', borderBottom: `1px solid ${md('outlineVariant')}` }}>
          <Typography variant="bodyMedium" sx={{ color: md('onSurface'), mb: 1 }}>
            This computer’s device ID
          </Typography>
          <DeviceId id={status.myId} />
        </div>
      )}
      {status.folder && (
        <Row title={status.folder.state === 'idle' && !status.folder.needBytes ? 'Up to date' : status.folder.state === 'syncing' ? 'Syncing…' : status.folder.state} body={status.folder.needBytes ? `${formatBytes(status.folder.needBytes)} still to come` : undefined} />
      )}
      {status.devices.map((d) => (
        <Row
          key={d.id}
          title={d.name}
          body={
            <>
              {d.connected ? 'Connected' : 'Not connected'}
              {d.completion !== null && d.connected ? ` · ${Math.round(d.completion)}% in step` : ''}
              {!d.shared ? ' · not sharing this library' : ''}
            </>
          }
        >
          <ComputerOutlined sx={{ color: d.connected ? md('primary') : md('onSurfaceVariant') }} />
          <Tooltip title="Unpair">
            <IconButton onClick={() => void act(() => call('sync:removeDevice', d.id))}>
              <DeleteOutlined />
            </IconButton>
          </Tooltip>
        </Row>
      ))}
      {status.pendingDevices.map((d) => (
        <Row key={d.id} title={`${d.name || 'A computer'} wants to connect`} body={d.id}>
          <Button variant="outlined" onClick={() => void act(() => call('sync:addDevice', d.id, d.name))}>
            Accept
          </Button>
        </Row>
      ))}
      <Row title="Other computers" body="Pair a computer to share this library with it.">
        <Button onClick={() => setAdding(true)}>Add a computer</Button>
      </Row>
      <Row title="Turn off sync" body="Stops syncing on this computer. Paired computers are remembered.">
        <Button color="error" disabled={busy} onClick={() => void act(() => call('sync:disable'))}>
          Turn off
        </Button>
      </Row>
      <AddComputer open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
