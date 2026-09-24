import DeleteSweepOutlined from '@mui/icons-material/DeleteSweepOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { McpCall } from '@shared/mcp';
import { call } from '../../api';
import { EmptyState } from '../../components/EmptyState';
import { ask } from '../../notices/dialogs';
import { failed } from '../../notices/store';
import { useMcpCalls } from '../../state/mcp';
import { useNav } from '../../state/nav';
import { md, SHAPE } from '../../theme';
import { Page } from '../Placeholder';
import { CallRow } from './AgentHistory';

const PAGE = 50;

/** The day a call belongs to, as a heading: today, yesterday, then the date. */
function day(iso: string): string {
  const then = new Date(iso);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((midnight.getTime() - new Date(then).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return then.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Calls in the order they came, split into the days they happened on. */
function byDay(rows: McpCall[]): { title: string; rows: McpCall[] }[] {
  const out: { title: string; rows: McpCall[] }[] = [];
  for (const row of rows) {
    const title = day(row.at);
    const last = out[out.length - 1];
    if (last?.title === title) last.rows.push(row);
    else out.push({ title, rows: [row] });
  }
  return out;
}

/** Everything agents have asked this library to do, newest first, a day at a time. */
export function AgentCallsPage() {
  const [shown, setShown] = useState(PAGE);
  const { rows, total } = useMcpCalls(shown);
  const go = useNav((s) => s.go);
  const days = byDay(rows);

  const clear = async () => {
    const yes = await ask<boolean>({
      tone: 'warning',
      title: 'Forget the call history?',
      body: 'The record of what agents have done goes. Nothing in the library changes.',
      actions: [
        { label: 'Keep it', value: false, kind: 'text' },
        { label: 'Forget it', value: true, kind: 'danger' },
      ],
    });
    if (!yes) return;
    try {
      await call('mcp:clearCalls');
      setShown(PAGE);
    } catch (e) {
      failed(e);
    }
  };

  return (
    <Page
      title="Agent calls"
      subtitle={total ? `${total} call${total === 1 ? '' : 's'} answered, newest first` : 'What agents have asked this library to do'}
      width={900}
      actions={
        <>
          <Button startIcon={<TuneOutlined />} onClick={() => go({ to: 'agentTools' })}>
            Tools
          </Button>
          <Button color="error" startIcon={<DeleteSweepOutlined />} disabled={!total} onClick={() => void clear()}>
            Forget
          </Button>
        </>
      }
    >
      {total ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 4 }}>
          {days.map((d) => (
            <section key={d.title} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Typography variant="titleSmall" component="h2" sx={{ color: md('onSurfaceVariant') }}>
                {d.title}
              </Typography>
              <div style={{ padding: '4px 16px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
                {d.rows.map((c, i) => (
                  <div key={`${c.at}-${i}`} style={{ borderTop: i ? `1px solid ${md('outlineVariant')}` : 'none' }}>
                    <CallRow call={c} />
                  </div>
                ))}
              </div>
            </section>
          ))}
          {rows.length < total && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Button variant="outlined" onClick={() => setShown(shown + PAGE)}>
                Show {Math.min(PAGE, total - rows.length)} more
              </Button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={HistoryOutlined}
          title="No calls yet"
          body="When an agent works in this library, every call it makes is listed here: which tool, what it asked for, and whether it worked."
          actions={
            <Button variant="contained" onClick={() => go({ to: 'agents' })}>
              How to connect one
            </Button>
          }
        />
      )}
    </Page>
  );
}
