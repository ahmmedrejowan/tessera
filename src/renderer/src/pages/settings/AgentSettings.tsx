import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { DEFAULT_MCP_PORT, TOOL_GROUPS } from '@shared/mcp';
import { call } from '../../api';
import { notify } from '../../notices/store';
import { useMcp, useMcpTools, setMcp } from '../../state/mcp';
import { useNav } from '../../state/nav';
import { md } from '../../theme';
import { Row } from './parts';

/** The port box: it says whether the number can be used before it is saved. */
function Port({ port, disabled }: { port: number; disabled: boolean }) {
  const [text, setText] = useState(String(port));
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => setText(String(port)), [port]);
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

  return (
    <>
      <TextField
        size="small"
        value={text}
        disabled={disabled}
        error={!!problem}
        helperText={problem ?? ' '}
        onChange={(e) => {
          setText(e.target.value.replace(/\D/g, ''));
          setProblem(null);
        }}
        onBlur={() => void save()}
        onKeyDown={(e) => e.key === 'Enter' && void save()}
        slotProps={{ htmlInput: { 'aria-label': 'Port', style: { width: 72 } } }}
      />
      {port !== DEFAULT_MCP_PORT && (
        <Button size="small" disabled={disabled} onClick={() => void setMcp({ port: DEFAULT_MCP_PORT })}>
          Reset
        </Button>
      )}
    </>
  );
}

/** Whether agents are answered, where, and what they may do. The detail lives on the agent pages. */
export function AgentSettings() {
  const status = useMcp();
  const tools = useMcpTools();
  const go = useNav((s) => s.go);
  if (!status) return null;
  const offGroups = TOOL_GROUPS.filter((g) => !tools.some((t) => t.group === g.id && t.on));

  return (
    <>
      <Row
        title="Answer AI agents"
        body={
          status.error ? (
            <Typography component="span" variant="bodySmall" sx={{ color: md('error') }}>
              {status.error}
            </Typography>
          ) : status.enabled && status.running ? (
            `Answering at ${status.url}. ${status.calls} call${status.calls === 1 ? '' : 's'} so far.`
          ) : (
            'While this is on, an agent on this computer can work in the library. Nothing outside can reach it.'
          )
        }
      >
        <Switch checked={status.enabled} onChange={(_, v) => void setMcp({ enabled: v })} slotProps={{ input: { 'aria-label': 'Answer AI agents' } }} />
      </Row>
      <Row title="Port" body="Change it if something else on this computer already uses this one.">
        <Port port={status.port} disabled={!status.enabled} />
      </Row>
      <Row title="Tools" body={`${status.tools.on} of ${status.tools.all} switched on${offGroups.length ? `. Off: ${offGroups.map((g) => g.title.toLowerCase()).join(', ')}.` : '.'} Deleting only ever moves things to the bin, and only you can empty it.`}>
        <Button variant="outlined" onClick={() => go({ to: 'agentTools' })}>
          Choose them
        </Button>
      </Row>
      <Row title="Connecting an agent" body="The address, the commands, and a skill file that teaches an agent how this library works.">
        <Button onClick={() => go({ to: 'agents' })}>How to connect</Button>
      </Row>
    </>
  );
}
