import Button from '@mui/material/Button';
import { TOOL_GROUPS } from '@shared/mcp';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useMcp, useMcpTools, setMcp } from '../../state/mcp';
import { useNav } from '../../state/nav';
import { md } from '../../theme';
import { PortControl } from '../agents/PortControl';
import { Row } from './parts';

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
      <Row title="Port" body="Where agents knock. Change it if something else on this computer already uses this one.">
        <PortControl align="end" />
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
