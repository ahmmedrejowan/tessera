import ArrowForward from '@mui/icons-material/ArrowForward';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { isSensitive, type McpCall } from '@shared/mcp';
import { useMcpCalls, useMcpTools } from '../../state/mcp';
import { useNav } from '../../state/nav';
import { SideBlock } from '../../components/SideBlock';
import { md, mdAlpha, SHAPE } from '../../theme';

/** The time of day a call came in. */
export function at(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** One call: whether it worked, which tool, and what was asked for. */
export function CallRow({ call, showDate }: { call: McpCall; showDate?: boolean }) {
  // The tool's own words for itself, so the history reads like the tools page.
  const title = useMcpTools().find((t) => t.name === call.tool)?.title ?? call.tool;
  return (
    <div
      // A sensitive tool reads in a faint red, here as on the tools page.
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', margin: '0 -10px', borderRadius: SHAPE.sm, background: isSensitive(call.group) ? mdAlpha('error', 0.07) : 'transparent' }}
    >
      <Tooltip title={call.ok ? 'It worked' : (call.problem ?? 'It did not work')}>
        <span
          style={{
            width: 18,
            height: 18,
            marginTop: 2,
            borderRadius: 9,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            background: call.ok ? md('secondaryContainer') : md('errorContainer'),
            color: call.ok ? md('onSecondaryContainer') : md('onErrorContainer'),
          }}
        >
          {call.ok ? <CheckRounded sx={{ fontSize: 12 }} /> : <CloseRounded sx={{ fontSize: 12 }} />}
        </span>
      </Tooltip>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="bodyMedium" noWrap sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        {(call.said || call.problem) && (
          <Typography variant="bodySmall" noWrap component="div" sx={{ color: call.ok ? md('onSurfaceVariant') : md('error') }}>
            {call.ok ? call.said : (call.problem ?? call.said)}
          </Typography>
        )}
      </div>
      <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), flexShrink: 0 }}>
        {showDate ? new Date(call.at).toLocaleDateString([], { day: 'numeric', month: 'short' }) : at(call.at)}
      </Typography>
    </div>
  );
}

/** The last few calls, under the server's card: what an agent has been doing in the library. */
export function AgentHistory() {
  const { rows, total } = useMcpCalls(5);
  const go = useNav((s) => s.go);
  if (!total) return null;
  return (
    <SideBlock
      title="Recent calls"
      note={total > rows.length ? `${total} in all` : ''}
      action={
        <Button size="small" endIcon={<ArrowForward />} onClick={() => go({ to: 'agentCalls' })}>
          See all
        </Button>
      }
    >
      <div style={{ padding: '4px 14px' }}>
        {rows.map((c, i) => (
          <div key={`${c.at}-${i}`} style={{ borderTop: i ? `1px solid ${md('outlineVariant')}` : 'none' }}>
            <CallRow call={c} />
          </div>
        ))}
      </div>
    </SideBlock>
  );
}
