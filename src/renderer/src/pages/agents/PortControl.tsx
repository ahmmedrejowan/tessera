import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { DEFAULT_MCP_PORT } from '@shared/mcp';
import { call } from '../../api';
import { ask } from '../../notices/dialogs';
import { failed, notify } from '../../notices/store';
import { useMcp, setMcp } from '../../state/mcp';
import { md, SHAPE } from '../../theme';

/**
 * Where agents knock, and what to do when something else is already there. A port is a small
 * thing to have to think about, so this says who has it and offers both ways out: move, or stop
 * the other program.
 */
export function PortControl({ align = 'start' }: { align?: 'start' | 'end' } = {}) {
  const status = useMcp();
  const [text, setText] = useState(String(status?.port ?? DEFAULT_MCP_PORT));
  const [problem, setProblem] = useState<string | null>(null);
  const [holder, setHolder] = useState<{ pid: number; name: string; ours: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const port = status?.port ?? DEFAULT_MCP_PORT;
  const taken = !!status?.enabled && !status.running;

  useEffect(() => setText(String(port)), [port]);
  // When it cannot listen, find out what has the port, so the answer is a name and not a number.
  useEffect(() => {
    if (!taken) {
      setHolder(null);
      return;
    }
    let live = true;
    void call('mcp:portUser', port).then((who) => live && setHolder(who));
    return () => {
      live = false;
    };
  }, [taken, port]);

  if (!status) return null;
  const n = Number(text);
  const changed = n !== port;

  const save = async () => {
    if (!changed) return;
    if (!Number.isInteger(n) || n < 1024 || n > 65535) {
      setProblem('A number between 1024 and 65535.');
      return;
    }
    if (!(await call('mcp:portFree', n))) {
      setProblem('Something else is using that one.');
      return;
    }
    setProblem(null);
    await setMcp({ port: n });
    notify.success(`Agents now answer on port ${n}.`);
  };

  const takeIt = async () => {
    const yes = await ask<boolean>({
      tone: 'warning',
      title: `Stop ${holder?.name ?? 'it'} and take port ${port}?`,
      body: `${holder?.name ?? 'The program'} (${holder?.pid}) is listening there. Stopping it closes that program${holder?.ours ? ', which looks like another copy of Tessera' : ''}. Anything it was doing is lost.`,
      actions: [
        { label: 'Leave it', value: false, kind: 'text' },
        { label: 'Stop it', value: true, kind: 'danger' },
      ],
    });
    if (!yes) return;
    setBusy(true);
    try {
      const done = await call('mcp:freePort', port);
      notify.success(done.stopped ? `${done.stopped.name} stopped. Agents answer on ${port} again.` : `Port ${port} is free again.`);
    } catch (e) {
      failed(e, 'That program could not be stopped');
    } finally {
      setBusy(false);
    }
  };

  const findFree = async () => {
    setBusy(true);
    try {
      for (let next = port + 1; next < port + 40; next++) {
        if (await call('mcp:portFree', next)) {
          await setMcp({ port: next });
          notify.success(`Agents now answer on port ${next}.`);
          return;
        }
      }
      notify.warning('No free port near this one. Choose one yourself.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: align === 'end' ? 'flex-end' : 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <TextField
          size="small"
          label="Port"
          value={text}
          error={!!problem}
          helperText={problem ?? ' '}
          onChange={(e) => {
            setText(e.target.value.replace(/\D/g, ''));
            setProblem(null);
          }}
          onBlur={() => void save()}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          slotProps={{ htmlInput: { 'aria-label': 'Port', style: { width: 80 } } }}
        />
        {changed && (
          <Button sx={{ mt: 0.5 }} onClick={() => void save()}>
            Use it
          </Button>
        )}
        {!changed && port !== DEFAULT_MCP_PORT && (
          <Button sx={{ mt: 0.5 }} onClick={() => void setMcp({ port: DEFAULT_MCP_PORT })}>
            Back to {DEFAULT_MCP_PORT}
          </Button>
        )}
      </div>

      {taken && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 430, padding: '12px 14px', borderRadius: SHAPE.md, background: md('errorContainer'), color: md('onErrorContainer') }}>
          <Typography variant="bodyMedium">
            {holder ? `${holder.name} (${holder.pid}) is already listening on port ${port}, so Tessera cannot.` : `Something else is already listening on port ${port}, so Tessera cannot.`}
          </Typography>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="small" variant="contained" color="error" disabled={busy || !holder} onClick={() => void takeIt()}>
              {busy ? 'Working…' : `Stop ${holder?.name ?? 'it'} and take the port`}
            </Button>
            <Button size="small" disabled={busy} onClick={() => void findFree()} sx={{ color: md('onErrorContainer') }}>
              Use the next free port
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
