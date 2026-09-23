import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { call, on } from '../api';
import { ask } from '../notices/dialogs';
import { notify } from '../notices/store';
import { md, SHAPE } from '../theme';
import { ReportProblemDialog, useReportProblem } from './ReportProblem';

/** A fold-out showing exactly what would be sent. */
function WhatsSent() {
  const [open, setOpen] = useState(false);
  const preview = useQuery({ queryKey: ['report-preview'], queryFn: () => call('reports:preview'), enabled: open, staleTime: 0 });
  return (
    <div style={{ alignSelf: 'stretch', textAlign: 'left' }}>
      <Button size="small" onClick={() => setOpen(!open)} endIcon={<ExpandMoreRounded sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />} sx={{ ml: -1, color: md('onSurfaceVariant') }}>
        See what’s sent
      </Button>
      <Collapse in={open}>
        <pre style={{ margin: '4px 0 0', padding: '12px 14px', maxHeight: 220, overflow: 'auto', borderRadius: SHAPE.md, background: md('surfaceContainerHighest'), color: md('onSurface'), font: '11px/1.5 ui-monospace, Menlo, Consolas, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'text' }}>
          {preview.data ?? 'Loading…'}
        </pre>
      </Collapse>
    </div>
  );
}

const CONSENT_BODY =
  'Tessera ran into a problem it didn’t expect. A report helps get it fixed: what went wrong, where in Tessera’s code, and your Tessera and system versions. Names of files, packs and folders are taken out, and nothing says who you are.';

async function askToSend(): Promise<void> {
  const answer = await ask({
    tone: 'question',
    icon: BugReportOutlined,
    title: 'Send an error report?',
    body: CONSENT_BODY,
    extra: <WhatsSent />,
    record: false,
    actions: [
      { label: 'Don’t send', value: 'never' as const, kind: 'text' },
      { label: 'Send this time', value: 'once' as const },
      { label: 'Always send', value: 'always' as const, kind: 'primary' },
    ],
  });
  await call('reports:respond', answer ?? 'not-now');
  if (answer === 'never') notify.info('Error reports won’t be sent.', { body: 'You can change this in Settings › Privacy.' });
  if (answer === 'once' || answer === 'always') notify.success('Thanks, the report was sent.');
}

async function askAboutCrashes(count: number): Promise<void> {
  const send = await ask({
    tone: 'warning',
    icon: BugReportOutlined,
    title: 'Tessera closed unexpectedly',
    body: `${count > 1 ? `There are ${count} crash reports` : 'There’s a crash report'} from an earlier session. Sending it helps find the cause. A crash report holds a snapshot of Tessera’s memory at that moment, so it can include names of files Tessera was working on.`,
    record: false,
    actions: [
      { label: 'Don’t send', value: false },
      { label: 'Send', value: true, kind: 'primary' },
    ],
  });
  await call('reports:crashes', !!send);
}

async function checkPending(): Promise<void> {
  const [pending, status] = await Promise.all([call('reports:pending'), call('reports:status')]);
  if (pending.recovered) {
    void ask({ tone: 'warning', icon: RestartAltRounded, title: 'The window was reopened', body: 'Tessera’s window stopped unexpectedly and has been loaded again. Your library is fine.', actions: [{ label: 'OK', value: true, kind: 'primary' }] });
  }
  if (status.crashes) await askAboutCrashes(status.crashes);
  if (pending.ask) await askToSend();
}

let checked = false;

/**
 * Everything to do with error reports that the window shows: the question about sending them,
 * crashes from earlier sessions, problems in the background, and "Report a problem".
 */
export function ReportsHost() {
  useEffect(() => {
    // Once per page load: what the main process has waiting is handed over only once.
    if (!checked) {
      checked = true;
      void checkPending().catch(() => undefined);
    }
    const offs = [
      on('reports:ask', () => void askToSend()),
      on('reports:caught', ({ title, details }) => notify.error(title, { body: 'Tessera carried on. The details are in the log.', details })),
      on('menu:command', (command) => command === 'reportProblem' && useReportProblem.getState().show()),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  return <ReportProblemDialog />;
}
