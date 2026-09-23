import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { BUILT_WITH, HELPERS, LICENCE, LINKS } from '@shared/about';
import { parseChangelog, plainLine, releaseFor } from '@shared/changelog';
import { call, on } from '../api';
import { Logo } from '../components/Logo';
import { failed } from '../notices/store';
import { useAppInfo, useSettings, useUpdateSettings } from '../state/queries';
import { md, SHAPE } from '../theme';
import { Page } from './Placeholder';
import { Group, Row } from './settings/parts';

const open = (url: string) => void call('app:openExternal', url);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

/** A link that opens in the browser, in the app's own colour. */
function Link({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        open(href);
      }}
      style={{ color: md('primary') }}
    >
      {children}
    </a>
  );
}

/** One of Tessera's own documents, read in the app rather than taken on trust. */
function Document({ name, title, onClose }: { name: 'licence' | 'privacy'; title: string; onClose: () => void }) {
  const text = useQuery({ queryKey: ['document', name], queryFn: () => call('app:document', name) });
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: `${SHAPE.lg}px`, backgroundColor: md('surfaceContainerHigh'), backgroundImage: 'none' } } }}>
      <div style={{ padding: '20px 24px 8px' }}>
        <Typography variant="titleLarge" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
      </div>
      <div style={{ padding: '0 24px', overflow: 'auto', maxHeight: '64vh' }}>
        <Typography component="pre" variant="bodySmall" sx={{ color: md('onSurfaceVariant'), fontFamily: 'ui-monospace, Menlo, Consolas, monospace', whiteSpace: 'pre-wrap', m: 0 }}>
          {text.data ?? (text.error ? String(text.error) : 'Reading…')}
        </Typography>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 16 }}>
        <Button onClick={onClose}>Close</Button>
      </div>
    </Dialog>
  );
}

/** Changelog lines as prose and bullets, rather than the markdown they are written in. */
function Notes({ lines }: { lines: string[] }) {
  const read = lines.map(plainLine).filter((l) => l.text);
  return (
    <span style={{ display: 'block' }}>
      {read.map((line, i) => (
        <span key={`${i}-${line.text.slice(0, 16)}`} style={{ display: 'flex', gap: 8, marginTop: i ? 6 : 0 }}>
          {line.bullet && <span style={{ color: md('primary') }}>•</span>}
          <span>{line.text}</span>
        </span>
      ))}
    </span>
  );
}

/** The changelog, as the app ships it: what's in this version, and what came before. */
function useReleases() {
  const text = useQuery({ queryKey: ['document', 'changelog'], queryFn: () => call('app:document', 'changelog') }).data;
  return text ? parseChangelog(text) : [];
}

/** Whether a newer Tessera has been published, and how to get it. */
function Updates({ version }: { version: string }) {
  const client = useQueryClient();
  const settings = useSettings().data;
  const update = useUpdateSettings();
  useEffect(() => on('updates:changed', (s) => client.setQueryData(['updates'], s)), [client]);
  const status = useQuery({ queryKey: ['updates'], queryFn: () => call('updates:status'), staleTime: 0 }).data;
  const run = async (what: 'updates:check' | 'updates:download' | 'updates:openInstaller') => {
    try {
      await call(what);
    } catch (e) {
      failed(e);
    }
  };

  const title = status?.checking
    ? 'Looking…'
    : status?.newer && status.latest
      ? `Tessera ${status.latest} is out`
      : status?.error
        ? 'Couldn’t check just now'
        : status?.latest
          ? `This is the newest version (${version})`
          : `Tessera ${version}`;
  const notes = status?.newer && status.notes ? status.notes.split('\n') : null;
  const body = status?.error ?? (notes ? <Notes lines={notes} /> : `Last checked ${when(status?.lastCheckedAt ?? null)}`);

  return (
    <Group title="Updates" note="Tessera looks for a newer version and tells you. Nothing is installed without you opening it.">
      <Row title={title} body={body}>
        {status?.newer && status.installer && (
          <Button variant="contained" startIcon={<FolderOpenOutlined />} onClick={() => void run('updates:openInstaller')}>
            Show the installer
          </Button>
        )}
        {status?.newer && !status.installer && (
          <Button variant="contained" startIcon={status.downloading ? <CircularProgress size={16} /> : <DownloadOutlined />} disabled={status.downloading} onClick={() => void run('updates:download')}>
            {status.downloading ? 'Fetching…' : 'Get it'}
          </Button>
        )}
        {status?.newer && status.url && (
          <Button startIcon={<OpenInNewRounded />} onClick={() => open(status.url!)}>
            Release page
          </Button>
        )}
        <Button startIcon={status?.checking ? <CircularProgress size={16} /> : <RefreshRounded />} disabled={!!status?.checking} onClick={() => void run('updates:check')}>
          Check now
        </Button>
      </Row>
      <Row title="Check on start, and once a day" body={status?.canCheck ? 'A read of the published release list. Nothing about you or your library is sent.' : 'This build has nowhere to check yet — no releases are published.'}>
        <Switch checked={settings?.updateCheck ?? true} onChange={(_, v) => update.mutate({ updateCheck: v })} slotProps={{ input: { 'aria-label': 'Check for updates' } }} />
      </Row>
      <Row title="Fetch the installer as soon as one is found" body="It waits in Tessera’s folder until you open it — installing is always your move.">
        <Switch checked={settings?.autoInstallUpdates ?? false} onChange={(_, v) => update.mutate({ autoInstallUpdates: v })} slotProps={{ input: { 'aria-label': 'Fetch updates by themselves' } }} />
      </Row>
    </Group>
  );
}

/** What is in this version, and what came before it. */
function Versions({ version }: { version: string }) {
  const releases = useReleases();
  const [all, setAll] = useState(false);
  const current = releaseFor(releases, version);
  const earlier = releases.filter((r) => r.version !== version);

  return (
    <Group title="What’s in this version" note={current?.when ? `${version} · ${current.when}` : version}>
      <Row
        title={current ? `Tessera ${current.version}` : `Tessera ${version}`}
        body={current ? <Notes lines={current.lines} /> : 'This build ships no notes for its own version.'}
      />
      {earlier.length > 0 && (
        <Row title="Version log" body={all ? undefined : `${earlier.length} earlier version${earlier.length === 1 ? '' : 's'}`}>
          <Button onClick={() => setAll(!all)}>{all ? 'Hide' : 'Show'}</Button>
        </Row>
      )}
      {all &&
        earlier.map((r) => (
          <Row key={r.version} title={`${r.version}${r.when ? ` · ${r.when}` : ''}`} body={<Notes lines={r.lines} />} />
        ))}
    </Group>
  );
}

/**
 * About: what this build is, whether a newer one exists, what changed, the terms Tessera comes
 * under, what it is made of, who makes it and how to reach them.
 */
export function AboutPage() {
  const info = useAppInfo().data;
  const [document, setDocument] = useState<'licence' | 'privacy' | null>(null);
  const version = info?.version ?? '';

  return (
    <Page title="About" subtitle="What this build is, and what it’s made of" width={1080}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '4px 0 28px' }}>
        <span style={{ width: 72, height: 72, borderRadius: 22, display: 'grid', placeItems: 'center', background: md('surfaceContainerLow') }}>
          <Logo size={44} />
        </span>
        <div style={{ minWidth: 0 }}>
          <Typography variant="headlineSmall" sx={{ color: md('onSurface') }}>
            Tessera {version}
          </Typography>
          <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurfaceVariant') }}>
            A desktop library for game assets: every pack in one place, with its licence and source on record.
          </Typography>
          {info && (
            <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5 }}>
              Electron {info.versions.electron} · Chromium {info.versions.chrome} · Node {info.versions.node}
            </Typography>
          )}
        </div>
      </div>

      <Updates version={version} />
      <Versions version={version} />

      <Group title="Licence and privacy" note="Tessera’s own terms — not the ones your packs carry.">
        <Row title={LICENCE.name} body={LICENCE.summary}>
          <Button onClick={() => setDocument('licence')}>Read it</Button>
        </Row>
        <Row title="Privacy" body="What stays on this computer, what leaves it only when you ask, and what Tessera never does.">
          <Button onClick={() => setDocument('privacy')}>Read it</Button>
        </Row>
        <Row title="Source code" body={LINKS.repo}>
          <Button startIcon={<OpenInNewRounded />} onClick={() => open(LINKS.repo)}>
            Open
          </Button>
        </Row>
      </Group>

      <Group title="Credits" note="Tessera stands on other people’s work.">
        {HELPERS.map((h) => (
          <Row key={h.name} title={<Link href={h.url}>{h.name}</Link>} body={`${h.what} · ${h.licence} · a separate program Tessera can fetch and drive`} />
        ))}
        <Row
          title="Built with"
          body={
            <>
              {BUILT_WITH.map((b, i) => (
                <span key={b.name}>
                  {i > 0 && ' · '}
                  <Link href={b.url}>{b.name}</Link> ({b.licence})
                </span>
              ))}
            </>
          }
        />
        <Row
          title="Sample packs"
          body={
            <>
              Mini Arcade, 1-Bit Platformer Pack and Interface Sounds, by <Link href="https://kenney.nl">Kenney</Link>, under CC0. Offered on a new library’s Home to look around with.
            </>
          }
        />
      </Group>

      <Group title="Who makes it" note="One person, and the ways to reach them.">
        <Row title={LINKS.creator.name} body={LINKS.creator.what}>
          <Button startIcon={<OpenInNewRounded />} onClick={() => open(LINKS.creator.github)}>
            GitHub
          </Button>
        </Row>
        <Row title="Email" body={LINKS.email}>
          <Button startIcon={<MailOutlineRounded />} onClick={() => open(`mailto:${LINKS.email}?subject=Tessera`)}>
            Write
          </Button>
        </Row>
        <Row title="Issue tracker" body="Where bugs and ideas are decided, in the open.">
          <Button startIcon={<OpenInNewRounded />} onClick={() => open(LINKS.issues)}>
            Open
          </Button>
        </Row>
      </Group>

      <Group title="This computer" note="Where Tessera keeps its own things — never your library.">
        <Row title="Log files" body="What Tessera did, kept on this computer only.">
          <Button startIcon={<FolderOpenOutlined />} onClick={() => void call('app:showLogs')}>
            Show
          </Button>
        </Row>
      </Group>

      {document && <Document name={document} title={document === 'licence' ? LICENCE.name : 'Privacy'} onClose={() => setDocument(null)} />}
    </Page>
  );
}
