import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
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

/** The whole licence, for reading in the app rather than taking on trust. */
function LicenceText({ onClose }: { onClose: () => void }) {
  const text = useQuery({ queryKey: ['licence'], queryFn: () => call('app:licence') });
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: `${SHAPE.lg}px`, backgroundColor: md('surfaceContainerHigh'), backgroundImage: 'none' } } }}>
      <div style={{ padding: '20px 24px 8px' }}>
        <Typography variant="titleLarge" sx={{ color: md('onSurface') }}>
          {LICENCE.name}
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

/** Whether a newer Tessera has been published, and how to get it. */
function Updates() {
  const client = useQueryClient();
  const settings = useSettings().data;
  const update = useUpdateSettings();
  useEffect(() => on('updates:changed', (s) => client.setQueryData(['updates'], s)), [client]);
  const status = useQuery({ queryKey: ['updates'], queryFn: () => call('updates:status'), staleTime: 0 }).data;
  const check = async () => {
    try {
      await call('updates:check');
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
          ? 'This is the newest version'
          : 'Not checked yet';
  const body = status?.error ?? (status?.newer ? status.notes : null) ?? `Last checked ${when(status?.lastCheckedAt ?? null)}`;

  return (
    <Group title="Updates" note="Tessera looks for a newer version and tells you; it never installs anything by itself.">
      <Row title={title} body={body}>
        {status?.newer && status.url && (
          <Button variant="contained" startIcon={<OpenInNewRounded />} onClick={() => open(status.url!)}>
            Get it
          </Button>
        )}
        <Button startIcon={status?.checking ? <CircularProgress size={16} /> : <RefreshRounded />} disabled={!!status?.checking} onClick={() => void check()}>
          Check now
        </Button>
      </Row>
      <Row title="Check on start, and once a day" body={status?.canCheck ? undefined : 'This build has nowhere to check yet — no releases are published.'}>
        <Switch checked={settings?.updateCheck ?? true} onChange={(_, v) => update.mutate({ updateCheck: v })} slotProps={{ input: { 'aria-label': 'Check for updates' } }} />
      </Row>
    </Group>
  );
}

/**
 * About: what this build is, whether a newer one exists, the terms Tessera itself comes under,
 * and what it is made of — the separate programs it can fetch, and the libraries it is built on.
 */
export function AboutPage() {
  const info = useAppInfo().data;
  const [licence, setLicence] = useState(false);

  return (
    <Page title="About" subtitle="What this build is, and what it’s made of" width={880}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '4px 0 28px' }}>
        <span style={{ width: 72, height: 72, borderRadius: 22, display: 'grid', placeItems: 'center', background: md('surfaceContainerLow') }}>
          <Logo size={44} />
        </span>
        <div style={{ minWidth: 0 }}>
          <Typography variant="headlineSmall" sx={{ color: md('onSurface') }}>
            Tessera {info?.version ?? ''}
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

      <Updates />

      <Group title="Licence" note="Tessera’s own terms — not the ones your packs carry.">
        <Row title={LICENCE.name} body={LICENCE.summary}>
          <Button onClick={() => setLicence(true)}>Read it</Button>
        </Row>
        <Row title="Source code" body={LINKS.repo}>
          <Button startIcon={<OpenInNewRounded />} onClick={() => open(LINKS.repo)}>
            Open
          </Button>
        </Row>
      </Group>

      <Group title="Helpers" note="Separate programs Tessera can fetch and drive. Each stays its own project, under its own licence.">
        {HELPERS.map((h) => (
          <Row key={h.name} title={<Link href={h.url}>{h.name}</Link>} body={`${h.what} · ${h.licence}`} />
        ))}
      </Group>

      <Group title="Built with" note="The libraries Tessera itself is made from.">
        <Row
          title="Open-source libraries"
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
              Mini Arcade, 1-Bit Platformer Pack and Interface Sounds, by <Link href="https://kenney.nl">Kenney</Link>, under CC0.
            </>
          }
        />
      </Group>

      <Group title="This computer" note="Where Tessera keeps its own things — never your library.">
        <Row title="Log files" body="What Tessera did, kept on this computer only.">
          <Button startIcon={<FolderOpenOutlined />} onClick={() => void call('app:showLogs')}>
            Show
          </Button>
        </Row>
      </Group>

      {licence && <LicenceText onClose={() => setLicence(false)} />}
    </Page>
  );
}
