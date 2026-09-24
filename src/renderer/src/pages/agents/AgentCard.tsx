import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { useMcp, setMcp } from '../../state/mcp';
import { notify } from '../../notices/store';
import { useNav } from '../../state/nav';
import { SideBlock } from '../../components/SideBlock';
import { md, SHAPE } from '../../theme';

/** When an agent last did something, in words. */
function last(at: string | null): string {
  if (!at) return 'no calls yet';
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 1) return 'a call just now';
  if (mins < 60) return `last call ${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `last call ${hours} h ago` : `last call ${new Date(at).toLocaleDateString()}`;
}

/**
 * The agent door, in Home's right-hand column: whether it is open, where it answers, and the way
 * to its tools and its documentation. An agent that comes through it can do what this window can.
 */
export function AgentCard() {
  const status = useMcp();
  const go = useNav((s) => s.go);
  if (!status) return null;
  const good = status.enabled && status.running;

  return (
    <SideBlock
      title="MCP Server"
      note={
        <>
          <span style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, background: good ? md('primary') : status.error ? md('error') : md('outline') }} />
          {good ? 'answering' : status.error ? 'not answering' : status.enabled ? 'starting' : 'off'}
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {good ? (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 4px 4px 10px', borderRadius: SHAPE.sm, background: md('surfaceContainerHigh') }}>
              <Tooltip title={status.url}>
                <Typography variant="bodySmall" noWrap sx={{ flex: 1, minWidth: 0, color: md('onSurfaceVariant'), fontFamily: 'ui-monospace, Menlo, Consolas, monospace', userSelect: 'text' }}>
                  {status.url.replace(/^https?:\/\//, '')}
                </Typography>
              </Tooltip>
              <Tooltip title="Copy the address">
                <IconButton
                  size="small"
                  aria-label="Copy the address"
                  onClick={() => {
                    void navigator.clipboard.writeText(status.url);
                    notify.success('Address copied.');
                  }}
                >
                  <ContentCopyOutlined sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </div>
          ) : (
            <Typography variant="bodySmall" sx={{ flex: 1, minWidth: 0, color: status.error ? md('error') : md('onSurfaceVariant') }}>
              {status.error ?? `Nothing is listening. Port ${status.port} is ready when you are.`}
            </Typography>
          )}
          <Tooltip title={status.enabled ? 'Stop answering agents' : 'Answer agents'}>
            <Switch checked={status.enabled} onChange={(e) => void setMcp({ enabled: e.target.checked })} slotProps={{ input: { 'aria-label': 'Answer AI agents' } }} />
          </Tooltip>
        </div>

        <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
          {status.enabled
            ? `${status.tools.on} of ${status.tools.all} tools · ${last(status.lastCall)}`
            : 'An agent on this computer could search the library, file things and link them into a game. Nothing outside can reach it.'}
        </Typography>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Button size="small" startIcon={<MenuBookOutlined />} onClick={() => go({ to: 'agents' })}>
            How to connect
          </Button>
          <Button size="small" startIcon={<TuneOutlined />} onClick={() => go({ to: 'agentTools' })}>
            Tools
          </Button>
        </div>
      </div>
    </SideBlock>
  );
}
