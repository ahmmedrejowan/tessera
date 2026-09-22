import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ComputerRounded from '@mui/icons-material/ComputerRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import LaptopRounded from '@mui/icons-material/LaptopRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type { SyncMode } from '@shared/types';
import { call } from '../../api';
import { SegmentedButton } from '../../components/SegmentedButton';
import { formatBytes } from '../../components/labels';
import { failed, notify } from '../../notices/store';
import { md, mdAlpha, SHAPE } from '../../theme';
import { LocationFields, useLocation } from '../library/Location';
import { DeviceId, MODES, useSyncStatus } from '../settings/SyncSettings';
import { SyncthingSetup } from './SyncthingSetup';

type Step = 'setup' | 'pair' | 'choose' | 'where' | 'arriving';

const STEPS: { id: Step; title: string; hint: string }[] = [
  { id: 'setup', title: 'Get Syncthing', hint: 'On both computers' },
  { id: 'pair', title: 'Connect the computers', hint: 'Pair them once' },
  { id: 'choose', title: 'Choose the library', hint: 'What the other one offers' },
  { id: 'where', title: 'Where it goes', hint: 'A folder on this computer' },
  { id: 'arriving', title: 'Receive it', hint: 'Opens when it’s ready' },
];

function Rail({ step, done }: { step: Step; done: (s: Step) => boolean }) {
  return (
    <div
      style={{
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        background: `radial-gradient(120% 70% at 0% 0%, ${mdAlpha('primaryContainer', 0.9)} 0%, transparent 70%), radial-gradient(100% 60% at 100% 100%, ${mdAlpha('tertiaryContainer', 0.7)} 0%, transparent 70%), ${md('secondaryContainer')}`,
        color: md('onSecondaryContainer'),
      }}
    >
      <div>
        <span style={{ width: 56, height: 56, borderRadius: 18, display: 'grid', placeItems: 'center', background: md('primary'), color: md('onPrimary'), marginBottom: 20, boxShadow: `0 6px 18px ${mdAlpha('primary', 0.3)}` }}>
          <DevicesRounded sx={{ fontSize: 28 }} />
        </span>
        <Typography variant="headlineSmall" component="h2" sx={{ fontWeight: 500 }}>
          Get a library from another computer
        </Typography>
        <Typography variant="bodySmall" component="div" sx={{ mt: 1, opacity: 0.85, display: 'flex', gap: 0.75 }}>
          <LockOutlined sx={{ fontSize: 16, mt: '1px' }} /> Straight between your computers, encrypted. No account, no cloud.
        </Typography>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {STEPS.map((s, i) => {
          const current = s.id === step;
          const finished = done(s.id) && !current;
          return (
            <div key={s.id} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: i < STEPS.length - 1 ? 18 : 0 }}>
              {i < STEPS.length - 1 && <span style={{ position: 'absolute', left: 13, top: 30, bottom: 2, width: 2, background: finished ? md('primary') : mdAlpha('onSecondaryContainer', 0.2) }} />}
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
              <div style={{ opacity: current || finished ? 1 : 0.7 }}>
                <Typography variant="labelLarge" component="div" sx={{ fontWeight: current ? 700 : 500 }}>
                  {s.title}
                </Typography>
                <Typography variant="bodySmall" component="div" sx={{ opacity: 0.75 }}>
                  {s.hint}
                </Typography>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A labelled card saying which computer an instruction is for. */
function Where({ who, children }: { who: 'other' | 'this'; children: ReactNode }) {
  const other = who === 'other';
  return (
    <div style={{ borderRadius: SHAPE.xl, border: `1px solid ${md('outlineVariant')}`, background: other ? md('surfaceContainerLow') : md('surface'), overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: other ? md('tertiaryContainer') : md('primaryContainer'), color: other ? md('onTertiaryContainer') : md('onPrimaryContainer') }}>
        {other ? <ComputerRounded sx={{ fontSize: 18 }} /> : <LaptopRounded sx={{ fontSize: 18 }} />}
        <Typography variant="labelLarge">{other ? 'On the computer that has the library' : 'On this computer'}</Typography>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: 10 }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', background: md('surfaceContainerHighest'), color: md('onSurfaceVariant'), fontSize: 12, fontWeight: 600, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
          <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurface') }}>
            {item}
          </Typography>
        </li>
      ))}
    </ol>
  );
}

const Kbd = ({ children }: { children: ReactNode }) => <b style={{ fontWeight: 600, color: md('primary') }}>{children}</b>;

function Waiting({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: SHAPE.md, background: md('surfaceContainerHigh') }}>
      <CircularProgress size={18} thickness={5} />
      <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
        {children}
      </Typography>
    </div>
  );
}

function StepTitle({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <Typography variant="titleLarge" sx={{ color: md('onSurface') }}>
        {title}
      </Typography>
      <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), mt: 0.5 }}>
        {body}
      </Typography>
    </div>
  );
}

/**
 * The guided way to receive a library: get Syncthing, pair the two computers (with what to do on
 * each), pick the library the other one offers, choose where it goes, and watch it arrive.
 */
export function ReceiveGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useSyncStatus(open ? 2000 : 60_000).data;
  const [step, setStep] = useState<Step>('setup');
  const [offer, setOffer] = useState<{ id: string; label: string; offeredBy: string } | null>(null);
  const [mode, setMode] = useState<SyncMode>('pull');
  const [arriving, setArriving] = useState<{ path: string; folderId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const loc = useLocation(offer?.label ?? 'Tessera Library');

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
    if (offer) loc.setName(offer.label);
  }, [offer]);

  const progress = useQuery({ queryKey: ['arriving', arriving?.folderId], queryFn: () => call('sync:folderProgress', arriving!.folderId), enabled: !!arriving, refetchInterval: 1500, staleTime: 0 }).data;
  // Once the library's own file has arrived, open it; the rest keeps coming in the background.
  useEffect(() => {
    if (!arriving) return;
    const t = setInterval(async () => {
      if ((await call('library:inspect', arriving.path)) === 'library') {
        clearInterval(t);
        await call('sync:enable', mode).catch(() => undefined);
        await call('library:open', arriving.path);
        notify.success('The library is here. The rest of its files keep arriving in the background.');
        onClose();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [arriving, mode, onClose]);

  const start = async () => {
    if (!offer || !loc.target || loc.blocker) return;
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
        <StepTitle title="Get Syncthing" body="Tessera moves libraries between computers with Syncthing, a free, open-source tool. Both computers need it; each one’s Tessera can set it up the same way." />
        <SyncthingSetup available={available} bundled={!!status?.bundled} />
      </>
    );
    next = (
      <Button variant="contained" disabled={!available} onClick={() => setStep('pair')}>
        Next
      </Button>
    );
  } else if (step === 'pair') {
    body = (
      <>
        <StepTitle title="Connect the two computers" body="Pair them once; after that they find each other on their own, at home or across the internet." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Where who="other">
            <Steps
              items={[
                <>Open Tessera there, with the library you want to bring over.</>,
                <>
                  Go to <Kbd>Settings › Sync between computers</Kbd> and choose <Kbd>Turn on</Kbd>. If it asks for Syncthing, use <Kbd>Download and set up</Kbd> there too.
                </>,
                <>
                  Choose <Kbd>Add a computer</Kbd>, paste this computer’s ID (below), give it a name, and choose <Kbd>Pair</Kbd>.
                </>,
              ]}
            />
          </Where>
          <Where who="this">
            <Typography variant="bodyMedium" sx={{ color: md('onSurface'), mb: 1 }}>
              This computer’s ID. Copy it and send it to yourself however is easiest: a chat, an email, a note.
            </Typography>
            {status?.myId ? <DeviceId id={status.myId} /> : <Waiting>Starting Syncthing…</Waiting>}
            <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 1 }}>
              It only identifies this copy of Tessera; it can’t be used to get in without your say-so on this screen.
            </Typography>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {status?.pendingDevices.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 14px', borderRadius: SHAPE.md, background: md('primaryContainer'), color: md('onPrimaryContainer') }}>
                  <ComputerRounded />
                  <Typography variant="bodyMedium" sx={{ flex: 1 }}>
                    <b>{d.name || 'A computer'}</b> wants to connect.
                  </Typography>
                  <Button variant="contained" onClick={() => void call('sync:addDevice', d.id, d.name).catch((e: unknown) => failed(e))}>
                    Accept
                  </Button>
                </div>
              ))}
              {status?.devices.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: SHAPE.md, background: md('surfaceContainerHigh') }}>
                  <ComputerRounded sx={{ color: d.connected ? md('primary') : md('onSurfaceVariant') }} />
                  <Typography variant="bodyMedium" sx={{ flex: 1, color: md('onSurface') }}>
                    {d.name} · {d.connected ? 'connected' : 'paired, not connected yet'}
                  </Typography>
                  {d.connected && <CheckRounded sx={{ color: md('primary') }} />}
                </div>
              ))}
              {!status?.pendingDevices.length && !status?.devices.length && status?.myId && <Waiting>Waiting for the other computer to add this one…</Waiting>}
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
      <>
        <StepTitle title="Choose the library" body="Libraries the other computer shares with this one show up here." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {offers.map((f) => {
            const selected = offer?.id === f.id && offer.offeredBy === f.offeredBy;
            return (
              <ButtonBase
                key={f.id + f.offeredBy}
                onClick={() => setOffer(f)}
                sx={{ justifyContent: 'flex-start', gap: 1.75, p: 1.75, borderRadius: `${SHAPE.lg}px`, textAlign: 'left', border: `2px solid ${selected ? md('primary') : md('outlineVariant')}`, backgroundColor: selected ? md('primaryContainer') : md('surfaceContainerLow') }}
              >
                <span style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: selected ? md('primary') : md('secondaryContainer'), color: selected ? md('onPrimary') : md('onSecondaryContainer') }}>
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
          {!offers.length && <Waiting>Waiting for the other computer to share its library. It does so as soon as the two are paired; if nothing comes within a minute, check that Tessera is open there with the library.</Waiting>}
        </div>
      </>
    );
    next = (
      <Button variant="contained" disabled={!offer} onClick={() => setStep('where')}>
        Next
      </Button>
    );
  } else if (step === 'where') {
    const help = MODES.find((m) => m.value === mode)!.help;
    body = (
      <>
        <StepTitle title="Where should it go?" body={`“${offer?.label ?? ''}” arrives in a folder on this computer.`} />
        <LocationFields loc={loc} what="library" pickerTitle="Choose where the library goes" />
        <div style={{ marginTop: 24 }}>
          <Typography variant="titleSmall" sx={{ color: md('onSurface'), mb: 1 }}>
            How this computer keeps in step
          </Typography>
          <SegmentedButton label="Sync direction" value={mode} onChange={setMode} options={MODES.filter((m) => m.value !== 'push').map((m) => ({ value: m.value, label: m.label }))} />
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 1 }}>
            {help} You can change this later in Settings.
          </Typography>
        </div>
      </>
    );
    next = (
      <Button variant="contained" disabled={busy || !!loc.blocker} onClick={() => void start()} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}>
        Start receiving
      </Button>
    );
  } else {
    const pct = progress && progress.globalBytes ? Math.min(100, (progress.inSyncBytes / progress.globalBytes) * 100) : null;
    body = (
      <>
        <StepTitle title="Receiving the library" body="It opens as soon as its first files are here. The rest keep arriving in the background, even after this closes." />
        <div style={{ padding: 20, borderRadius: SHAPE.xl, background: md('surfaceContainerLow'), display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
            {offer?.label}
          </Typography>
          <LinearProgress variant={pct === null ? 'indeterminate' : 'determinate'} {...(pct === null ? {} : { value: pct })} sx={{ height: 8, borderRadius: 4 }} />
          <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
            {progress && progress.globalBytes ? `${formatBytes(progress.inSyncBytes)} of ${formatBytes(progress.globalBytes)}` : 'Getting ready…'}
          </Typography>
        </div>
      </>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth={false} slotProps={{ paper: { sx: { width: 1000, maxWidth: 'calc(100vw - 48px)', height: 'min(720px, calc(100vh - 48px))', borderRadius: `${SHAPE.xl}px`, overflow: 'hidden', backgroundImage: 'none', p: 0 } } }}>
      <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', height: '100%' }}>
        <Rail step={step} done={done} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
          <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', top: 12, right: 12, zIndex: 1 }}>
            <CloseRounded />
          </IconButton>
          <div style={{ flex: 1, overflowY: 'auto', padding: '36px 32px 20px' }}>{body}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 24px 20px', borderTop: `1px solid ${md('outlineVariant')}` }}>
            {back && step !== 'arriving' && <Button onClick={() => setStep(back)}>Back</Button>}
            <span style={{ flex: 1 }} />
            <Button onClick={onClose}>{step === 'arriving' ? 'Close' : 'Cancel'}</Button>
            {next}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
