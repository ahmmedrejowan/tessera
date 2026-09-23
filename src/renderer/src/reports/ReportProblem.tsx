import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { call } from '../api';
import { failed, notify } from '../notices/store';
import { md, SHAPE } from '../theme';

export const useReportProblem = create<{ open: boolean; show(): void; hide(): void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

/** Tell the developers about a problem: in your words, with this session's errors and the recent log, cleaned. */
export function ReportProblemDialog() {
  const { open, hide } = useReportProblem();
  const [note, setNote] = useState('');
  const [debounced, setDebounced] = useState('');
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ['reports-status'], queryFn: () => call('reports:status'), enabled: open, staleTime: 0 }).data;
  const report = useQuery({ queryKey: ['problem-report', debounced], queryFn: () => call('reports:problem', debounced), enabled: open, staleTime: 0, placeholderData: (prev) => prev });
  useEffect(() => {
    const t = setTimeout(() => setDebounced(note), 400);
    return () => clearTimeout(t);
  }, [note]);
  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };
  const copy = () => act(async () => {
    await navigator.clipboard.writeText(await call('reports:problem', note));
    notify.success('Report copied.');
  });
  const save = () => act(async () => {
    const path = await call('reports:saveProblem', note);
    if (path) {
      notify.success('Report saved.');
      hide();
    }
  });
  const send = () => act(async () => {
    await call('reports:sendProblem', note);
    notify.success('Thanks, the report was sent.');
    hide();
  });

  return (
    <Dialog open={open} onClose={hide} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: `${SHAPE.xl}px` } } }}>
      <DialogTitle>Report a problem</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TextField autoFocus multiline minRows={3} label="What happened?" placeholder="What you were doing, and what went wrong" value={note} onChange={(e) => setNote(e.target.value)} sx={{ mt: 1 }} />
        <div>
          <Typography variant="labelLarge" component="div" sx={{ color: md('onSurface'), mb: 0.5 }}>
            The report
          </Typography>
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mb: 1 }}>
            Your words, errors from this session and the recent log. Names of files, packs and folders are taken out. This is all of it:
          </Typography>
          <pre style={{ margin: 0, padding: '12px 14px', height: 220, overflow: 'auto', borderRadius: SHAPE.md, background: md('surfaceContainerHighest'), color: md('onSurface'), font: '11px/1.5 ui-monospace, Menlo, Consolas, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'text' }}>
            {report.data ?? 'Putting it together…'}
          </pre>
        </div>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={hide} sx={{ mr: 'auto' }}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={() => void copy()}>
          Copy
        </Button>
        <Button disabled={busy} variant={status?.available ? 'text' : 'contained'} onClick={() => void save()}>
          Save…
        </Button>
        {status?.available && (
          <Button disabled={busy} variant="contained" onClick={() => void send()}>
            Send
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
