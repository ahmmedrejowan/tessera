import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ComputerOutlined from '@mui/icons-material/ComputerOutlined';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { SyncMode } from '@shared/types';
import { call } from '../../api';
import { SegmentedButton } from '../../components/SegmentedButton';
import { StatusSlot, type SlotMessage } from '../../components/StatusSlot';
import { failed, notify } from '../../notices/store';
import { md, mdAlpha, SHAPE } from '../../theme';
import { DIALOG_HEIGHT, DIALOG_WIDTH, SetupFrame, Side } from '../library/LibraryDialog';
import { MODES, useSyncStatus, DeviceId } from '../settings/SyncSettings';
import { StepRail } from './BackupGuide';
import { ToolSetup } from './ToolSetup';

type Step = 'syncthing' | 'which way' | 'the other computer' | 'share it';

const STEPS: { id: Step; title: string }[] = [
  { id: 'syncthing', title: 'Get Syncthing' },
  { id: 'which way', title: 'Which way' },
  { id: 'the other computer', title: 'The other computer' },
  { id: 'share it', title: 'Share it' },
];

/**
 * What to say to an agent so it does the whole thing.
 *
 * Syncing is the one job in Tessera that has to be done twice, on two computers, in the right
 * order, and the same person is usually sitting at both. That is tedious by hand and nothing
 * special for an agent, so the words are here to copy rather than left to be worked out.
 */
const PROMPT = `Set up Tessera syncing between my two computers.

On this computer:
1. Call set_up_sync with mode "push" (this is the computer that holds the library). Tell me the device ID it gives back.
2. Wait while I run the same on the other computer and give you its device ID.
3. Call pair_computer with the other computer's ID and a name for it.
4. Call share_library_with using that same device ID.
5. Call sync_status and tell me whether the other computer is connected and caught up.

On the other computer, in its own Tessera:
1. Call show_my_device_id and give me the ID.
2. Call pair_computer with this computer's ID.
3. Call sync_status, find the library waiting under waitingToBeAccepted, and call
   accept_shared_library with an empty folder to put it in, mode "pull".

Tell me at each step what you did and what you need from me. Do not change anything else.`;

function AgentOffer() {
  const [copied, setCopied] = useState(false);
  const [showing, setShowing] = useState(false);
  return (
    <div style={{ padding: 14, borderRadius: SHAPE.lg, background: mdAlpha('primaryContainer', 0.5), display: 'flex', flexDirection: 'column', gap: showing ? 10 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <AutoAwesomeRounded sx={{ fontSize: 20, color: md('primary'), flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
            Or have an agent do it
          </Typography>
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
            The same few steps on two computers. Turn the app’s own tools on under AI agents, then paste this.
          </Typography>
        </div>
        <Button size="small" onClick={() => setShowing((v) => !v)}>
          {showing ? 'Hide' : 'Read it'}
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ContentCopyRounded sx={{ fontSize: 16 }} />}
          onClick={() => void navigator.clipboard.writeText(PROMPT).then(() => { setCopied(true); notify.success('Copied. Paste it to your agent.'); })}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {showing && (
        <pre
          style={{
            margin: 0,
            maxHeight: 180,
            overflowY: 'auto',
            padding: 12,
            borderRadius: SHAPE.md,
            background: md('surfaceContainerLowest'),
            color: md('onSurfaceVariant'),
            fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
            fontSize: 11.5,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            userSelect: 'text',
          }}
        >
          {PROMPT}
        </pre>
      )}
    </div>
  );
}

/**
 * Setting syncing up, a step at a time.
 *
 * The same shape as setting backups up, because it is the same kind of job: a program to fetch, a
 * choice to make, and something to do on the other end. Doing it in a dialog keeps the settings
 * section down to one row whether or not anything is installed.
 */
export function SyncGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const status = useSyncStatus(open ? 2000 : 0).data;
  const [step, setStep] = useState<Step>('syncthing');
  const [mode, setMode] = useState<SyncMode>('push');
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState<SlotMessage | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(status?.available ? (status.enabled ? 'the other computer' : 'which way') : 'syncthing');
    setNote(null);
  }, [open]);

  // The moment Syncthing arrives, that step is finished; no reason to make anybody press Next.
  useEffect(() => {
    if (open && step === 'syncthing' && status?.available) setStep('which way');
  }, [open, step, status?.available]);

  const done = (s: Step) => STEPS.findIndex((x) => x.id === s) < STEPS.findIndex((x) => x.id === step);
  const act = async (fn: () => Promise<unknown>, then?: () => void) => {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      await client.invalidateQueries({ queryKey: ['sync'] });
      then?.();
    } catch (e) {
      setNote({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const paired = status?.devices ?? [];
  const shared = paired.filter((d) => d.shared);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{ paper: { sx: { width: DIALOG_WIDTH, height: DIALOG_HEIGHT, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 48px)', borderRadius: `${SHAPE.xl}px`, overflow: 'hidden', backgroundImage: 'none', p: 0 } } }}
    >
      <SetupFrame
        onClose={onClose}
        side={
          <Side icon={SyncRounded} title="Set up syncing" lead="The same library on your other computers, over your own network.">
            <StepRail steps={STEPS} step={step} done={done} />
          </Side>
        }
        footer={
          <>
            <Button onClick={onClose}>{step === 'share it' ? 'Done' : 'Cancel'}</Button>
            {step === 'which way' && (
              <Button variant="contained" disabled={busy || !status?.available} onClick={() => void act(() => call('sync:enable', mode), () => setStep('the other computer'))}>
                Turn on syncing
              </Button>
            )}
            {step === 'the other computer' && (
              <Button variant="contained" disabled={busy || !id.trim()} onClick={() => void act(() => call('sync:addDevice', id.trim(), name.trim()), () => { setId(''); setName(''); setStep('share it'); })}>
                Pair it
              </Button>
            )}
          </>
        }
      >
        {step === 'syncthing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <Typography variant="headlineSmall" sx={{ color: md('onSurface') }}>
                Get Syncthing
              </Typography>
              <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5 }}>
                Syncthing does the syncing itself, computer to computer, with nothing in between. Tessera can fetch the official build, or you can install it your own way.
              </Typography>
            </div>
            <ToolSetup tool="syncthing" available={!!status?.available} bundled={!!status?.bundled} compact />
            <AgentOffer />
          </div>
        )}

        {step === 'which way' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <Typography variant="headlineSmall" sx={{ color: md('onSurface') }}>
                Which way
              </Typography>
              <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5 }}>
                What this computer does with the library. You can change it whenever you like.
              </Typography>
            </div>
            <SegmentedButton label="Sync direction" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m.value, label: m.label }))} />
            <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
              {MODES.find((m) => m.value === mode)?.help}
            </Typography>
            <StatusSlot message={note} />
            <AgentOffer />
          </div>
        )}

        {step === 'the other computer' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <Typography variant="headlineSmall" sx={{ color: md('onSurface') }}>
                The other computer
              </Typography>
              <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5 }}>
                Each computer has an ID, and the two have to know each other’s. Open Tessera there, come to this same step, and swap them.
              </Typography>
            </div>
            {status?.myId && (
              <div>
                <Typography variant="titleSmall" sx={{ color: md('onSurface'), mb: 0.75 }}>
                  This computer’s ID, to give to the other one
                </Typography>
                <DeviceId id={status.myId} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <TextField label="Its device ID" value={id} onChange={(e) => setId(e.target.value)} placeholder="XXXXXXX-XXXXXXX-…" sx={{ flex: 2 }} />
              <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Desktop PC" sx={{ flex: 1 }} />
            </div>
            <StatusSlot message={note} />
            <AgentOffer />
          </div>
        )}

        {step === 'share it' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <Typography variant="headlineSmall" sx={{ color: md('onSurface') }}>
                Share it
              </Typography>
              <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5 }}>
                Pairing only lets the computers find each other. Offer this library to the ones that should have it; somebody there has to accept it before anything moves.
              </Typography>
            </div>
            {paired.length === 0 && (
              <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
                No computers paired yet. Go back a step and swap IDs first.
              </Typography>
            )}
            {paired.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
                <ComputerOutlined sx={{ color: d.connected ? md('primary') : md('onSurfaceVariant') }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="bodyLarge" noWrap sx={{ color: md('onSurface') }}>
                    {d.name || 'A computer'}
                  </Typography>
                  <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
                    {d.shared ? 'Has this library' : d.connected ? 'Connected' : 'Not connected yet'}
                  </Typography>
                </div>
                {d.shared ? (
                  <CheckCircleRounded sx={{ color: md('primary') }} />
                ) : (
                  <Button disabled={busy} onClick={() => void act(() => call('sync:addDevice', d.id, d.name))}>
                    Share
                  </Button>
                )}
              </div>
            ))}
            {shared.length > 0 && (
              <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
                Waiting for {shared.map((d) => d.name || 'the other computer').join(', ')} to accept it. Once accepted, the library starts coming across on its own.
              </Typography>
            )}
            <StatusSlot message={note} />
          </div>
        )}
      </SetupFrame>
    </Dialog>
  );
}
