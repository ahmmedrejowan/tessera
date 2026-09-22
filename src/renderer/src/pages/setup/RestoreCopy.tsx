import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import RestoreRounded from '@mui/icons-material/RestoreRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { baseName } from '@shared/folders';
import { call, on } from '../../api';
import { formatBytes } from '../../components/labels';
import { StatusSlot } from '../../components/StatusSlot';
import { failed } from '../../notices/store';
import { useLibraryState } from '../../state/library';
import { md, SHAPE } from '../../theme';
import { DIALOG_HEIGHT, DIALOG_WIDTH, SetupFrame, Side } from '../library/LibraryDialog';
import { LocationFields, tidyPath, useLocation } from '../library/Location';
import { Heading, StepRail } from './BackupGuide';
import { Choice } from './RestoreGuide';

type Step = 'choose' | 'where' | 'restoring' | 'done';

const STEPS: { id: Step; title: string }[] = [
  { id: 'choose', title: 'Choose a backup' },
  { id: 'where', title: 'Where the copy goes' },
  { id: 'restoring', title: 'Restore' },
  { id: 'done', title: 'Open it' },
];

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const day = (iso: string) => new Date(iso).toLocaleDateString([], { dateStyle: 'medium' });
const parentOf = (path: string) => path.slice(0, path.length - baseName(path).length).replace(/(.)[\\/]+$/, '$1');

/**
 * Bring back the open library as it was at an earlier backup. The copy goes into a new folder
 * beside the library under a name of its own, so nothing in the library changes; it can be opened
 * straight away to take files from, or to carry on with instead.
 */
export function RestoreCopy({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lib = useLibraryState().data;
  const library = lib?.status === 'ready' ? lib.library : null;
  const snapshots = useQuery({ queryKey: ['snapshots', library?.id], queryFn: () => call('backup:snapshots'), enabled: open && !!library, staleTime: 0 });
  const [step, setStep] = useState<Step>('choose');
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const loc = useLocation(library?.name ?? 'Tessera Library', library ? parentOf(library.path) : null);
  const { setName } = loc;

  // Newest first.
  const list = [...(snapshots.data ?? [])].sort((a, b) => b.startTime.localeCompare(a.startTime));
  const snapshot = list.find((s) => s.id === chosen) ?? null;

  useEffect(() => on('restore:progress', setProgress), []);
  useEffect(() => {
    if (open) {
      setStep('choose');
      setChosen('');
    }
  }, [open]);
  useEffect(() => {
    if (list[0] && !list.some((s) => s.id === chosen)) setChosen(list[0].id);
  }, [chosen, list]);
  useEffect(() => {
    if (snapshot && library) setName(`${library.name} from ${day(snapshot.startTime)}`);
  }, [snapshot, library, setName]);

  const restore = async () => {
    if (!snapshot || !loc.target || loc.blocked) return;
    setBusy(true);
    setProgress(null);
    setStep('restoring');
    try {
      await call('backup:restore', snapshot.id, loc.target, snapshot.size, loc.libraryName);
      setStep('done');
    } catch (e) {
      failed(e, 'Couldn’t restore the copy');
      setStep('where');
    } finally {
      setBusy(false);
    }
  };
  const openCopy = async () => {
    if (!loc.target) return;
    try {
      const s = await call('library:open', loc.target);
      if (s.status === 'error') throw new Error(s.message);
      onClose();
    } catch (e) {
      failed(e, 'Couldn’t open the copy');
    }
  };

  const order = STEPS.map((s) => s.id);
  const done = (s: Step) => order.indexOf(s) < order.indexOf(step) || step === 'done';

  let body: ReactNode;
  let next: ReactNode = null;
  if (step === 'choose') {
    body = (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Heading title="Choose a backup" sub={`The moment to bring “${library?.name ?? 'the library'}” back to.`} />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((s, i) => (
            <Choice
              key={s.id}
              icon={<HistoryRounded />}
              title={`${when(s.startTime)}${i === 0 ? ' · latest' : ''}`}
              sub={`${s.files.toLocaleString()} file${s.files === 1 ? '' : 's'} · ${formatBytes(s.size)}`}
              selected={s.id === chosen}
              onClick={() => setChosen(s.id)}
            />
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <StatusSlot
            message={
              snapshots.isFetching && !list.length
                ? { tone: 'info', busy: true, text: 'Reading the backups…' }
                : snapshots.error
                  ? { tone: 'error', text: (snapshots.error as Error).message }
                  : snapshots.data && !list.length
                    ? { tone: 'info', text: 'No backups yet. The first one is made a few minutes after backups are set up.' }
                    : null
            }
          />
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
        <LocationFields loc={loc} pickerTitle="Choose where the copy goes" slot={false} />
        <Typography variant="bodySmall" component="div" noWrap sx={{ color: md('onSurfaceVariant'), mt: 1.5, height: 20 }}>
          A copy of its own: “{library?.name}” stays as it is.
        </Typography>
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
    const finished = step === 'done';
    body = (
      <>
        <Heading title={finished ? 'The copy is ready' : 'Restoring'} sub={finished ? 'Open it now, or later with Open a library.' : 'This can take a while for a big library.'} />
        <div style={{ padding: 20, borderRadius: SHAPE.xl, background: md('surfaceContainerLow'), display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {finished && <TaskAltRounded sx={{ color: md('primary') }} />}
            <Typography variant="titleMedium" noWrap sx={{ color: md('onSurface'), flex: 1, minWidth: 0 }}>
              {loc.libraryName}
            </Typography>
          </div>
          <LinearProgress variant={finished ? 'determinate' : progress === null ? 'indeterminate' : 'determinate'} value={finished ? 100 : (progress ?? 0) * 100} sx={{ height: 8, borderRadius: 4 }} />
          <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant'), height: 18 }}>
            {finished ? tidyPath(loc.target ?? '') : snapshot && progress !== null ? `${formatBytes(progress * snapshot.size)} of ${formatBytes(snapshot.size)}` : 'Getting ready…'}
          </Typography>
        </div>
        <div style={{ marginTop: 16, visibility: finished ? 'visible' : 'hidden' }}>
          <Button startIcon={<FolderOpenRounded />} onClick={() => loc.target && void call('fs:reveal', loc.target)}>
            Show in folder
          </Button>
        </div>
      </>
    );
    if (finished) {
      next = (
        <Button variant="contained" onClick={() => void openCopy()}>
          Open the copy
        </Button>
      );
    }
  }

  const back = step === 'where' ? 'choose' : null;
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth={false}
      slotProps={{ paper: { sx: { width: DIALOG_WIDTH, height: DIALOG_HEIGHT, maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 48px)', borderRadius: `${SHAPE.xl}px`, overflow: 'hidden', backgroundImage: 'none', p: 0 } } }}
    >
      <SetupFrame
        side={
          <Side icon={HistoryRounded} title="Go back in time" lead="Restore the library as it was, into a copy beside it.">
            <StepRail steps={STEPS} step={step} done={done} />
          </Side>
        }
        onClose={busy ? () => undefined : onClose}
        footer={
          <>
            {back && <Button onClick={() => setStep(back)}>Back</Button>}
            <span style={{ flex: 1 }} />
            <Button onClick={onClose} disabled={busy}>
              {step === 'done' ? 'Done' : 'Cancel'}
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
