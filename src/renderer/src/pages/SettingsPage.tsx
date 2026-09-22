import Check from '@mui/icons-material/Check';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReportConsent, ThemeMode } from '@shared/types';
import { call } from '../api';
import { formatBytes } from '../components/labels';
import { SegmentedButton } from '../components/SegmentedButton';
import { failed, notify } from '../notices/store';
import { useReportProblem } from '../reports/ReportProblem';
import { useLibraryRecord, useLibraryState } from '../state/library';
import { useAppInfo, useSettings, useUpdateSettings } from '../state/queries';
import { md } from '../theme';
import { schemeFromSeed } from '../theme/m3';
import { Page } from './Placeholder';
import { BackupSettings } from './settings/BackupSettings';
import { SyncSettings } from './settings/SyncSettings';
import { Group, Row } from './settings/parts';

/** The optional tools, with their licences, credited in About. */
const TOOLS = [
  { name: 'Kopia', licence: 'Apache-2.0', url: 'https://kopia.io' },
  { name: 'rclone', licence: 'MIT', url: 'https://rclone.org' },
  { name: 'Syncthing', licence: 'MPL-2.0', url: 'https://syncthing.net' },
];

/** Seeds for the colour scheme; each gives a full Material 3 palette in light and dark. */
const SEEDS = ['#3f6f8f', '#4758a9', '#6750a4', '#a4506b', '#a0522d', '#8a6d1f', '#3b7a4a', '#2f7a78'];

export function SettingsPage() {
  const settings = useSettings().data;
  const record = useLibraryRecord();
  const update = useUpdateSettings();
  const info = useAppInfo().data;
  const library = useLibraryState().data;
  const client = useQueryClient();
  const thumbs = useQuery({ queryKey: ['thumbs-size'], queryFn: () => call('thumbs:size') });
  const reports = useQuery({ queryKey: ['reports-status'], queryFn: () => call('reports:status'), staleTime: 0 }).data;
  const [busy, setBusy] = useState<string | null>(null);
  if (!settings) return null;

  const run = async (what: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(what);
    try {
      await fn();
      notify.success(done);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page title="Settings">
      <div style={{ maxWidth: 820, padding: '8px 32px 48px' }}>
        <Group title="Appearance">
          <Row title="Theme" body="Follow the system, or always light or dark.">
            <SegmentedButton<ThemeMode>
              label="Theme"
              value={settings.theme}
              onChange={(theme) => update.mutate({ theme })}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Row>
          <Row title="Colour" body="Every colour in the app is derived from this one.">
            <div style={{ display: 'flex', gap: 8 }}>
              {SEEDS.map((seed) => {
                const s = schemeFromSeed(seed, false);
                const on = settings.seedColor.toLowerCase() === seed;
                return (
                  <ButtonBase
                    key={seed}
                    aria-label={`Colour ${seed}`}
                    aria-pressed={on}
                    onClick={() => update.mutate({ seedColor: seed })}
                    sx={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', outline: on ? `2px solid ${md('onSurface')}` : 'none', outlineOffset: 2 }}
                  >
                    {/* A button can't be a grid itself, so the colours sit in one. */}
                    <span style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}>
                      <span style={{ background: s.primary, gridRow: 'span 2' }} />
                      <span style={{ background: s.secondaryContainer }} />
                      <span style={{ background: s.tertiary }} />
                    </span>
                    {on && <Check sx={{ position: 'relative', color: '#fff', fontSize: 18 }} />}
                  </ButtonBase>
                );
              })}
            </div>
          </Row>
        </Group>

        <Group title="Library">
          <Row title={library?.status === 'ready' ? library.library.name : 'No library open'} body={library?.status === 'ready' ? library.library.path : undefined}>
            <Button variant="outlined" onClick={() => void call('library:close')}>
              Switch library
            </Button>
          </Row>
          <Row title="Read the library again" body="Reads every pack from scratch. Useful after moving or editing files by hand; Tessera normally notices on its own.">
            <Button disabled={busy === 'reindex'} onClick={() => void run('reindex', () => call('library:reindex'), 'The library has been read again.')}>
              {busy === 'reindex' ? 'Reading…' : 'Read again'}
            </Button>
          </Row>
          <Row title="Thumbnails" body={`${formatBytes(thumbs.data ?? 0)} of pictures, drawn from the packs. Clearing them frees the space; they’re drawn again as you browse.`}>
            <Button
              disabled={busy === 'thumbs'}
              onClick={() =>
                void run(
                  'thumbs',
                  async () => {
                    await call('thumbs:clear');
                    await client.invalidateQueries({ queryKey: ['thumbs-size'] });
                  },
                  'Thumbnails cleared.',
                )
              }
            >
              Clear
            </Button>
          </Row>
        </Group>

        <Group title="Backups">
          <BackupSettings />
        </Group>

        <Group title="Sync between computers">
          <SyncSettings />
        </Group>

        <Group title="Adding packs">
          <Row title="Skip the Inbox when the licence is clear" body="Packs whose download states its licence, from a site Tessera knows, go straight into the library. Off: every new pack waits in the Inbox for you.">
            <Switch checked={record?.skipInboxWhenSure ?? true} onChange={(_, v) => void call('library:setPrefs', { skipInboxWhenSure: v }).catch((e: unknown) => failed(e))} />
          </Row>
        </Group>

        <Group title="Privacy and problems">
          {reports?.available ? (
            <Row title="Error reports" body="Errors are always kept on this computer. Sending them helps fix problems; names of files, packs and folders are taken out first, and nothing says who you are.">
              <SegmentedButton<ReportConsent>
                label="Error reports"
                value={settings.errorReports}
                onChange={(errorReports) => update.mutate({ errorReports })}
                options={[
                  { value: 'ask', label: 'Ask' },
                  { value: 'always', label: 'Send' },
                  { value: 'never', label: 'Don’t send' },
                ]}
              />
            </Row>
          ) : (
            <Row title="Error reports" body="Errors are kept on this computer only: this copy of Tessera has nowhere to send them. You can still send a report yourself." />
          )}
          <Row title="Report a problem" body="Say what went wrong. The report adds this session’s errors and the recent log, and you see all of it first.">
            <Button onClick={() => useReportProblem.getState().show()}>Report…</Button>
          </Row>
          <Row title="Logs" body="What Tessera has written down, including the record of errors.">
            <Button onClick={() => void call('app:showLogs')}>Show logs</Button>
          </Row>
        </Group>

        <Group title="About">
          <Row title={`Tessera ${info?.version ?? ''}`} body={info ? `Electron ${info.versions.electron} · Chromium ${info.versions.chrome} · Node ${info.versions.node}` : undefined} />
          <Row
            title="Tools Tessera can use"
            body={
              <>
                {TOOLS.map((t, i) => (
                  <span key={t.name}>
                    {i > 0 && ' · '}
                    <a href={t.url} target="_blank" rel="noreferrer" style={{ color: md('primary') }}>
                      {t.name}
                    </a>{' '}
                    ({t.licence})
                  </span>
                ))}
                . Each is its own open-source project; Tessera downloads the official builds, or uses the ones you installed.
              </>
            }
          />
        </Group>
      </div>
    </Page>
  );
}
