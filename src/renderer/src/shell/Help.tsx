import BackupOutlined from '@mui/icons-material/BackupOutlined';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import KeyboardOutlined from '@mui/icons-material/KeyboardOutlined';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import SyncOutlined from '@mui/icons-material/SyncOutlined';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState, type ComponentType, type ReactNode } from 'react';
import { call } from '../api';
import { useLibraryRecord, useStats } from '../state/library';
import { useNav } from '../state/nav';
import { md, mdAlpha, SHAPE } from '../theme';
import { useShortcuts } from './Shortcuts';

/** Short answers to the questions the app itself raises. */
const ANSWERS: { q: string; a: string }[] = [
  {
    q: 'What is a pack?',
    a: 'One download: a zip, a folder, or a few files you got together. Tessera keeps your copy of it whole, with its licence, where it came from and what’s inside on record.',
  },
  {
    q: 'Why does every pack need a licence and a link?',
    a: 'Because a year from now, when your game ships, you need to know what you were allowed to do with each asset — and be able to show it. A pack without both waits in Review instead of joining the library.',
  },
  {
    q: 'Where are my files?',
    a: 'In the library folder you chose, as ordinary files and folders — nothing is hidden in a database. Settings → General shows the folder, and every pack page can open its own.',
  },
  {
    q: 'What does Review do?',
    a: 'It holds packs whose licence or source Tessera couldn’t work out. Fill in the two fields and the pack moves into the library by itself.',
  },
  {
    q: 'How do backups work?',
    a: 'Kopia makes encrypted copies of a library somewhere else — a drive, a cloud drive, cloud storage or a server — and only sends what changed. Each library is backed up on its own, and the password is yours: without it nothing can be read.',
  },
  {
    q: 'Can I use one library on two computers?',
    a: 'Yes, with Sync: Syncthing keeps the folder the same on computers you have paired, over your own network. Nothing goes through anyone else’s server.',
  },
  {
    q: 'What does Tessera send anywhere?',
    a: 'Nothing, unless you ask. Downloads go to the sites you give it, archive.org copies are made only when you leave that switch on, and error reports are never sent without your say-so.',
  },
];

function Answer({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: `1px solid ${md('outlineVariant')}` }}>
      <ButtonBase onClick={() => setOpen(!open)} sx={{ width: '100%', justifyContent: 'space-between', gap: 1, py: 1.25, textAlign: 'left' }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
          {q}
        </Typography>
        <ExpandMoreRounded sx={{ fontSize: 20, color: md('onSurfaceVariant'), transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </ButtonBase>
      {open && (
        <Typography variant="bodySmall" component="p" sx={{ color: md('onSurfaceVariant'), pb: 1.5, m: 0 }}>
          {a}
        </Typography>
      )}
    </div>
  );
}

function Line({ icon: Icon, tone, title, body, action }: { icon: ComponentType<{ sx?: object }>; tone: 'ok' | 'warn' | 'bad'; title: string; body?: string; action?: ReactNode }) {
  const color = tone === 'bad' ? md('error') : tone === 'warn' ? md('tertiary') : md('primary');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <Icon sx={{ fontSize: 20, color }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        {body && (
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
            {body}
          </Typography>
        )}
      </div>
      {action}
    </div>
  );
}

const days = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null);

/**
 * The question mark in the top bar: how this library is doing — what still needs a licence, what
 * waits in Review, whether backups and sync are on — and short answers to the questions Tessera
 * raises by asking for a licence in the first place.
 */
export function Help() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const go = useNav((s) => s.go);
  const record = useLibraryRecord();
  const stats = useStats().data;
  const open = !!anchor;
  const health = useQuery({ queryKey: ['health-help'], queryFn: () => call('library:health'), enabled: open, staleTime: 0 }).data;
  const backup = useQuery({ queryKey: ['backup-help'], queryFn: () => call('backup:status'), enabled: open, staleTime: 0 }).data;
  const sync = useQuery({ queryKey: ['sync-help'], queryFn: () => call('sync:status'), enabled: open, staleTime: 0 }).data;

  const jump = (route: Parameters<typeof go>[0]) => {
    setAnchor(null);
    go(route);
  };

  const review = stats?.inbox ?? 0;
  const needCredit = health?.noCreditLine.length ?? 0;
  const restricted = health?.restricted.length ?? 0;
  const since = days(backup?.lastBackupAt ?? null);
  const worries = (review ? 1 : 0) + (needCredit || restricted ? 1 : 0) + (backup?.lastError || (backup?.target && since !== null && since > 7) ? 1 : 0);

  return (
    <>
      <Tooltip title="Help and how your library is doing">
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Help" sx={{ color: md('onSurfaceVariant') }}>
          <HelpOutlineRounded />
          {worries > 0 && <span style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, background: md('tertiary') }} />}
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 460, maxHeight: '72vh', borderRadius: `${SHAPE.lg}px`, backgroundColor: md('surfaceContainerHigh'), backgroundImage: 'none' } } }}
      >
        <div style={{ padding: '16px 20px 8px' }}>
          <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
            {record?.name ?? 'This library'}
          </Typography>
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
            How it’s doing, and answers to the usual questions
          </Typography>
        </div>

        <div style={{ padding: '0 20px', borderBottom: `1px solid ${md('outlineVariant')}` }}>
          {review > 0 ? (
            <Line
              icon={RateReviewOutlined}
              tone="warn"
              title={review === 1 ? 'One pack is waiting in Review' : `${review} packs are waiting in Review`}
              body="They need a licence and a link before they join the library."
              action={<Button onClick={() => jump({ to: 'inbox' })}>Open</Button>}
            />
          ) : (
            <Line icon={CheckCircleRounded} tone="ok" title="Nothing is waiting in Review" />
          )}

          {needCredit || restricted ? (
            <Line
              icon={GavelOutlined}
              tone={restricted ? 'bad' : 'warn'}
              title={[needCredit ? `${needCredit} pack${needCredit === 1 ? '' : 's'} without a credit line` : '', restricted ? `${restricted} with restricted terms` : ''].filter(Boolean).join(' · ')}
              body={restricted ? 'Restricted terms may rule a pack out of a game you sell.' : 'Their licences ask for credit; fill it in on the pack page.'}
              action={<Button onClick={() => jump({ to: 'browse' })}>Look</Button>}
            />
          ) : (
            <Line icon={CheckCircleRounded} tone="ok" title="Every licence is on record, with its credit" />
          )}

          {backup?.target ? (
            <Line
              icon={backup.lastError ? ErrorOutlineRounded : BackupOutlined}
              tone={backup.lastError ? 'bad' : since !== null && since > 7 ? 'warn' : 'ok'}
              title={backup.lastError ? 'The last backup didn’t finish' : since === null ? 'Backups are set up, none made yet' : since === 0 ? 'Backed up today' : `Backed up ${since} day${since === 1 ? '' : 's'} ago`}
              {...(backup.lastError ? { body: backup.lastError } : {})}
              action={<Button onClick={() => jump({ to: 'settings', section: 'backups' })}>Backups</Button>}
            />
          ) : (
            <Line icon={WarningAmberRounded} tone="warn" title="No backups for this library" body="One copy is no copy: a drive, a cloud drive or a server will do." action={<Button onClick={() => jump({ to: 'settings', section: 'backups' })}>Set up</Button>} />
          )}

          {sync?.enabled && (
            <Line
              icon={SyncOutlined}
              tone={sync.running ? 'ok' : 'warn'}
              title={sync.running ? `Syncing with ${sync.devices.filter((d) => d.shared).length} computer${sync.devices.filter((d) => d.shared).length === 1 ? '' : 's'}` : 'Sync is on but not running'}
              action={<Button onClick={() => jump({ to: 'settings', section: 'sync' })}>Sync</Button>}
            />
          )}
        </div>

        <div style={{ padding: '4px 20px 12px' }}>
          {ANSWERS.map((a) => (
            <Answer key={a.q} {...a} />
          ))}
        </div>

        <div style={{ position: 'sticky', bottom: 0, display: 'flex', gap: 8, padding: '10px 20px', borderTop: `1px solid ${md('outlineVariant')}`, background: mdAlpha('surfaceContainerHigh', 0.98) }}>
          <Button
            startIcon={<KeyboardOutlined />}
            onClick={() => {
              setAnchor(null);
              useShortcuts.getState().toggle();
            }}
          >
            Keyboard shortcuts
          </Button>
          <div style={{ flex: 1 }} />
          <Button onClick={() => jump({ to: 'settings' })}>Settings</Button>
        </div>
      </Popover>
    </>
  );
}
