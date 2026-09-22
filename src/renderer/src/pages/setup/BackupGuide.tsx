import BackupRounded from '@mui/icons-material/BackupRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import KeyRounded from '@mui/icons-material/KeyRounded';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { describeTarget, providerInfo, targetProblem, type Provider, type StorageTarget } from '@shared/storage';
import type { BackupStatus } from '@shared/types';
import { call, on } from '../../api';
import { SegmentedButton } from '../../components/SegmentedButton';
import { StatusSlot, type SlotMessage } from '../../components/StatusSlot';
import { useSettings, useUpdateSettings } from '../../state/queries';
import { md, mdAlpha, SHAPE } from '../../theme';
import { DIALOG_HEIGHT, DIALOG_WIDTH, SetupFrame, Side } from '../library/LibraryDialog';
import { Choice } from './RestoreGuide';
import { newTarget, ProviderGrid, StorageForm } from './Storage';
import { ToolSetup } from './ToolSetup';

type Step = 'kopia' | 'where' | 'password' | 'done';

const STEPS: { id: Step; title: string }[] = [
  { id: 'kopia', title: 'Get Kopia' },
  { id: 'where', title: 'Where to keep them' },
  { id: 'password', title: 'Password' },
  { id: 'done', title: 'Keep it safe' },
];

const STORE_NAME: Record<string, string> = { darwin: 'Keychain Access', win32: 'Credential Manager', linux: 'your keyring' };

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

/** One way to keep the password safe, ticked once done. */
function SafeCard({ icon, title, sub, done, onClick, children }: { icon: ReactNode; title: string; sub: string; done: boolean; onClick: () => void; children?: ReactNode }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{ height: 76, justifyContent: 'flex-start', gap: 1.75, px: 1.75, borderRadius: `${SHAPE.lg}px`, textAlign: 'left', border: `1px solid ${done ? md('primary') : md('outlineVariant')}`, backgroundColor: done ? md('primaryContainer') : md('surfaceContainerLow') }}
    >
      <span style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', flexShrink: 0, background: done ? md('primary') : md('secondaryContainer'), color: done ? md('onPrimary') : md('onSecondaryContainer') }}>{done ? <CheckRounded /> : icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleSmall" component="div" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        <Typography variant="bodySmall" component="div" noWrap sx={{ color: md('onSurfaceVariant') }}>
          {sub}
        </Typography>
      </span>
      {children}
    </ButtonBase>
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
  /** Another library whose place and password to use instead. */
  const [joined, setJoined] = useState<BackupStatus['others'][number] | null>(null);
  const [whereMsg, setWhereMsg] = useState<SlotMessage | null>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const [kept, setKept] = useState<{ kit?: string; keychain?: boolean; copied?: boolean; confirmed?: boolean }>({});
  const [includeKeys, setIncludeKeys] = useState(true);
  const [safeMsg, setSafeMsg] = useState<SlotMessage | null>(null);
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const available = !!status?.available;

  useEffect(() => on('backup:changed', () => void client.invalidateQueries({ queryKey: ['backup'] })), [client]);
  useEffect(() => {
    if (step === 'kopia' && available) setStep('where');
  }, [step, available]);
  useEffect(() => {
    if (open) {
      // Start over each time: the guide stays mounted between uses (see BackupSettings).
      setStep('kopia');
      setMode('new');
      setTarget(null);
      setJoined(null);
      setPassword('');
      setAgain('');
      setError(null);
      setWhereMsg(null);
      setShown(false);
      setKept({});
      setSafeMsg(null);
    }
  }, [open]);
  // A folder that already holds backups is almost certainly meant to be used again.
  const folderStore = useQuery({ queryKey: ['store-at', target?.values.path], queryFn: () => call('restore:storeAt', target!.values.path!), enabled: target?.provider === 'folder' && !!target.values.path, staleTime: 0 }).data;
  useEffect(() => {
    if (target?.provider === 'folder') setMode(folderStore ? 'existing' : 'new');
  }, [folderStore, target?.provider]);

  const pick = (p: Provider) => {
    setJoined(null);
    setTarget(newTarget(p));
    setWhereMsg(null);
  };
  const problem = target ? targetProblem(target) : 'Choose a place.';
  const noKeychain = status ? !status.keychain : false;
  const pwProblem = password.length < 8 ? 'At least 8 characters.' : mode === 'new' && again !== password ? 'The two don’t match.' : noKeychain && !settings?.backupPasswordInFile ? 'Choose how to keep the password.' : null;
  const generate = async () => {
    const pw = await call('backup:generatePassword');
    setPassword(pw);
    setAgain(pw);
    setShown(true);
  };
  const keepSafe = async (what: 'kit' | 'keychain' | 'copy') => {
    // After joining another library's backups, the password is the one Tessera keeps for them.
    const pw = password || undefined;
    try {
      if (what === 'kit') {
        const path = await call('backup:saveKit', { ...(pw ? { password: pw } : {}), ...(target ? { target } : {}), includeKeys });
        if (path) {
          setKept((k) => ({ ...k, kit: path }));
          setSafeMsg({ tone: 'success', text: `Saved to ${path}. Print it, or keep it off this computer.` });
        }
      } else if (what === 'keychain') {
        await call('backup:saveToKeychain', pw);
        setKept((k) => ({ ...k, keychain: true }));
        setSafeMsg({ tone: 'success', text: `Saved in ${STORE_NAME[window.tessera.platform]} as “Tessera backup password”.` });
      } else {
        await navigator.clipboard.writeText(pw ?? (await call('backup:revealPassword')));
        setKept((k) => ({ ...k, copied: true }));
        setSafeMsg({ tone: 'success', text: 'Copied. Paste it into your password manager.' });
      }
    } catch (e) {
      setSafeMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  };

  const others = status?.others ?? [];
  const join = async () => {
    if (!joined) return;
    setBusy(true);
    setWhereMsg(null);
    try {
      await call('backup:join', joined.libraryId);
      setStep('done');
    } catch (e) {
      setWhereMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

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

  const done = (s: Step) => ({ kopia: available, where: (!!target && !problem) || !!joined, password: step === 'done', done: step === 'done' })[s];
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
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Heading title="Where to keep them" sub="Somewhere other than this computer, so one failure can’t take both." />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {others.length > 0 && (
            <div>
              <Typography variant="labelLarge" component="div" sx={{ color: md('onSurfaceVariant'), mb: 1 }}>
                Where your other libraries go
              </Typography>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {others.map((o) => (
                  <Choice
                    key={o.libraryId}
                    icon={<AutoStoriesOutlined />}
                    title={`Same place as “${o.libraryName}”`}
                    sub={`${o.repo} · same password`}
                    selected={joined?.libraryId === o.libraryId}
                    onClick={() => {
                      setWhereMsg(null);
                      setJoined(joined?.libraryId === o.libraryId ? null : o);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <ProviderGrid onPick={pick} />
        </div>
        {others.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <StatusSlot message={whereMsg ?? (busy ? { tone: 'info', busy: true, text: 'Connecting…' } : null)} />
          </div>
        )}
      </div>
    );
    next = joined ? (
      <Button variant="contained" disabled={busy} onClick={() => void join()} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <BackupRounded />}>
        Turn on backups
      </Button>
    ) : (
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
          <TextField
            type={shown ? 'text' : 'password'}
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText="At least 8 characters. Without it, backups can’t be read."
            autoComplete="new-password"
            slotProps={{
              input: {
                sx: { fontFamily: shown ? 'ui-monospace, Menlo, Consolas, monospace' : undefined },
                endAdornment: (
                  <InputAdornment position="end">
                    {mode === 'new' && (
                      <Button size="small" startIcon={<AutoAwesomeRounded />} onClick={() => void generate()}>
                        Make one
                      </Button>
                    )}
                    <IconButton aria-label={shown ? 'Hide password' : 'Show password'} onClick={() => setShown(!shown)}>
                      {shown ? <VisibilityOffRounded /> : <VisibilityRounded />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            type={shown ? 'text' : 'password'}
            label="Password again"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            error={!!again && again !== password}
            helperText={again && again !== password ? 'The two don’t match.' : ' '}
            disabled={mode !== 'new'}
            sx={{ visibility: mode === 'new' ? 'visible' : 'hidden' }}
            autoComplete="new-password"
          />
          {noKeychain && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
                  Keep the password in a file only you can read
                </Typography>
                <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
                  This computer has no keychain. Automatic backups need the password kept somewhere, like SSH keys are.
                </Typography>
              </div>
              <Switch checked={!!settings?.backupPasswordInFile} onChange={(_, v) => update.mutate({ backupPasswordInFile: v })} slotProps={{ input: { 'aria-label': 'Keep the password in a file' } }} />
            </label>
          )}
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
    const secretFields = target ? providerInfo(target.provider).fields.some((f) => f.secret && target.values[f.key]) : false;
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <CheckCircleRounded sx={{ color: md('primary'), fontSize: 28 }} />
          <div>
            <Typography variant="titleLarge" sx={{ color: md('onSurface') }}>
              Backups are on
            </Typography>
            <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
              {joined ? `The first is running. Same password as “${joined.libraryName}”: its recovery kit opens these backups too.` : 'The first is running. Now keep the password where you’ll find it, away from this computer.'}
            </Typography>
          </div>
        </div>
        <SafeCard icon={<PictureAsPdfOutlined />} title="Save a recovery kit" sub="A page with the password and where the backups are. Print it, or keep it in a safe place." done={!!kept.kit} onClick={() => void keepSafe('kit')}>
          {secretFields && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: md('onSurfaceVariant'), cursor: 'pointer' }} onClick={(e) => e.stopPropagation()}>
              <Checkbox size="small" checked={includeKeys} onChange={(_, v) => setIncludeKeys(v)} sx={{ p: 0.5 }} />
              With the storage keys
            </label>
          )}
        </SafeCard>
        <SafeCard icon={<KeyRounded />} title={`Save in ${STORE_NAME[window.tessera.platform]}`} sub="A copy in this computer’s password store, apart from Tessera." done={!!kept.keychain} onClick={() => void keepSafe('keychain')} />
        <SafeCard icon={<ContentCopyRounded />} title="Copy for a password manager" sub="1Password, Bitwarden, your browser’s: paste it there." done={!!kept.copied} onClick={() => void keepSafe('copy')} />
        <StatusSlot message={safeMsg} />
      </div>
    );
    next = (
      <Button variant="contained" disabled={!joined && !kept.kit && !kept.keychain && !kept.copied} onClick={onClose}>
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
            {step === 'done' && !joined && !kept.kit && !kept.keychain && !kept.copied && <Button onClick={onClose}>Later</Button>}
            {next}
          </>
        }
      >
        {body}
      </SetupFrame>
    </Dialog>
  );
}
