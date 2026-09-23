import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import InstallDesktopOutlined from '@mui/icons-material/InstallDesktopOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { call } from '../../api';
import { notify, failed } from '../../notices/store';
import { useMcp, setMcp } from '../../state/mcp';
import { useNav } from '../../state/nav';
import { md, SHAPE } from '../../theme';
import { Page } from '../Placeholder';

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Typography variant="titleMedium" component="h2" sx={{ color: md('onSurface') }}>
        {title}
      </Typography>
      {children}
    </section>
  );
}

/** A block of code with a button that copies it, since that is all anyone wants from one. */
function Code({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 14px', borderRadius: SHAPE.md, background: md('surfaceContainerHighest') }}>
      <Typography component="pre" variant="bodyMedium" sx={{ flex: 1, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', color: md('onSurface'), userSelect: 'text' }}>
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
  );
}

/** How to point an AI agent at this library, and what it will be able to do when you have. */
export function AgentsPage() {
  const status = useMcp();
  const go = useNav((s) => s.go);
  const url = status?.url ?? 'http://127.0.0.1:7458/mcp';
  // The skill carries the address, so it is read again when the port changes.
  const skill = useQuery({ queryKey: ['mcp-skill', url], queryFn: () => call('mcp:skill'), staleTime: 0 }).data ?? '';

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
      title="AI agents"
      subtitle="Let an agent work in this library: the same things this window can do"
      width={900}
      actions={
        <Button startIcon={<TuneOutlined />} onClick={() => go({ to: 'agentTools' })}>
          Tools
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingTop: 4 }}>
        <Typography variant="bodyLarge" sx={{ color: md('onSurface') }}>
          While Tessera is open it answers on your own computer, and nothing else can reach it. An agent that connects can search the library, record licences, gather collections and link assets into a game.
          Everything it does appears here as it happens, and is written into Activity so you can see what it did.
        </Typography>

        <Block title="Claude Code">
          <Code text={`claude mcp add --transport http tessera ${url}`} />
        </Block>

        <Block title="Anything that reads a config file">
          <Code text={JSON.stringify({ mcpServers: { tessera: { type: 'http', url } } }, null, 2)} />
        </Block>

        <Block title="Teach the agent how this place works">
          <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
            A skill file explains the words Tessera uses (pack, asset, collection, linking, Review, the bin) and the rules that matter, such as never guessing a licence. Install it for Claude, save it anywhere, or copy it into a project.
          </Typography>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="contained" startIcon={<InstallDesktopOutlined />} onClick={() => void install('claude')}>
              Install for Claude
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
        </Block>

        <Block title="What it may do">
          <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
            {status ? `${status.tools.on} of ${status.tools.all} tools are switched on.` : ''} You choose what an agent can reach, by what it does: looking, filing, linking to a game, bringing things in, deleting to the bin. Deleting only ever means the bin, and only you can empty it.
          </Typography>
          <div>
            <Button variant="outlined" onClick={() => go({ to: 'agentTools' })}>
              Choose the tools
            </Button>
          </div>
        </Block>

        <Block title="The skill, as it will be installed">
          <Typography
            component="pre"
            variant="bodySmall"
            sx={{ margin: 0, padding: '14px 16px', borderRadius: `${SHAPE.md}px`, background: md('surfaceContainerLow'), color: md('onSurfaceVariant'), whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', maxHeight: 320, overflowY: 'auto', userSelect: 'text' }}
          >
            {skill}
          </Typography>
        </Block>

        {status && !status.enabled && (
          <div>
            <Button variant="contained" onClick={() => void setMcp({ enabled: true })}>
              Start answering agents
            </Button>
          </div>
        )}
      </div>
    </Page>
  );
}
