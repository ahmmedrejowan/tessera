import BackupOutlined from '@mui/icons-material/BackupOutlined';
import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import GavelOutlined from '@mui/icons-material/GavelOutlined';
import KeyboardOutlined from '@mui/icons-material/KeyboardOutlined';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import SyncOutlined from '@mui/icons-material/SyncOutlined';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState, type ComponentType } from 'react';
import { LINKS } from '@shared/about';
import { call } from '../api';
import { useReportProblem } from '../reports/ReportProblem';
import { useLibraryRecord, useStats } from '../state/library';
import { useNav } from '../state/nav';
import { md } from '../theme';
import { useShortcuts } from '../shell/Shortcuts';
import { Page } from './Placeholder';
import { Group, Row } from './settings/parts';

/** The questions Tessera raises by working the way it does, answered. */
export const ANSWERS: { q: string; a: string }[] = [
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
    q: 'What can Downloads fetch?',
    a: 'Links you bring. Asset pages from Kenney, Poly Haven, ambientCG, OpenGameArt, GitHub releases, Google Drive and Dropbox lead to the file behind them; other links should point straight at a file. Pages that need a browser or a sign-in are left to your browser.',
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
    a: 'Nothing, unless you ask. Downloads go to the sites you give it, archive.org copies are made only when you leave that switch on, the update check reads a list of releases, and error reports are never sent without your say-so.',
  },
  {
    q: 'Can I have more than one library?',
    a: 'Yes. Each has its own folder, its own backups, sync and rules; the switcher at the top right moves between them. Projects and the sites you’ve settled are shared by all of them.',
  },
];

function Answer({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${md('outlineVariant')}` }}>
      <ButtonBase onClick={() => setOpen(!open)} sx={{ width: '100%', justifyContent: 'space-between', gap: 2, py: 2, textAlign: 'left' }}>
        <Typography variant="bodyLarge" sx={{ color: md('onSurface') }}>
          {q}
        </Typography>
        <ExpandMoreRounded sx={{ color: md('onSurfaceVariant'), transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </ButtonBase>
      {open && (
        <Typography variant="bodyMedium" component="p" sx={{ color: md('onSurfaceVariant'), pb: 2, m: 0, maxWidth: 720 }}>
          {a}
        </Typography>
      )}
    </div>
  );
}

function State({ icon: Icon, tone, title, body, action }: { icon: ComponentType<{ sx?: object }>; tone: 'ok' | 'warn' | 'bad'; title: string; body?: string; action?: { label: string; run: () => void } }) {
  const color = tone === 'bad' ? md('error') : tone === 'warn' ? md('tertiary') : md('primary');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: `1px solid ${md('outlineVariant')}` }}>
      <Icon sx={{ color }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="bodyLarge" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        {body && (
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
            {body}
          </Typography>
        )}
      </div>
      {action && <Button onClick={action.run}>{action.label}</Button>}
    </div>
  );
}

const days = (iso: string | null) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null);

/** How many things on this page want attention, for the dot on the top bar's question mark. */
export function useWorries(): number {
  const stats = useStats().data;
  const health = useQuery({ queryKey: ['health-worries'], queryFn: () => call('library:health'), staleTime: 60_000 }).data;
  const backup = useQuery({ queryKey: ['backup-worries'], queryFn: () => call('backup:status'), staleTime: 60_000 }).data;
  const since = days(backup?.lastBackupAt ?? null);
  return (stats?.inbox ? 1 : 0) + ((health?.noCreditLine.length ?? 0) + (health?.restricted.length ?? 0) ? 1 : 0) + (!backup?.target || backup.lastError || (since !== null && since > 7) ? 1 : 0);
}

/**
 * Help: how this library is doing and what to do about it, answers to the questions Tessera
 * raises, and the ways to reach a person — a problem report with the logs attached, the issue
 * tracker, or an email.
 */
export function HelpPage() {
  const go = useNav((s) => s.go);
  const record = useLibraryRecord();
  const stats = useStats().data;
  const report = useReportProblem();  // the dialog itself lives in ReportsHost
  const health = useQuery({ queryKey: ['health-help'], queryFn: () => call('library:health'), staleTime: 0 }).data;
  const backup = useQuery({ queryKey: ['backup-help'], queryFn: () => call('backup:status'), staleTime: 0 }).data;
  const sync = useQuery({ queryKey: ['sync-help'], queryFn: () => call('sync:status'), staleTime: 0 }).data;

  const review = stats?.inbox ?? 0;
  const needCredit = health?.noCreditLine.length ?? 0;
  const restricted = health?.restricted.length ?? 0;
  const since = days(backup?.lastBackupAt ?? null);
  const open = (url: string) => void call('app:openExternal', url);

  return (
    <Page title="Help" subtitle="How your library is doing, how Tessera works, and how to reach a person" width={880}>
      <Group title={record?.name ?? 'This library'} note="What’s worth seeing to, and where to see to it.">
        {review > 0 ? (
          <State icon={RateReviewOutlined} tone="warn" title={review === 1 ? 'One pack is waiting in Review' : `${review} packs are waiting in Review`} body="They need a licence and a link before they join the library." action={{ label: 'Open Review', run: () => go({ to: 'inbox' }) }} />
        ) : (
          <State icon={CheckCircleRounded} tone="ok" title="Nothing is waiting in Review" />
        )}
        {needCredit || restricted ? (
          <State
            icon={GavelOutlined}
            tone={restricted ? 'bad' : 'warn'}
            title={[needCredit ? `${needCredit} pack${needCredit === 1 ? '' : 's'} without a credit line` : '', restricted ? `${restricted} with restricted terms` : ''].filter(Boolean).join(' · ')}
            body={restricted ? 'Restricted terms may rule a pack out of a game you sell.' : 'Their licences ask for credit; fill it in on the pack page.'}
            action={{ label: 'Browse', run: () => go({ to: 'browse' }) }}
          />
        ) : (
          <State icon={CheckCircleRounded} tone="ok" title="Every licence is on record, with its credit" />
        )}
        {backup?.target ? (
          <State
            icon={backup.lastError ? ErrorOutlineRounded : BackupOutlined}
            tone={backup.lastError ? 'bad' : since !== null && since > 7 ? 'warn' : 'ok'}
            title={backup.lastError ? 'The last backup didn’t finish' : since === null ? 'Backups are set up, none made yet' : since === 0 ? 'Backed up today' : `Backed up ${since} day${since === 1 ? '' : 's'} ago`}
            {...(backup.lastError ? { body: backup.lastError } : {})}
            action={{ label: 'Backups', run: () => go({ to: 'settings', section: 'backups' }) }}
          />
        ) : (
          <State icon={WarningAmberRounded} tone="warn" title="No backups for this library" body="One copy is no copy: a drive, a cloud drive or a server will do." action={{ label: 'Set up', run: () => go({ to: 'settings', section: 'backups' }) }} />
        )}
        {sync?.enabled && (
          <State
            icon={SyncOutlined}
            tone={sync.running ? 'ok' : 'warn'}
            title={sync.running ? `Syncing with ${sync.devices.filter((d) => d.shared).length} computer${sync.devices.filter((d) => d.shared).length === 1 ? '' : 's'}` : 'Sync is on but not running'}
            action={{ label: 'Sync', run: () => go({ to: 'settings', section: 'sync' }) }}
          />
        )}
      </Group>

      <Group title="Questions" note="The short answers. Longer ones live in the project’s readme.">
        <div style={{ marginTop: -6 }}>
          {ANSWERS.map((a) => (
            <Answer key={a.q} {...a} />
          ))}
        </div>
      </Group>

      <Group title="Get in touch" note="Tessera is one person’s project; what you send is read by a person.">
        <Row title="Something went wrong" body="A report with what happened, this session’s errors and the recent log — you see exactly what it says before it goes anywhere.">
          <Button variant="contained" startIcon={<BugReportOutlined />} onClick={() => report.show()}>
            Report a problem
          </Button>
        </Row>
        <Row title="Ideas, or something that got in your way" body="The issue tracker is the best place; it’s where everything is decided.">
          <Button startIcon={<ForumOutlined />} onClick={() => open(LINKS.issues)}>
            Issue tracker
          </Button>
        </Row>
        <Row title="Email" body={LINKS.email}>
          <Button startIcon={<MailOutlineRounded />} onClick={() => open(`mailto:${LINKS.email}?subject=Tessera`)}>
            Write
          </Button>
        </Row>
        <Row title="The project" body={LINKS.repo}>
          <Button startIcon={<OpenInNewRounded />} onClick={() => open(LINKS.repo)}>
            Open
          </Button>
        </Row>
      </Group>

      <Group title="Getting around" note="Everything has a keyboard way in.">
        <Row title="Keyboard shortcuts" body="Every one Tessera knows, for this computer’s keyboard.">
          <Button startIcon={<KeyboardOutlined />} onClick={() => useShortcuts.getState().toggle()}>
            Show
          </Button>
        </Row>
        <Row title="About Tessera" body="Version, updates, licence and what it’s built from.">
          <Button onClick={() => go({ to: 'about' })}>About</Button>
        </Row>
      </Group>

    </Page>
  );
}
