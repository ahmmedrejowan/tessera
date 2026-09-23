import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import { useMcp, setMcp } from '../../state/mcp';
import { notify } from '../../notices/store';
import { useNav } from '../../state/nav';
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
 * The agent door, on Home above the watcher: whether it is open, where it answers, and the way to
 * its tools and its documentation. An agent that comes through it can do what this window can.
 */
export function AgentCard() {
  const status = useMcp();
  const go = useNav((s) => s.go);
  if (!status) return null;
  const good = status.enabled && status.running;

  return (
    <section style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
      <span style={{ width: 44, height: 44, borderRadius: SHAPE.md, display: 'grid', placeItems: 'center', background: good ? md('secondaryContainer') : md('surfaceContainerHigh'), color: good ? md('onSecondaryContainer') : md('onSurfaceVariant'), flexShrink: 0 }}>
        <SmartToyOutlined />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleSmall" sx={{ color: md('onSurface'), display: 'flex', alignItems: 'center', gap: 1 }}>
          AI agents
          <span style={{ width: 8, height: 8, borderRadius: 4, background: good ? md('primary') : status.error ? md('error') : md('outline') }} />
          <Typography component="span" variant="bodySmall" sx={{ color: status.error ? md('error') : md('onSurfaceVariant') }}>
            {status.error ? status.error : good ? 'answering' : status.enabled ? 'starting' : 'off'}
          </Typography>
        </Typography>
        <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {good ? status.url : `Port ${status.port}`} · {status.tools.on} of {status.tools.all} tools · {last(status.lastCall)}
          {good && (
            <Tooltip title="Copy the address">
              <IconButton
                size="small"
                onClick={() => {
                  void navigator.clipboard.writeText(status.url);
                  notify.success('Address copied.');
                }}
              >
                <ContentCopyOutlined sx={{ fontSize: 15 }} />
              </IconButton>
            </Tooltip>
          )}
        </Typography>
      </div>
      <Button startIcon={<MenuBookOutlined />} onClick={() => go({ to: 'agents' })}>
        How to connect
      </Button>
      <Button startIcon={<TuneOutlined />} onClick={() => go({ to: 'agentTools' })}>
        Tools
      </Button>
      <Tooltip title={status.enabled ? 'Stop answering agents' : 'Answer agents'}>
        <Switch checked={status.enabled} onChange={(e) => void setMcp({ enabled: e.target.checked })} slotProps={{ input: { 'aria-label': 'Answer AI agents' } }} />
      </Tooltip>
    </section>
  );
}
