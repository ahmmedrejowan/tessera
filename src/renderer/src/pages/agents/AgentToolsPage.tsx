import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useRef } from 'react';
import { TOOL_GROUPS, type McpToolInfo, type ToolGroup } from '@shared/mcp';
import { useMcp, useMcpTools, setMcp } from '../../state/mcp';
import { useNav } from '../../state/nav';
import { md, SHAPE } from '../../theme';
import { PAGE, Page } from '../Placeholder';
import { SideSections, sectionAnchor, useSectionSpy, type SideSection } from '../settings/SideSections';

const SECTIONS: SideSection[] = TOOL_GROUPS.map((g) => ({ id: g.id, title: g.title }));

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

function ToolRow({ tool, first }: { tool: McpToolInfo; first: boolean }) {
  const takes = args(tool.schema);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 0', borderTop: first ? 'none' : `1px solid ${md('outlineVariant')}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="bodyLarge" component="div" sx={{ color: md('onSurface') }}>
          {tool.title}
          <Typography component="span" variant="bodySmall" sx={{ color: md('onSurfaceVariant'), ml: 1, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
            {tool.name}
          </Typography>
        </Typography>
        <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), maxWidth: 620, display: 'block', mt: 0.25 }}>
          {tool.summary}
        </Typography>
        {takes.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
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

/** Everything an agent can do, a group at a time, each with a switch of its own. */
export function AgentToolsPage() {
  const status = useMcp();
  const tools = useMcpTools();
  const go = useNav((s) => s.go);
  const back = useNav((s) => s.back);
  const goBack = useNav((s) => s.goBack);
  const scroller = useRef<HTMLDivElement>(null);
  const current = useSectionSpy(scroller, 'tools', SECTIONS, tools.length > 0);
  const at = (id: string) => sectionAnchor('tools', id);
  const inGroup = (g: ToolGroup) => tools.filter((t) => t.group === g);
  const all = (on: boolean) => {
    for (const g of TOOL_GROUPS) void setMcp({ group: { id: g.id, on } });
  };

  return (
    <Page
      flush
      title="Agent tools"
      onBack={() => (back.length ? goBack() : go({ to: 'agents' }))}
      actions={
        <>
          <Button startIcon={<MenuBookOutlined />} onClick={() => go({ to: 'agents' })}>
            How to connect
          </Button>
          <Button startIcon={<HistoryOutlined />} onClick={() => go({ to: 'agentCalls' })}>
            Calls
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', height: '100%' }}>
        <SideSections prefix="tools" sections={SECTIONS} current={current} />

        <div ref={scroller} style={{ overflowY: 'auto', scrollbarGutter: 'stable', minHeight: 0 }}>
          <div style={{ maxWidth: PAGE.column, padding: '0 32px 64px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 0 24px' }}>
              <Typography variant="bodyMedium" sx={{ flex: 1, color: md('onSurfaceVariant') }}>
                {status ? `${status.tools.on} of ${status.tools.all} switched on.` : ''} An agent can only do what is on here, and a change takes effect at once.
              </Typography>
              <Button size="small" onClick={() => all(false)}>
                Turn all off
              </Button>
              <Button size="small" onClick={() => all(true)}>
                Turn all on
              </Button>
            </div>

            {TOOL_GROUPS.map((group) => {
              const mine = inGroup(group.id);
              const on = mine.filter((t) => t.on).length;
              return (
                <div key={group.id} {...at(group.id)}>
                  <section style={{ marginBottom: 40 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="titleMedium" component="h2" sx={{ color: md('onSurface') }}>
                          {group.title}
                        </Typography>
                        <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5, maxWidth: 620 }}>
                          {group.note}
                        </Typography>
                      </div>
                      <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), whiteSpace: 'nowrap', mt: 1 }}>
                        {on} of {mine.length} on
                      </Typography>
                      <Switch
                        checked={on > 0}
                        onChange={(e) => void setMcp({ group: { id: group.id, on: e.target.checked } })}
                        slotProps={{ input: { 'aria-label': `${group.title} tools` } }}
                      />
                    </div>
                    <div style={{ marginTop: 8, padding: '0 20px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
                      {mine.map((t, i) => (
                        <ToolRow key={t.name} tool={t} first={i === 0} />
                      ))}
                    </div>
                  </section>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Page>
  );
}
