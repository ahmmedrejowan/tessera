import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloudOutlined from '@mui/icons-material/CloudOutlined';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import RestoreRounded from '@mui/icons-material/RestoreRounded';
import UsbRounded from '@mui/icons-material/UsbRounded';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type { FoundBackup, RestoreSource } from '@shared/types';
import { baseName } from '@shared/folders';
import { call, on } from '../../api';
import { formatBytes } from '../../components/labels';
import { StatusSlot, type SlotMessage } from '../../components/StatusSlot';
import { failed, notify } from '../../notices/store';
import { md, mdAlpha, SHAPE } from '../../theme';
import { DIALOG_HEIGHT, DIALOG_WIDTH, SetupFrame, Side } from '../library/LibraryDialog';
import { LocationFields, SectionLabel, tidyPath, useLocation } from '../library/Location';
import { newTarget, ProviderGrid, StorageForm } from './Storage';
import { ToolSetup } from './ToolSetup';
import { describeTarget, providerInfo, targetProblem, type StorageTarget } from '@shared/storage';

type Step = 'setup' | 'find' | 'unlock' | 'choose' | 'where' | 'restoring';

const STEPS: { id: Step; title: string }[] = [
  { id: 'setup', title: 'Get Kopia' },
  { id: 'find', title: 'Find the backup' },
  { id: 'unlock', title: 'Unlock it' },
  { id: 'choose', title: 'Choose what' },
  { id: 'where', title: 'Where it goes' },
  { id: 'restoring', title: 'Restore' },
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

/** A selectable card of fixed height. */
function Choice({ icon, title, sub, selected, onClick, trailing }: { icon: ReactNode; title: string; sub: string; selected: boolean; onClick: () => void; trailing?: ReactNode }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{ height: 72, flexShrink: 0, justifyContent: 'flex-start', gap: 1.75, px: 1.75, borderRadius: `${SHAPE.lg}px`, textAlign: 'left', border: `2px solid ${selected ? md('primary') : md('outlineVariant')}`, backgroundColor: selected ? md('primaryContainer') : md('surfaceContainerLow') }}
    >
      <span style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', flexShrink: 0, background: selected ? md('primary') : md('secondaryContainer'), color: selected ? md('onPrimary') : md('onSecondaryContainer') }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleMedium" component="div" noWrap sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        <Typography variant="bodySmall" component="div" noWrap sx={{ color: md('onSurfaceVariant') }}>
          {sub}
        </Typography>
      </span>
      {trailing}
      {selected && <CheckRounded sx={{ color: md('primary') }} />}
    </ButtonBase>
  );
}

const PLACE_ICON = { cloud: <CloudOutlined />, drive: <UsbRounded />, folder: <FolderRounded /> };
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Start again from a backup, on a new computer or after losing the library: get Kopia, find the
 * backup (Tessera looks in cloud drive folders and connected drives), unlock it, pick the library
 * and the moment to go back to, choose where it goes, and restore. Backing up can carry on to the
 * same place afterwards.
 */
export function RestoreGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const status = useQuery({ queryKey: ['backup'], queryFn: () => call('backup:status'), enabled: open, staleTime: 0 }).data;
  const [step, setStep] = useState<Step>('setup');
  const [repo, setRepo] = useState<FoundBackup | null>(null);
  /** A store elsewhere: a cloud drive, cloud storage or a server. */
  const [remote, setRemote] = useState<StorageTarget | null>(null);
  const [remoteMsg, setRemoteMsg] = useState<SlotMessage | null>(null);
  const [notHere, setNotHere] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState<string | null>(null);
  const [sources, setSources] = useState<RestoreSource[]>([]);
  const [source, setSource] = useState<RestoreSource | null>(null);
  const [snapshotId, setSnapshotId] = useState<string>('');
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const loc = useLocation('Tessera Library');
  const { setName } = loc;

  const available = !!status?.available;
  useEffect(() => on('backup:changed', () => void client.invalidateQueries({ queryKey: ['backup'] })), [client]);
  useEffect(() => on('restore:progress', setProgress), []);
  useEffect(() => {
    if (step === 'setup' && available) setStep('find');
  }, [step, available]);
  useEffect(() => {
    if (source) setName(source.name);
  }, [source, setName]);
  useEffect(() => {
    if (!open) void call('restore:close').catch(() => undefined);
  }, [open]);

  // Look for backups in the likely places once, when that step comes up.
  const found = useQuery({ queryKey: ['restore-find'], queryFn: () => call('restore:find'), enabled: open && step === 'find', staleTime: 60_000 });
  const places = useQuery({ queryKey: ['restore-places'], queryFn: () => call('restore:places'), enabled: open, staleTime: 60_000 }).data ?? [];

  const pickFolder = async () => {
    const path = await call('dialog:folder', 'Find your backup', { message: 'Choose the folder with your Tessera backup', buttonLabel: 'Choose' });
    if (!path) return;
    const store = await call('restore:storeAt', path);
    if (store) {
      setRepo({ path: store, place: places.find((p) => store.startsWith(p.path))?.label ?? baseName(path), kind: places.find((p) => store.startsWith(p.path))?.kind ?? 'folder' });
      setNotHere(null);
    } else {
      setRepo(null);
      setNotHere(baseName(path));
    }
  };

  const target: StorageTarget | null = remote ? (targetProblem(remote) ? null : remote) : repo ? { provider: 'folder', values: { path: repo.path } } : null;
  const unlock = async () => {
    if (!target) return;
    setBusy(true);
    setWrong(null);
    try {
      const list = await call('restore:unlock', target, password);
      setSources(list);
      setSource(list[0] ?? null);
      setSnapshotId(list[0]?.snapshots[0]?.id ?? '');
      setStep('choose');
    } catch (e) {
      setWrong(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const snapshot = source?.snapshots.find((s) => s.id === snapshotId) ?? null;
  const restore = async () => {
    if (!snapshot || !loc.target || loc.blocked) return;
    setBusy(true);
    setProgress(null);
    setStep('restoring');
    try {
      await call('restore:run', snapshot.id, loc.target, snapshot.size);
      const s = await call('library:open', loc.target);
      if (s.status !== 'ready') throw new Error(s.status === 'error' ? s.message : 'The library didn’t open.');
      if (keep) await call('restore:keepBackingUp').catch((e: unknown) => failed(e, 'Couldn’t carry on backing up'));
      else await call('restore:close');
      notify.success(`“${loc.libraryName}” is back.`);
      onClose();
    } catch (e) {
      failed(e, 'Couldn’t restore the library');
      setStep('where');
    } finally {
      setBusy(false);
    }
  };

  const done = (s: Step) => ({ setup: available, find: !!target, unlock: sources.length > 0, choose: !!snapshot && step !== 'choose' && step !== 'unlock', where: step === 'restoring', restoring: false })[s];
  const order = STEPS.map((s) => s.id);
  const back = order[order.indexOf(step) - 1];

  let body: ReactNode = null;
  let next: ReactNode = null;
  if (step === 'setup') {
    body = (
      <>
        <Heading title="Get Kopia" sub="Tessera’s backups are made with Kopia." />
        <ToolSetup tool="kopia" available={available} bundled={!!status?.bundled} />
      </>
    );
    next = (
      <Button variant="contained" disabled={!available} onClick={() => setStep('find')}>
        Next
      </Button>
    );
  } else if (step === 'find' && remote) {
    body = <StorageForm target={remote} onChange={setRemote} onBack={() => setRemote(null)} message={remoteMsg ?? (targetProblem(remote) ? { tone: 'info', text: targetProblem(remote) } : null)} onMessage={setRemoteMsg} />;
    next = (
      <Button variant="contained" disabled={!target} onClick={() => setStep('unlock')}>
        Next
      </Button>
    );
  } else if (step === 'find') {
    const list = found.data ?? [];
    const shown = repo && !list.some((f) => f.path === repo.path) ? [repo, ...list] : list;
    const slot: SlotMessage | null = notHere
      ? { tone: 'error', text: `No backup in “${notHere}”.` }
      : found.isFetching
        ? { tone: 'info', busy: true, text: `Looking in ${places.map((p) => p.label).slice(0, 4).join(', ') || 'this computer'}…` }
        : !list.length
          ? { tone: 'info', text: 'Nothing found on this computer. Choose a folder, or where else they are.' }
          : null;
    body = (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Heading title="Find the backup" sub="On this computer, a drive, or online." />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shown.map((f) => (
            <Choice key={f.path} icon={PLACE_ICON[f.kind]} title={baseName(f.path)} sub={`${f.place} · ${tidyPath(f.path)}`} selected={repo?.path === f.path} onClick={() => setRepo(f)} />
          ))}
          <Button variant="outlined" startIcon={<FolderOpenRounded />} onClick={() => void pickFolder()} sx={{ alignSelf: 'flex-start', flexShrink: 0 }}>
            Choose the folder…
          </Button>
          <div style={{ marginTop: 12 }}>
            <ProviderGrid
              withFolder={false}
              onPick={(p) => {
                setRepo(null);
                setRemoteMsg(null);
                setRemote(newTarget(p));
              }}
            />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <StatusSlot message={slot} />
        </div>
      </div>
    );
    next = (
      <Button variant="contained" disabled={!target} onClick={() => setStep('unlock')}>
        Next
      </Button>
    );
  } else if (step === 'unlock') {
    body = (
      <>
        <Heading title="Unlock it" sub="The password chosen when backups were set up." />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow'), marginBottom: 20 }}>
          <LockOutlined sx={{ color: md('onSurfaceVariant') }} />
          <Typography variant="bodyMedium" noWrap sx={{ color: md('onSurface') }}>
            {remote ? describeTarget(remote) : repo ? `${repo.place} · ${tidyPath(repo.path)}` : ''}
          </Typography>
        </div>
        <TextField
          autoFocus
          fullWidth
          type="password"
          label="Backup password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setWrong(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && password && void unlock()}
          error={!!wrong}
          helperText={wrong ?? ' '}
        />
      </>
    );
    next = (
      <Button variant="contained" disabled={!password || busy} onClick={() => void unlock()} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LockOutlined />}>
        Unlock
      </Button>
    );
  } else if (step === 'choose') {
    body = (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Heading title="Choose what to restore" sub="A library, and the moment to go back to." />
        <SectionLabel n={1}>Library</SectionLabel>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sources.map((s) => (
            <Choice
              key={s.key}
              icon={<AutoStoriesOutlined />}
              title={s.name}
              sub={`From ${s.host || 'a computer'} · last backed up ${when(s.snapshots[0]!.startTime)}`}
              selected={source?.key === s.key}
              onClick={() => {
                setSource(s);
                setSnapshotId(s.snapshots[0]!.id);
              }}
            />
          ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <SectionLabel n={2}>Back to</SectionLabel>
          <TextField select fullWidth value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)} disabled={!source} helperText={remote && providerInfo(remote.provider).group === 'storage' ? 'Restoring downloads everything; the storage service may charge for that.' : ' '}>
            {source?.snapshots.map((s, i) => (
              <MenuItem key={s.id} value={s.id}>
                {when(s.startTime)}
                {i === 0 ? ' · latest' : ''} · {s.files.toLocaleString()} file{s.files === 1 ? '' : 's'} · {formatBytes(s.size)}
              </MenuItem>
            ))}
          </TextField>
        </div>
      </div>
    );
    next = (
      <Button variant="contained" disabled={!snapshot} onClick={() => setStep('where')}>
        Next
      </Button>
    );
  } else if (step === 'where') {
    body = (
      <>
        <LocationFields loc={loc} pickerTitle="Choose where the library goes" slot={false} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 4px', marginTop: 12, cursor: 'pointer' }}>
          <div style={{ flex: 1 }}>
            <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
              Keep backing up here
            </Typography>
            <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }}>
              New backups go to the same place, with the same password.
            </Typography>
          </div>
          <Switch checked={keep} onChange={(_, v) => setKeep(v)} slotProps={{ input: { 'aria-label': 'Keep backing up here' } }} />
        </label>
        <div style={{ marginTop: 12 }}>
          <StatusSlot message={loc.message} />
        </div>
      </>
    );
    next = (
      <Button variant="contained" disabled={busy || loc.blocked} onClick={() => void restore()} startIcon={<RestoreRounded />}>
        Restore
      </Button>
    );
  } else {
    body = (
      <>
        <Heading title="Restoring" sub="The library opens when it’s done." />
        <div style={{ padding: 20, borderRadius: SHAPE.xl, background: md('surfaceContainerLow'), display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
            {loc.libraryName}
          </Typography>
          <LinearProgress variant={progress === null ? 'indeterminate' : 'determinate'} {...(progress === null ? {} : { value: progress * 100 })} sx={{ height: 8, borderRadius: 4 }} />
          <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), height: 18 }}>
            {snapshot && progress !== null ? `${formatBytes(progress * snapshot.size)} of ${formatBytes(snapshot.size)}` : 'Getting ready…'}
          </Typography>
        </div>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth={false}
      slotProps={{ paper: { sx: { width: DIALOG_WIDTH, height: DIALOG_HEIGHT, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 48px)', borderRadius: `${SHAPE.xl}px`, overflow: 'hidden', backgroundImage: 'none', p: 0 } } }}
    >
      <SetupFrame
        side={
          <Side icon={RestoreRounded} title="Restore from a backup" lead="Start again on this computer from a backup.">
            <Rail step={step} done={done} />
          </Side>
        }
        onClose={onClose}
        footer={
          <>
            {back && step !== 'restoring' && <Button onClick={() => (step === 'find' && remote ? setRemote(null) : setStep(back))}>Back</Button>}
            <span style={{ flex: 1 }} />
            <Button onClick={onClose} disabled={busy && step === 'restoring'}>
              Cancel
            </Button>
            {next}
          </>
        }
      >
        {body}
      </SetupFrame>
    </Dialog>
  );
}
