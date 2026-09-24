import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useRef, useState, type ReactNode } from 'react';
import { TOOL_GROUPS, type McpToolInfo, type ToolGroup } from '@shared/mcp';
import { useMcp, useMcpTools, setMcp } from '../../state/mcp';
import { useNav } from '../../state/nav';
import { md, SHAPE } from '../../theme';
import { PAGE, Page } from '../Placeholder';
import { SideSections, sectionAnchor, useSectionSpy, type SideSection } from '../settings/SideSections';

const SECTIONS: SideSection[] = TOOL_GROUPS.map((g) => ({ id: g.id, title: g.title }));

/** The arguments a tool takes, read off its schema, so you can see what an agent may send. */
function args(schema: Record<string, unknown>): { name: string; type: string; required: boolean; note: string }[] {
  const props = (schema.properties ?? {}) as Record<string, { type?: string; enum?: unknown[]; anyOf?: { type?: string }[]; description?: string; items?: { type?: string } }>;
  const required = new Set((schema.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([name, p]) => ({
    name,
    type: p.enum
      ? p.enum.map((v) => String(v)).join(' | ')
      : p.type === 'array'
        ? `${p.items?.type ?? 'value'}[]`
        : (p.type ?? p.anyOf?.map((a) => a.type).filter(Boolean).join(' or ') ?? 'value'),
    required: required.has(name),
    note: p.description ?? '',
  }));
}

/** A line of code, the way the rest of the app shows one. */
function Mono({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return (
    <Typography component="span" variant="bodySmall" sx={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', color: dim ? md('onSurfaceVariant') : md('onSurface') }}>
      {children}
    </Typography>
  );
}

/**
 * One tool: what it is called, what it does, and its switch. Everything an agent would need to
 * call it (the arguments, what comes back, an answer) waits behind Details, so the list stays a
 * list.
 */
function ToolRow({ tool, first }: { tool: McpToolInfo; first: boolean }) {
  const [open, setOpen] = useState(false);
  const takes = args(tool.schema);
  return (
    <div style={{ borderTop: first ? 'none' : `1px solid ${md('outlineVariant')}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography variant="bodyLarge" component="div" sx={{ color: tool.on ? md('onSurface') : md('onSurfaceVariant') }}>
            {tool.title} <Mono dim>{tool.name}</Mono>
          </Typography>
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), maxWidth: 560, display: '-webkit-box', WebkitLineClamp: open ? 4 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {tool.summary}
          </Typography>
        </div>
        <Button size="small" endIcon={<ExpandMoreOutlined sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />} onClick={() => setOpen(!open)}>
          Details
        </Button>
        <Switch size="small" checked={tool.on} onChange={(e) => void setMcp({ tool: { name: tool.name, on: e.target.checked } })} slotProps={{ input: { 'aria-label': tool.name } }} />
      </div>

      <Collapse in={open} unmountOnExit>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0 18px' }}>
          <div>
            <Typography variant="labelLarge" sx={{ color: md('onSurfaceVariant') }}>
              It takes
            </Typography>
            {takes.length ? (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column' }}>
                {takes.map((a) => (
                  <div key={a.name} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: `1px solid ${md('outlineVariant')}` }}>
                    <div style={{ width: 200, flexShrink: 0 }}>
                      <Mono>{a.name}</Mono>
                      {!a.required && (
                        <Typography component="span" variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                          {' '}
                          optional
                        </Typography>
                      )}
                      <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
                        {a.type}
                      </Typography>
                    </div>
                    <Typography variant="bodySmall" sx={{ flex: 1, color: md('onSurfaceVariant') }}>
                      {a.note}
                    </Typography>
                  </div>
                ))}
              </div>
            ) : (
              <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
                Nothing.
              </Typography>
            )}
          </div>

          {tool.returns && (
            <div>
              <Typography variant="labelLarge" sx={{ color: md('onSurfaceVariant') }}>
                It gives back
              </Typography>
              <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mb: 0.75 }}>
                {tool.returns}
              </Typography>
              {tool.example && (
                <Typography
                  component="pre"
                  variant="bodySmall"
                  sx={{
                    margin: 0,
                    padding: '10px 14px',
                    borderRadius: `${SHAPE.md}px`,
                    background: md('surfaceContainerHigh'),
                    color: md('onSurface'),
                    fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 260,
                    overflowY: 'auto',
                    userSelect: 'text',
                  }}
                >
                  {tool.example}
                </Typography>
              )}
            </div>
          )}
        </div>
      </Collapse>
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
                    <div style={{ marginTop: 10, padding: '2px 20px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
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
