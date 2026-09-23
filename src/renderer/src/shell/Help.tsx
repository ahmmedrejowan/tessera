import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useHealth } from '../state/health';
import { useNav } from '../state/nav';
import { md } from '../theme';

/**
 * The question mark in the top bar: straight to Help, with a dot when something in the library
 * wants seeing to (packs in Review, a licence without its credit, a backup going stale).
 */
export function HelpButton() {
  const go = useNav((s) => s.go);
  const { worries } = useHealth();
  return (
    <Tooltip title="Help and how your library is doing">
      <IconButton onClick={() => go({ to: 'help' })} aria-label="Help" sx={{ color: md('onSurfaceVariant') }}>
        <HelpOutlineRounded />
        {worries > 0 && <span style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, background: md('tertiary') }} />}
      </IconButton>
    </Tooltip>
  );
}
