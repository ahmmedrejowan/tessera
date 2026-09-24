import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import InstallDesktopOutlined from '@mui/icons-material/InstallDesktopOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import type { McpClientInfo } from '@shared/mcp';
import { call } from '../../api';
import { notify, failed } from '../../notices/store';
import { useMcp, setMcp } from '../../state/mcp';
import { useNav } from '../../state/nav';
import { md, SHAPE } from '../../theme';
import { PAGE, Page } from '../Placeholder';
import { SideSections, sectionAnchor, useSectionSpy, type SideSection } from '../settings/SideSections';

const SECTIONS: SideSection[] = [
  { id: 'what', title: 'What this is' },
  { id: 'connect', title: 'Connect an agent' },
  { id: 'skill', title: 'The skill file' },
  { id: 'tools', title: 'What it may do' },
  { id: 'safety', title: 'What it cannot do' },
];

/** A titled block of the page, the same shape as a group of settings. */
function Group({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <Typography variant="titleMedium" component="h2" sx={{ color: md('onSurface') }}>
        {title}
      </Typography>
      {note && (
        <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5, maxWidth: 680 }}>
          {note}
        </Typography>
      )}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </section>
  );
}

/** Something to be pasted somewhere else, with the button that saves you selecting it. */
function Code({ text, label }: { text: string; label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <Typography variant="labelLarge" sx={{ color: md('onSurfaceVariant') }}>
          {label}
        </Typography>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 8px 12px 14px', borderRadius: SHAPE.md, background: md('surfaceContainerHigh') }}>
        <Typography
          component="pre"
          variant="bodyMedium"
          sx={{ flex: 1, minWidth: 0, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', color: md('onSurface'), userSelect: 'text' }}
        >
          {text}
        </Typography>
        <Button
          size="small"
          startIcon={<ContentCopyOutlined />}
          onClick={() => {
            void navigator.clipboard.writeText(text);
            notify.success('Copied.');
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}

/** One agent: what Tessera would write, where, and the two ways to get it there. */
function Client({ client }: { client: McpClientInfo }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const install = async () => {
    setBusy(true);
    try {
      const where = await call('mcp:installClient', client.id);
      setDone(where.byCommand ? 'Set up with its own command.' : `Written to ${where.path}.${where.backup ? ' The old file is beside it.' : ''}`);
      notify.success(`${client.name} is set up.`, where.byCommand ? {} : { action: { label: 'Show the file', run: () => void call('fs:reveal', where.path) } });
    } catch (e) {
      failed(e, `${client.name} could not be set up`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '14px 16px', borderRadius: SHAPE.md, background: md('surfaceContainerLow'), display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
            {client.name}
          </Typography>
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
            {client.note}
          </Typography>
          {client.path && (
            <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), fontFamily: 'ui-monospace, Menlo, Consolas, monospace', wordBreak: 'break-all', mt: 0.5, userSelect: 'text' }}>
              {client.path}
            </Typography>
          )}
        </div>
        <Button size="small" variant="contained" disabled={busy} onClick={() => void install()}>
          {busy ? 'Setting up…' : 'Set it up'}
        </Button>
        <Button
          size="small"
          startIcon={<ContentCopyOutlined />}
          onClick={() => {
            void navigator.clipboard.writeText(client.command ?? client.snippet);
            notify.success(`${client.name}’s block copied.`);
          }}
        >
          Copy
        </Button>
      </div>
      <Typography
        component="pre"
        variant="bodySmall"
        sx={{ margin: 0, padding: '10px 12px', borderRadius: `${SHAPE.sm}px`, background: md('surfaceContainerHigh'), color: md('onSurface'), fontFamily: 'ui-monospace, Menlo, Consolas, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'text' }}
      >
        {client.command ?? client.snippet}
      </Typography>
      {done && (
        <Typography variant="bodySmall" sx={{ color: md('primary') }}>
          {done}
        </Typography>
      )}
    </div>
  );
}

/** How to point any AI agent at this library, and what it will be able to do when you have. */
export function AgentsPage() {
  const status = useMcp();
  const go = useNav((s) => s.go);
  const back = useNav((s) => s.back);
  const goBack = useNav((s) => s.goBack);
  const scroller = useRef<HTMLDivElement>(null);
  const current = useSectionSpy(scroller, 'agents', SECTIONS, true);
  const url = status?.url ?? 'http://127.0.0.1:7458/mcp';
  const skill = useQuery({ queryKey: ['mcp-skill', url], queryFn: () => call('mcp:skill'), staleTime: 0 }).data ?? '';
  const agents = useQuery({ queryKey: ['mcp-clients', url], queryFn: () => call('mcp:clients'), staleTime: 0 }).data ?? [];
  const at = (id: string) => sectionAnchor('agents', id);

  const install = async (where: 'claude' | 'choose') => {
    try {
      const done = await call('mcp:installSkill', where);
      if (done) notify.success(`Skill written to ${done.path}.`, { action: { label: 'Show it', run: () => void call('fs:reveal', done.path) } });
    } catch (e) {
      failed(e);
    }
  };

  return (
    <Page
      flush
      title="AI agents"
      onBack={() => (back.length ? goBack() : go({ to: 'home' }))}
      actions={
        <>
          <Button startIcon={<HistoryOutlined />} onClick={() => go({ to: 'agentCalls' })}>
            Calls
          </Button>
          <Button startIcon={<TuneOutlined />} onClick={() => go({ to: 'agentTools' })}>
            Tools
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', height: '100%' }}>
        <SideSections prefix="agents" sections={SECTIONS} current={current} />

        <div ref={scroller} style={{ overflowY: 'auto', scrollbarGutter: 'stable', minHeight: 0 }}>
          <div style={{ maxWidth: PAGE.column, padding: '0 32px 64px' }}>
            <div {...at('what')}>
              <Group
                title="What this is"
                note="Tessera speaks MCP, the protocol AI agents use to reach the programs on a computer. While Tessera is open it answers on this machine, so an agent working beside you can use your library."
              >
                <Code text={url} label="The address" />
                <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), maxWidth: 680 }}>
                  There is no key and no token, because there is nothing to keep out: the address is bound to this computer, and nothing on your network or the internet can reach it. Whatever an agent
                  changes appears in this window as it happens, and every call it makes is kept.
                </Typography>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {status && !status.enabled && (
                    <Button variant="contained" onClick={() => void setMcp({ enabled: true })}>
                      Start answering agents
                    </Button>
                  )}
                  <Button variant="outlined" startIcon={<HistoryOutlined />} onClick={() => go({ to: 'agentCalls' })}>
                    What agents have done
                  </Button>
                </div>
              </Group>
            </div>

            <div {...at('connect')}>
              <Group
                title="Connect an agent"
                note="Almost every agent reads the same block of JSON. Put this in yours, wherever it keeps its MCP settings, and it will find Tessera."
              >
                <Code text={JSON.stringify({ mcpServers: { tessera: { type: 'http', url } } }, null, 2)} label="The usual shape, for anything not listed below" />
                <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), maxWidth: 680 }}>
                  For these, Tessera can write it for you. The file is read first, only Tessera’s own entry is added, and a copy of the old file is kept beside it.
                </Typography>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {agents.map((c) => (
                    <Client key={c.id} client={c} />
                  ))}
                </div>
                <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), maxWidth: 680, marginTop: 8 }}>
                  An agent that can only start a program and talk to it, rather than speak HTTP, needs a bridge. Give it this as the command instead, and the bridge carries its messages to the address
                  above.
                </Typography>
                <Code text={`npx mcp-remote ${url}`} label="For an agent that cannot speak HTTP" />
              </Group>
            </div>

            <div {...at('skill')}>
              <Group
                title="The skill file"
                note="A page of plain Markdown that teaches an agent how this place works: the words Tessera uses (pack, asset, collection, linking, Review, the bin) and the rules that matter, first among them never guess a licence. Any agent that reads instruction files can use it."
              >
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="contained" startIcon={<InstallDesktopOutlined />} onClick={() => void install('claude')}>
                    Install for Claude Code
                  </Button>
                  <Button variant="outlined" startIcon={<DownloadOutlined />} onClick={() => void install('choose')}>
                    Save it somewhere
                  </Button>
                  <Button
                    startIcon={<ContentCopyOutlined />}
                    onClick={() => {
                      void navigator.clipboard.writeText(skill);
                      notify.success('The skill is on the clipboard.');
                    }}
                  >
                    Copy it
                  </Button>
                </div>
                <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                  Installing writes it to ~/.claude/skills/tessera-library/SKILL.md. For any other agent, save it into the project or paste it where that agent keeps its instructions.
                </Typography>
                <Typography
                  component="pre"
                  variant="bodySmall"
                  sx={{
                    margin: 0,
                    padding: '14px 16px',
                    borderRadius: `${SHAPE.md}px`,
                    background: md('surfaceContainerLow'),
                    color: md('onSurfaceVariant'),
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                    maxHeight: 340,
                    overflowY: 'auto',
                    userSelect: 'text',
                  }}
                >
                  {skill}
                </Typography>
              </Group>
            </div>

            <div {...at('tools')}>
              <Group
                title="What it may do"
                note={`${status ? `${status.tools.on} of ${status.tools.all} tools are switched on. ` : ''}An agent can do what this window can: search the library, read a pack, record a licence, gather a collection, link assets into a game, bring new packs in, and move things to the bin. You choose which of those it may reach, by what they do.`}
              >
                <div>
                  <Button variant="outlined" startIcon={<TuneOutlined />} onClick={() => go({ to: 'agentTools' })}>
                    Choose the tools
                  </Button>
                </div>
              </Group>
            </div>

            <div {...at('safety')}>
              <Group title="What it cannot do" note="The limits are Tessera's, not a matter of the agent's good manners.">
                <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    'Delete anything for good. Deleting means the library’s bin, which keeps everything and puts it back where it came from. No tool empties it; only you can, in the app.',
                    'Reach the library from another computer. The address is bound to this one.',
                    'Work quietly. Every call is recorded with what was asked and whether it worked, and changes are written into Activity as an agent’s doing.',
                    'Use a tool you have switched off. It is not offered at all, and a call to it is answered with a line saying where to turn it on.',
                  ].map((line) => (
                    <li key={line}>
                      <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), maxWidth: 680 }}>
                        {line}
                      </Typography>
                    </li>
                  ))}
                </ul>
              </Group>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
