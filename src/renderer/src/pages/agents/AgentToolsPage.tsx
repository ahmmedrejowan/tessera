import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { TOOL_GROUPS, type McpToolInfo, type ToolGroup } from '@shared/mcp';
import { useMcp, useMcpTools, setMcp } from '../../state/mcp';
import { useNav } from '../../state/nav';
import { md, SHAPE } from '../../theme';
import { Page } from '../Placeholder';

/** The arguments a tool takes, read off its schema, so you can see what an agent may send. */
function args(schema: Record<string, unknown>): { name: string; type: string; required: boolean }[] {
  const props = (schema.properties ?? {}) as Record<string, { type?: string; enum?: unknown[]; anyOf?: { type?: string }[] }>;
  const required = new Set((schema.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([name, p]) => ({
    name,
    type: p.enum ? p.enum.join(' | ') : (p.type ?? p.anyOf?.map((a) => a.type).filter(Boolean).join(' or ') ?? 'value'),
    required: required.has(name),
  }));
}

function ToolRow({ tool }: { tool: McpToolInfo }) {
  const takes = args(tool.schema);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '12px 16px', borderRadius: SHAPE.md, background: md('surfaceContainerLow') }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
          {tool.title}
          <Typography component="span" variant="bodySmall" sx={{ color: md('onSurfaceVariant'), ml: 1, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
            {tool.name}
          </Typography>
        </Typography>
        <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
          {tool.summary}
        </Typography>
        {takes.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {takes.map((a) => (
              <Chip
                key={a.name}
                size="small"
                variant="outlined"
                label={`${a.name}${a.required ? '' : '?'}: ${a.type}`}
                sx={{ borderRadius: `${SHAPE.xs}px`, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 11 }}
              />
            ))}
          </div>
        )}
      </div>
      <Switch checked={tool.on} onChange={(e) => void setMcp({ tool: { name: tool.name, on: e.target.checked } })} slotProps={{ input: { 'aria-label': tool.name } }} />
    </div>
  );
}

/** Everything an agent can do, grouped by what it does, each one with a switch. */
export function AgentToolsPage() {
  const status = useMcp();
  const tools = useMcpTools();
  const go = useNav((s) => s.go);

  const inGroup = (g: ToolGroup) => tools.filter((t) => t.group === g);
  const all = (on: boolean) => {
    for (const g of TOOL_GROUPS) void setMcp({ group: { id: g.id, on } });
  };

  return (
    <Page
      title="Agent tools"
      subtitle={status ? `${status.tools.on} of ${status.tools.all} switched on. An agent can only do what is on here.` : 'What an agent may do in this library'}
      width={980}
      actions={
        <>
          <Button onClick={() => all(false)}>Turn all off</Button>
          <Button onClick={() => all(true)}>Turn all on</Button>
          <Button variant="outlined" onClick={() => go({ to: 'agents' })}>
            How to connect
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
        {TOOL_GROUPS.map((group) => {
          const mine = inGroup(group.id);
          const on = mine.filter((t) => t.on).length;
          return (
            <Accordion key={group.id} disableGutters defaultExpanded={group.id === 'read'} sx={{ borderRadius: `${SHAPE.lg}px`, overflow: 'hidden', background: md('surfaceContainer'), '&::before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
                <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                  <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
                    {group.title}
                  </Typography>
                  <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                    {group.note}
                  </Typography>
                </div>
                <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), alignSelf: 'center', mr: 1, whiteSpace: 'nowrap' }}>
                  {on} of {mine.length} on
                </Typography>
                <Switch
                  checked={on > 0}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => void setMcp({ group: { id: group.id, on: e.target.checked } })}
                  slotProps={{ input: { 'aria-label': `${group.title} tools` } }}
                  sx={{ alignSelf: 'center' }}
                />
              </AccordionSummary>
              <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 0 }}>
                {mine.map((t) => (
                  <ToolRow key={t.name} tool={t} />
                ))}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </div>
    </Page>
  );
}
