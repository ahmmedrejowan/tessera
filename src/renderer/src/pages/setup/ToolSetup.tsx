import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import TerminalRounded from '@mui/icons-material/TerminalRounded';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Events } from '@shared/ipc';
import type { Platform, ToolName } from '@shared/types';
import { call, on, platform } from '../../api';
import { formatBytes } from '../../components/labels';
import { failed, notify } from '../../notices/store';
import { md, SHAPE } from '../../theme';

interface Way {
  /** Package manager, as found on the system. */
  tool?: string;
  label: string;
  command: string;
}

interface ToolInfo {
  title: string;
  size: string;
  site: { label: string; url: string };
  ways: Record<Platform, Way[]>;
}

const OS_NAMES: Record<Platform, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

export const TOOL_INFO: Record<ToolName, ToolInfo> = {
  syncthing: {
    title: 'Syncthing',
    size: '12 MB',
    site: { label: 'syncthing.net', url: 'https://syncthing.net/downloads/' },
    ways: {
      darwin: [{ tool: 'brew', label: 'Homebrew', command: 'brew install syncthing' }],
      win32: [{ tool: 'winget', label: 'winget', command: 'winget install --id Syncthing.Syncthing -e' }],
      linux: [
        { tool: 'apt', label: 'Debian, Ubuntu', command: 'sudo apt install syncthing' },
        { tool: 'dnf', label: 'Fedora', command: 'sudo dnf install syncthing' },
        { tool: 'pacman', label: 'Arch', command: 'sudo pacman -S syncthing' },
        { tool: 'zypper', label: 'openSUSE', command: 'sudo zypper install syncthing' },
      ],
    },
  },
  rclone: {
    title: 'rclone',
    size: '25 MB',
    site: { label: 'rclone.org', url: 'https://rclone.org/downloads/' },
    ways: {
      darwin: [{ tool: 'brew', label: 'Homebrew', command: 'brew install rclone' }],
      win32: [{ tool: 'winget', label: 'winget', command: 'winget install --id Rclone.Rclone -e' }],
      linux: [
        { tool: 'apt', label: 'Debian, Ubuntu', command: 'sudo apt install rclone' },
        { tool: 'dnf', label: 'Fedora', command: 'sudo dnf install rclone' },
        { tool: 'pacman', label: 'Arch', command: 'sudo pacman -S rclone' },
      ],
    },
  },
  kopia: {
    title: 'Kopia',
    size: '16 MB',
    site: { label: 'kopia.io', url: 'https://kopia.io/docs/installation/' },
    ways: {
      darwin: [{ tool: 'brew', label: 'Homebrew', command: 'brew install kopia' }],
      win32: [{ tool: 'winget', label: 'winget', command: 'winget install --id Kopia.KopiaUI -e' }],
      linux: [
        { tool: 'brew', label: 'Homebrew', command: 'brew install kopia' },
        { tool: 'yay', label: 'Arch (AUR)', command: 'yay -S kopia-bin' },
      ],
    },
  },
};

export function CommandLine({ command, found }: { command: string; found?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 14px', borderRadius: SHAPE.md, background: md('inverseSurface'), color: md('inverseOnSurface') }}>
      <span style={{ opacity: 0.6, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13 }}>$</span>
      <code style={{ flex: 1, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13, userSelect: 'text', overflowWrap: 'anywhere' }}>{command}</code>
      {found && <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: SHAPE.full, background: md('inversePrimary'), color: md('onPrimaryContainer'), whiteSpace: 'nowrap' }}>on this computer</span>}
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton size="small" sx={{ color: 'inherit' }} onClick={() => void navigator.clipboard.writeText(command).then(() => setCopied(true))}>
          <ContentCopyRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    </div>
  );
}

const STAGES: Record<Events['tools:installProgress']['stage'], string> = {
  finding: 'Finding the latest version…',
  downloading: 'Downloading…',
  checking: 'Checking the download…',
  unpacking: 'Unpacking…',
  done: 'Ready',
};

/**
 * Getting an optional tool onto this computer: Tessera can fetch and check the official build
 * itself, or the user can install it with their system's package manager (commands for each
 * system, since another computer may run something else).
 */
export function ToolSetup({ tool, available, bundled, compact }: { tool: ToolName; available: boolean; bundled: boolean; compact?: boolean }) {
  const info = TOOL_INFO[tool];
  const client = useQueryClient();
  const [progress, setProgress] = useState<Events['tools:installProgress'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [os, setOs] = useState<Platform>(platform);
  const [way, setWay] = useState(0);
  const managers = useQuery({ queryKey: ['package-managers'], queryFn: () => call('tools:packageManagers'), staleTime: Infinity }).data ?? [];
  useEffect(() => on('tools:installProgress', (p) => p.tool === tool && setProgress(p)), [tool]);
  // Installed by hand in the meantime? Look again when the window comes back into focus.
  useEffect(() => {
    const again = () => void client.invalidateQueries({ queryKey: [tool === 'syncthing' ? 'sync' : 'backup'] });
    window.addEventListener('focus', again);
    return () => window.removeEventListener('focus', again);
  }, [client]);

  const install = async () => {
    setBusy(true);
    try {
      const version = await call('tools:install', tool);
      notify.success(`${info.title} ${version} is ready.`);
      await client.invalidateQueries({ queryKey: [tool === 'syncthing' ? 'sync' : 'backup'] });
    } catch (e) {
      failed(e, `Couldn’t get ${info.title}`);
    } finally {
      setBusy(false);
    }
  };

  if (available) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: SHAPE.lg, background: md('secondaryContainer'), color: md('onSecondaryContainer') }}>
        <CheckCircleRounded />
        <Typography variant="bodyMedium" sx={{ flex: 1 }}>
          {info.title} is ready{bundled ? ' (Tessera’s own copy)' : ''}. Nothing else to set up.
        </Typography>
      </div>
    );
  }

  const current = info.ways[os][way];
  const pct = progress && progress.total ? (progress.received / progress.total) * 100 : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 16 : 20 }}>
      <div style={{ padding: 20, borderRadius: SHAPE.xl, background: md('primaryContainer'), color: md('onPrimaryContainer'), display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: md('primary'), color: md('onPrimary'), flexShrink: 0 }}>
            <DownloadRounded />
          </span>
          <div style={{ flex: 1 }}>
            <Typography variant="titleMedium">Set it up for me</Typography>
            <Typography variant="bodySmall" component="div" sx={{ opacity: 0.85, mt: 0.25 }}>
              The official build for {OS_NAMES[platform]}, about {info.size}. No installer, no admin password.
            </Typography>
          </div>
        </div>
        {busy && progress ? (
          <div style={{ height: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <LinearProgress variant={pct === null ? 'indeterminate' : 'determinate'} {...(pct === null ? {} : { value: pct })} sx={{ height: 6, borderRadius: 3 }} />
            <Typography variant="bodySmall" component="div" sx={{ mt: 0.75, opacity: 0.85 }}>
              {STAGES[progress.stage]}
              {progress.stage === 'downloading' && progress.total ? ` ${formatBytes(progress.received)} of ${formatBytes(progress.total)}` : ''}
            </Typography>
          </div>
        ) : (
          <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button variant="contained" startIcon={<DownloadRounded />} disabled={busy} onClick={() => void install()}>
              Download and set up
            </Button>
            <Typography variant="bodySmall" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: 0.8 }}>
              <VerifiedUserOutlined sx={{ fontSize: 16 }} /> Checksum verified
            </Typography>
          </div>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <TerminalRounded sx={{ fontSize: 20, color: md('onSurfaceVariant') }} />
          <Typography variant="titleSmall" sx={{ color: md('onSurface'), flex: 1 }}>
            Or install it yourself
          </Typography>
          <Button size="small" startIcon={<RefreshRounded />} onClick={() => void client.invalidateQueries({ queryKey: [tool === 'syncthing' ? 'sync' : 'backup'] })}>
            Check again
          </Button>
        </div>
        <Tabs value={os} onChange={(_, v: Platform) => { setOs(v); setWay(0); }} sx={{ minHeight: 40, mb: 1.5, '& .MuiTab-root': { minHeight: 40, textTransform: 'none' } }}>
          {(Object.keys(OS_NAMES) as Platform[]).map((p) => (
            <Tab key={p} value={p} label={OS_NAMES[p]} />
          ))}
        </Tabs>
        {/* One command at a time, picked by these chips, so every system's tab is the same height. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, height: 28 }}>
            {info.ways[os].map((w, i) => (
              <ButtonBase
                key={w.label}
                onClick={() => setWay(i)}
                sx={{ px: 1.5, borderRadius: `${SHAPE.sm}px`, fontSize: 12, border: `1px solid ${i === way ? md('secondaryContainer') : md('outlineVariant')}`, backgroundColor: i === way ? md('secondaryContainer') : 'transparent', color: i === way ? md('onSecondaryContainer') : md('onSurfaceVariant') }}
              >
                {w.label}
              </ButtonBase>
            ))}
          </div>
          {current && <CommandLine command={current.command} found={os === platform && !!current.tool && managers.includes(current.tool)} />}
          <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
            Or download it from{' '}
            <a href={info.site.url} target="_blank" rel="noreferrer" style={{ color: md('primary') }}>
              {info.site.label}
            </a>
            .
          </Typography>
        </div>
      </div>
    </div>
  );
}
