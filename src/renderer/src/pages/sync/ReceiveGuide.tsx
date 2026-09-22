import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ComputerRounded from '@mui/icons-material/ComputerRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import LaptopRounded from '@mui/icons-material/LaptopRounded';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type { SyncMode } from '@shared/types';
import { call } from '../../api';
import { SegmentedButton } from '../../components/SegmentedButton';
import { StatusSlot, type SlotMessage } from '../../components/StatusSlot';
import { formatBytes } from '../../components/labels';
import { failed, notify } from '../../notices/store';
import { md, mdAlpha, SHAPE } from '../../theme';
import { DIALOG_HEIGHT, DIALOG_WIDTH, SetupFrame, Side } from '../library/LibraryDialog';
import { LocationFields, SectionLabel, useLocation } from '../library/Location';
import { DeviceId, useSyncStatus } from '../settings/SyncSettings';
import { ToolSetup } from '../setup/ToolSetup';

type Step = 'setup' | 'pair' | 'choose' | 'where' | 'arriving';

const STEPS: { id: Step; title: string }[] = [
  { id: 'setup', title: 'Get Syncthing' },
  { id: 'pair', title: 'Connect' },
  { id: 'choose', title: 'Choose the library' },
  { id: 'where', title: 'Where it goes' },
  { id: 'arriving', title: 'Receive' },
];

/** Receiving has no use for "send only". */
const DIRECTIONS: { value: SyncMode; label: string; help: string }[] = [
  { value: 'pull', label: 'Receive only', help: 'Gets changes, never sends any.' },
  { value: 'full', label: 'Both ways', help: 'Changes go both ways; replaced files are kept 30 days.' },
];

function Rail({ step, done }: { step: Step; done: (s: Step) => boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {STEPS.map((s, i) => {
        const current = s.id === step;
        const finished = done(s.id) && !current;
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', height: 44 }}>
            {i < STEPS.length - 1 && <span style={{ position: 'absolute', left: 13, top: 36, height: 16, width: 2, background: finished ? md('primary') : mdAlpha('onSecondaryContainer', 0.2) }} />}
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                fontSize: 13,
                fontWeight: 600,
                background: finished || current ? md('primary') : mdAlpha('surface', 0.6),
                color: finished || current ? md('onPrimary') : md('onSurfaceVariant'),
                boxShadow: current ? `0 0 0 4px ${mdAlpha('primary', 0.2)}` : 'none',
              }}
            >
              {finished ? <CheckRounded sx={{ fontSize: 16 }} /> : i + 1}
            </span>
            <Typography variant="labelLarge" sx={{ fontWeight: current ? 700 : 500, opacity: current || finished ? 1 : 0.7 }}>
              {s.title}
            </Typography>
          </div>
        );
      })}
    </div>
  );
}

/** A labelled card saying which computer an instruction is for. */
function Where({ who, children }: { who: 'other' | 'this'; children: ReactNode }) {
  const other = who === 'other';
  return (
    <div style={{ borderRadius: SHAPE.xl, border: `1px solid ${md('outlineVariant')}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: other ? md('tertiaryContainer') : md('primaryContainer'), color: other ? md('onTertiaryContainer') : md('onPrimaryContainer') }}>
        {other ? <ComputerRounded sx={{ fontSize: 18 }} /> : <LaptopRounded sx={{ fontSize: 18 }} />}
        <Typography variant="labelLarge">{other ? 'On the computer with the library' : 'On this computer'}</Typography>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

const K = ({ children }: { children: ReactNode }) => <b style={{ fontWeight: 600, color: md('primary') }}>{children}</b>;

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <Typography variant="titleLarge" sx={{ color: md('onSurface') }}>
        {title}
      </Typography>
      <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), mt: 0.25 }}>
        {sub}
      </Typography>
    </div>
  );
}

const waiting = (text: string): SlotMessage => ({ tone: 'info', text, busy: true });

/**
 * The guided way to receive a library: get Syncthing, pair the two computers (with what to do on
 * each), pick the library the other one offers, choose where it goes, and watch it arrive. The
 * dialog keeps one size throughout; what changes while waiting shows in fixed slots.
 */
export function ReceiveGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useSyncStatus(open ? 2000 : 60_000).data;
  const [step, setStep] = useState<Step>('setup');
  const [offer, setOffer] = useState<{ id: string; label: string; offeredBy: string } | null>(null);
  const [mode, setMode] = useState<SyncMode>('pull');
  const [arriving, setArriving] = useState<{ path: string; folderId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const loc = useLocation('Tessera Library');
  const { setName } = loc;

  const available = !!status?.available;
  const paired = !!status && (status.devices.some((d) => d.connected) || status.pendingFolders.length > 0);

  // Start Tessera's Syncthing as soon as there is one, so this computer has an ID to give.
  useEffect(() => {
    if (open && available && !status?.running) void call('sync:receive').catch((e: unknown) => failed(e, 'Couldn’t start Syncthing'));
  }, [open, available, status?.running]);
  // Move on by itself when a step is done.
  useEffect(() => {
    if (step === 'setup' && available) setStep('pair');
    if (step === 'pair' && status?.pendingFolders.length) setStep('choose');
  }, [step, available, status?.pendingFolders.length]);
  useEffect(() => {
    if (offer) setName(offer.label);
  }, [offer, setName]);

  const progress = useQuery({ queryKey: ['arriving', arriving?.folderId], queryFn: () => call('sync:folderProgress', arriving!.folderId), enabled: !!arriving, refetchInterval: 1500, staleTime: 0 }).data;
  // Once the library's own file has arrived, open it; the rest keeps coming in the background.
  useEffect(() => {
    if (!arriving) return;
    const t = setInterval(async () => {
      if ((await call('library:inspect', arriving.path)) === 'library') {
        clearInterval(t);
        await call('sync:enable', mode).catch(() => undefined);
        await call('library:open', arriving.path);
        notify.success('The library is here. The rest keeps arriving in the background.');
        onClose();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [arriving, mode, onClose]);

  const start = async () => {
    if (!offer || !loc.target || loc.blocked) return;
    setBusy(true);
    try {
      await call('sync:acceptFolder', offer.id, offer.offeredBy, offer.label, loc.target, mode);
      setArriving({ path: loc.target, folderId: offer.id });
      setStep('arriving');
    } catch (e) {
      failed(e, 'Couldn’t start receiving');
    } finally {
      setBusy(false);
    }
  };

  const done = (s: Step) => ({ setup: available, pair: paired, choose: !!offer, where: !!arriving, arriving: false })[s];
  const order = STEPS.map((s) => s.id);
  const back = order[order.indexOf(step) - 1];
  const deviceName = (id: string) => status?.devices.find((d) => d.id === id)?.name ?? 'the other computer';

  let body: ReactNode = null;
  let next: ReactNode = null;
  if (step === 'setup') {
    body = (
      <>
        <Heading title="Get Syncthing" sub="Both computers need it. Tessera can set it up." />
        <ToolSetup tool="syncthing" available={available} bundled={!!status?.bundled} />
      </>
    );
    next = (
      <Button variant="contained" disabled={!available} onClick={() => setStep('pair')}>
        Next
      </Button>
    );
  } else if (step === 'pair') {
    const pending = status?.pendingDevices[0];
    const connected = status?.devices.find((d) => d.connected);
    const known = status?.devices[0];
    const slot: SlotMessage = pending
      ? {
          tone: 'success',
          text: (
            <>
              <b>{pending.name || 'A computer'}</b> wants to connect.
            </>
          ),
          action: (
            <Button variant="contained" size="small" onClick={() => void call('sync:addDevice', pending.id, pending.name).catch((e: unknown) => failed(e))}>
              Accept
            </Button>
          ),
        }
      : connected
        ? { tone: 'success', text: `Connected to ${connected.name}.` }
        : known
          ? waiting(`Paired with ${known.name}. Connecting…`)
          : status?.myId
            ? waiting('Waiting for the other computer…')
            : waiting('Starting Syncthing…');
    body = (
      <>
        <Heading title="Connect the computers" sub="Only needed once." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Where who="other">
            <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurface'), lineHeight: '28px' }}>
              <K>Settings › Sync</K> → <K>Turn on</K> → <K>Add a computer</K> → paste the ID below → <K>Pair</K>
            </Typography>
          </Where>
          <Where who="this">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ height: 40 }}>{status?.myId ? <DeviceId id={status.myId} /> : null}</div>
              <StatusSlot message={slot} />
            </div>
          </Where>
        </div>
      </>
    );
    next = (
      <Button variant="contained" disabled={!paired} onClick={() => setStep('choose')}>
        Next
      </Button>
    );
  } else if (step === 'choose') {
    const offers = status?.pendingFolders ?? [];
    body = (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Heading title="Choose the library" sub="What the other computer shares." />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {offers.map((f) => {
            const selected = offer?.id === f.id && offer.offeredBy === f.offeredBy;
            return (
              <ButtonBase
                key={f.id + f.offeredBy}
                onClick={() => setOffer(f)}
                sx={{ height: 76, flexShrink: 0, justifyContent: 'flex-start', gap: 1.75, px: 1.75, borderRadius: `${SHAPE.lg}px`, textAlign: 'left', border: `2px solid ${selected ? md('primary') : md('outlineVariant')}`, backgroundColor: selected ? md('primaryContainer') : md('surfaceContainerLow') }}
              >
                <span style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: selected ? md('primary') : md('secondaryContainer'), color: selected ? md('onPrimary') : md('onSecondaryContainer') }}>
                  <AutoStoriesOutlined />
                </span>
                <span style={{ flex: 1 }}>
                  <Typography variant="titleMedium" component="div" sx={{ color: md('onSurface') }}>
                    {f.label}
                  </Typography>
                  <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
                    From {deviceName(f.offeredBy)}
                  </Typography>
                </span>
                {selected && <CheckRounded sx={{ color: md('primary') }} />}
              </ButtonBase>
            );
          })}
        </div>
        <div style={{ marginTop: 16 }}>
          <StatusSlot message={offers.length ? null : waiting('Waiting for a library. Keep Tessera open on the other computer.')} />
        </div>
      </div>
    );
    next = (
      <Button variant="contained" disabled={!offer} onClick={() => setStep('where')}>
        Next
      </Button>
    );
  } else if (step === 'where') {
    body = (
      <>
        <LocationFields loc={loc} pickerTitle="Choose where the library goes" slot={false} />
        <div style={{ marginTop: 20 }}>
          <SectionLabel n={3}>This computer</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <SegmentedButton label="Sync direction" value={mode} onChange={setMode} options={DIRECTIONS.map((m) => ({ value: m.value, label: m.label }))} />
            <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant') }}>
              {DIRECTIONS.find((m) => m.value === mode)!.help}
            </Typography>
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <StatusSlot message={loc.message} />
        </div>
      </>
    );
    next = (
      <Button variant="contained" disabled={busy || loc.blocked} onClick={() => void start()} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
        Start receiving
      </Button>
    );
  } else {
    const pct = progress && progress.globalBytes ? Math.min(100, (progress.inSyncBytes / progress.globalBytes) * 100) : null;
    body = (
      <>
        <Heading title="Receiving" sub="It opens as soon as it’s usable." />
        <div style={{ padding: 20, borderRadius: SHAPE.xl, background: md('surfaceContainerLow'), display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
            {offer?.label}
          </Typography>
          <LinearProgress variant={pct === null ? 'indeterminate' : 'determinate'} {...(pct === null ? {} : { value: pct })} sx={{ height: 8, borderRadius: 4 }} />
          <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), height: 18 }}>
            {progress && progress.globalBytes ? `${formatBytes(progress.inSyncBytes)} of ${formatBytes(progress.globalBytes)}` : 'Getting ready…'}
          </Typography>
        </div>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{ paper: { sx: { width: DIALOG_WIDTH, height: DIALOG_HEIGHT, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 48px)', borderRadius: `${SHAPE.xl}px`, overflow: 'hidden', backgroundImage: 'none', p: 0 } } }}
    >
      <SetupFrame
        side={
          <Side icon={DevicesRounded} title="Get a library from another computer" lead="Direct and encrypted. No account, no cloud.">
            <Rail step={step} done={done} />
          </Side>
        }
        onClose={onClose}
        footer={
          <>
            {back && step !== 'arriving' && <Button onClick={() => setStep(back)}>Back</Button>}
            <span style={{ flex: 1 }} />
            <Button onClick={onClose}>{step === 'arriving' ? 'Close' : 'Cancel'}</Button>
            {next}
          </>
        }
      >
        {body}
      </SetupFrame>
    </Dialog>
  );
}
