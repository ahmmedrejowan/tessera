import BackupRounded from '@mui/icons-material/BackupRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { describeTarget, targetProblem, type Provider, type StorageTarget } from '@shared/storage';
import { call, on } from '../../api';
import { SegmentedButton } from '../../components/SegmentedButton';
import { StatusSlot, type SlotMessage } from '../../components/StatusSlot';
import { md, mdAlpha, SHAPE } from '../../theme';
import { DIALOG_HEIGHT, DIALOG_WIDTH, SetupFrame, Side } from '../library/LibraryDialog';
import { newTarget, ProviderGrid, StorageForm } from './Storage';
import { ToolSetup } from './ToolSetup';

type Step = 'kopia' | 'where' | 'password' | 'done';

const STEPS: { id: Step; title: string }[] = [
  { id: 'kopia', title: 'Get Kopia' },
  { id: 'where', title: 'Where to keep them' },
  { id: 'password', title: 'Password' },
  { id: 'done', title: 'Done' },
];

export function StepRail<S extends string>({ steps, step, done }: { steps: { id: S; title: string }[]; step: S; done: (s: S) => boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {steps.map((s, i) => {
        const current = s.id === step;
        const finished = done(s.id) && !current;
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', height: 44 }}>
            {i < steps.length - 1 && <span style={{ position: 'absolute', left: 13, top: 36, height: 16, width: 2, background: finished ? md('primary') : mdAlpha('onSecondaryContainer', 0.2) }} />}
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

export function Heading({ title, sub }: { title: string; sub: string }) {
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

/**
 * Setting up backups: Kopia, where to keep them (a folder, a cloud drive, cloud storage or a
 * server), and the password that encrypts them. One fixed-size dialog for all of it.
 */
export function BackupGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const status = useQuery({ queryKey: ['backup'], queryFn: () => call('backup:status'), enabled: open, staleTime: 0 }).data;
  const [step, setStep] = useState<Step>('kopia');
  const [target, setTarget] = useState<StorageTarget | null>(null);
  const [whereMsg, setWhereMsg] = useState<SlotMessage | null>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const available = !!status?.available;

  useEffect(() => on('backup:changed', () => void client.invalidateQueries({ queryKey: ['backup'] })), [client]);
  useEffect(() => {
    if (step === 'kopia' && available) setStep('where');
  }, [step, available]);
  useEffect(() => {
    if (open) {
      setTarget(null);
      setPassword('');
      setAgain('');
      setError(null);
      setWhereMsg(null);
    }
  }, [open]);
  // A folder that already holds backups is almost certainly meant to be used again.
  const folderStore = useQuery({ queryKey: ['store-at', target?.values.path], queryFn: () => call('restore:storeAt', target!.values.path!), enabled: target?.provider === 'folder' && !!target.values.path, staleTime: 0 }).data;
  useEffect(() => {
    if (target?.provider === 'folder') setMode(folderStore ? 'existing' : 'new');
  }, [folderStore, target?.provider]);

  const pick = (p: Provider) => {
    setTarget(newTarget(p));
    setWhereMsg(null);
  };
  const problem = target ? targetProblem(target) : 'Choose a place.';
  const pwProblem = password.length < 8 ? 'At least 8 characters.' : mode === 'new' && again !== password ? 'The two don’t match.' : null;

  const turnOn = async () => {
    if (!target || pwProblem) return;
    setBusy(true);
    setError(null);
    try {
      await call('backup:setup', target, password, mode === 'new');
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const done = (s: Step) => ({ kopia: available, where: !!target && !problem, password: step === 'done', done: step === 'done' })[s];
  const order = STEPS.map((s) => s.id);
  const back = order[order.indexOf(step) - 1];

  let body: ReactNode = null;
  let next: ReactNode = null;
  if (step === 'kopia') {
    body = (
      <>
        <Heading title="Get Kopia" sub="Backups are made with Kopia: encrypted, and only what changed is stored." />
        <ToolSetup tool="kopia" available={available} bundled={!!status?.bundled} />
      </>
    );
    next = (
      <Button variant="contained" disabled={!available} onClick={() => setStep('where')}>
        Next
      </Button>
    );
  } else if (step === 'where') {
    body = target ? (
      <StorageForm target={target} onChange={setTarget} onBack={() => setTarget(null)} suggest="backups" message={whereMsg ?? (problem && target.provider !== 'folder' ? { tone: 'info', text: problem } : null)} onMessage={setWhereMsg} />
    ) : (
      <>
        <Heading title="Where to keep them" sub="Somewhere other than this computer, so one failure can’t take both." />
        <ProviderGrid onPick={pick} />
      </>
    );
    next = (
      <Button variant="contained" disabled={!!problem} onClick={() => setStep('password')}>
        Next
      </Button>
    );
  } else if (step === 'password') {
    body = (
      <>
        <Heading title="Password" sub={target ? describeTarget(target) : ''} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SegmentedButton
            label="Backups"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
            options={[
              { value: 'new', label: 'Start new backups' },
              { value: 'existing', label: 'Use existing backups' },
            ]}
          />
          <TextField type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} helperText="At least 8 characters. Without it, backups can’t be read." autoComplete="new-password" />
          <TextField
            type="password"
            label="Password again"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            error={!!again && again !== password}
            helperText={again && again !== password ? 'The two don’t match.' : ' '}
            disabled={mode !== 'new'}
            sx={{ visibility: mode === 'new' ? 'visible' : 'hidden' }}
            autoComplete="new-password"
          />
          <StatusSlot message={error ? { tone: 'error', text: error } : busy ? { tone: 'info', busy: true, text: 'Connecting…' } : null} />
        </div>
      </>
    );
    next = (
      <Button variant="contained" disabled={!!pwProblem || busy} onClick={() => void turnOn()} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <BackupRounded />}>
        Turn on backups
      </Button>
    );
  } else {
    body = (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 12 }}>
        <span style={{ width: 72, height: 72, borderRadius: 24, display: 'grid', placeItems: 'center', background: md('primaryContainer'), color: md('onPrimaryContainer') }}>
          <CheckCircleRounded sx={{ fontSize: 36 }} />
        </span>
        <Typography variant="headlineSmall" sx={{ color: md('onSurface') }}>
          Backups are on
        </Typography>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), maxWidth: 380 }}>
          The first one is running now. Keep the password somewhere safe: it’s the only way to restore.
        </Typography>
        <div style={{ padding: '8px 14px', borderRadius: SHAPE.md, background: md('surfaceContainerHigh'), marginTop: 8 }}>
          <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
            {target ? describeTarget(target) : ''}
          </Typography>
        </div>
      </div>
    );
    next = (
      <Button variant="contained" onClick={onClose}>
        Done
      </Button>
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
          <Side icon={BackupRounded} title="Set up backups" lead="Encrypted copies of the library, somewhere safe.">
            <StepRail steps={STEPS} step={step} done={done} />
          </Side>
        }
        onClose={onClose}
        footer={
          <>
            {back && step !== 'done' && !(step === 'where' && !target && back === 'kopia' && available) && <Button onClick={() => (step === 'where' && target ? setTarget(null) : setStep(back))}>Back</Button>}
            <span style={{ flex: 1 }} />
            {step !== 'done' && <Button onClick={onClose}>Cancel</Button>}
            {next}
          </>
        }
      >
        {body}
      </SetupFrame>
    </Dialog>
  );
}
