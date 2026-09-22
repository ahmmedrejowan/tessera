import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import Check from '@mui/icons-material/Check';
import TuneRounded from '@mui/icons-material/TuneRounded';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ReportConsent, ThemeMode } from '@shared/types';
import { call } from '../api';
import { formatBytes } from '../components/labels';
import { SegmentedButton } from '../components/SegmentedButton';
import { failed, notify } from '../notices/store';
import { useReportProblem } from '../reports/ReportProblem';
import { useLibraryRecord, useLibraryState } from '../state/library';
import { useAppInfo, useSettings, useUpdateSettings } from '../state/queries';
import { md, mdAlpha, SHAPE } from '../theme';
import { schemeFromSeed } from '../theme/m3';
import { Page } from './Placeholder';
import { BackupSettings } from './settings/BackupSettings';
import { PairedComputers, SyncSettings } from './settings/SyncSettings';
import { Helpers } from './settings/Helpers';
import { SiteRules } from './settings/SiteRules';
import { RenameLibrary } from './library/RenameLibrary';
import { tidyPath } from './library/Location';
import { Group, Row } from './settings/parts';


/** Seeds for the colour scheme; each gives a full Material 3 palette in light and dark. */
const SEEDS = ['#3f6f8f', '#4758a9', '#6750a4', '#a4506b', '#a0522d', '#8a6d1f', '#3b7a4a', '#2f7a78'];

interface Section {
  id: string;
  title: string;
  part: 'library' | 'app';
}

const SECTIONS: Section[] = [
  { id: 'general', title: 'General', part: 'library' },
  { id: 'backups', title: 'Backups', part: 'library' },
  { id: 'sync', title: 'Sync', part: 'library' },
  { id: 'storage', title: 'Previews and index', part: 'library' },
  { id: 'appearance', title: 'Appearance', part: 'app' },
  { id: 'sites', title: 'Sites', part: 'app' },
  { id: 'computers', title: 'Paired computers', part: 'app' },
  { id: 'helpers', title: 'Helpers', part: 'app' },
  { id: 'privacy', title: 'Privacy and problems', part: 'app' },
];

/**
 * Which half of Settings you are reading, kept at the top as you scroll: this library's own
 * settings, or Tessera's, which every library on this computer shares.
 */
function PartBar({ part, libraryName }: { part: Section['part']; libraryName: string }) {
  const library = part === 'library';
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        marginBottom: 24,
        borderRadius: SHAPE.lg,
        background: library ? md('secondaryContainer') : md('surfaceContainerHigh'),
        color: library ? md('onSecondaryContainer') : md('onSurface'),
        boxShadow: `0 1px 2px ${mdAlpha('shadow', 0.2)}`,
      }}
    >
      <span style={{ width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: mdAlpha(library ? 'onSecondaryContainer' : 'onSurface', 0.1), flexShrink: 0 }}>{library ? <AutoStoriesOutlined sx={{ fontSize: 20 }} /> : <TuneRounded sx={{ fontSize: 20 }} />}</span>
      <div style={{ minWidth: 0 }}>
        <Typography variant="titleSmall" noWrap>
          {library ? libraryName : 'Tessera'}
        </Typography>
        <Typography variant="bodySmall" component="div" noWrap sx={{ opacity: 0.8 }}>
          {library ? 'These settings belong to this library alone' : 'The same for every library on this computer'}
        </Typography>
      </div>
    </div>
  );
}

/**
 * Settings in two parts: this library's own (general, adding packs, backups, sync, previews), and
 * Tessera's, the same for every library (appearance, paired computers, helpers, privacy, about).
 * A list at the side jumps between sections and shows where you are.
 */
export function SettingsPage({ section }: { section?: string } = {}) {
  const settings = useSettings().data;
  const record = useLibraryRecord();
  const update = useUpdateSettings();
  const info = useAppInfo().data;
  const library = useLibraryState().data;
  const client = useQueryClient();
  const thumbs = useQuery({ queryKey: ['thumbs-size'], queryFn: () => call('thumbs:size') });
  const reports = useQuery({ queryKey: ['reports-status'], queryFn: () => call('reports:status'), staleTime: 0 }).data;
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [current, setCurrent] = useState(SECTIONS[0]!.id);
  const scroller = useRef<HTMLDivElement>(null);

  // The side list follows the scrolling: the last section whose top has reached the top.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const limit = el.getBoundingClientRect().top + 108;
      let at = SECTIONS[0]!.id;
      for (const s of SECTIONS) {
        const top = document.getElementById(`settings-${s.id}`)?.getBoundingClientRect().top;
        if (top !== undefined && top <= limit) at = s.id;
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) at = SECTIONS.at(-1)!.id;
      setCurrent(at);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [settings]);

  // Opened for one section (from Home's first steps, say): go straight to it.
  useEffect(() => {
    if (!section || !settings) return;
    const t = setTimeout(() => document.getElementById(`settings-${section}`)?.scrollIntoView({ block: 'start' }), 50);
    return () => clearTimeout(t);
  }, [section, !!settings]);

  if (!settings) return null;
  const lib = library?.status === 'ready' ? library.library : null;

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
  const jump = (id: string) => document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const at = (id: string) => ({ id: `settings-${id}`, style: { scrollMarginTop: 84 } });

  const NavGroup = ({ icon, label, name }: { icon: ReactNode; label: string; name?: string }) => (
    <div style={{ padding: '18px 12px 6px' }}>
      <Typography variant="labelLarge" noWrap sx={{ color: md('onSurface'), display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {icon}
        {label}
      </Typography>
      {name && (
        <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant'), pl: 2.5 }}>
          {name}
        </Typography>
      )}
    </div>
  );

  const navItem = (s: Section) => (
    <ButtonBase
      key={s.id}
      onClick={() => jump(s.id)}
      aria-current={current === s.id ? 'true' : undefined}
      sx={{ justifyContent: 'flex-start', height: 40, px: 1.5, borderRadius: `${SHAPE.full}px`, color: current === s.id ? md('onSecondaryContainer') : md('onSurfaceVariant'), backgroundColor: current === s.id ? md('secondaryContainer') : 'transparent', '&:hover': { backgroundColor: current === s.id ? md('secondaryContainer') : md('surfaceContainerHigh') } }}
    >
      <Typography variant="labelLarge" noWrap sx={{ fontWeight: current === s.id ? 600 : 500 }}>
        {s.title}
      </Typography>
    </ButtonBase>
  );

  return (
    <Page title="Settings" flush>
      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', height: '100%' }}>
        <nav aria-label="Settings sections" style={{ padding: '0 16px 32px 32px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          <NavGroup icon={<AutoStoriesOutlined sx={{ fontSize: 15 }} />} label="This library" name={lib?.name} />
          {SECTIONS.filter((s) => s.part === 'library').map(navItem)}
          <NavGroup icon={<TuneRounded sx={{ fontSize: 15 }} />} label="Tessera" name="Every library" />
          {SECTIONS.filter((s) => s.part === 'app').map(navItem)}
        </nav>

        <div ref={scroller} style={{ overflowY: 'auto', minHeight: 0 }}>
          <div style={{ maxWidth: 880, padding: '0 40px 64px 8px' }}>
            <PartBar part={SECTIONS.find((x) => x.id === current)?.part ?? 'library'} libraryName={lib?.name ?? 'This library'} />
            <div {...at('general')}>
              <Group title="General" note="What this library is called, where it lives, and closing it.">
                <Row title="Name" body={lib?.name}>
                  <Button onClick={() => setRenaming(true)}>Rename…</Button>
                </Row>
                <Row title="Folder" body={lib ? tidyPath(lib.path) : undefined}>
                  <Button onClick={() => lib && void call('fs:reveal', lib.path)}>{window.tessera.platform === 'darwin' ? 'Show in Finder' : 'Show'}</Button>
                </Row>
                <Row title="Close this library" body="Back to the start, to open or make another. Its backups and sync carry on as set.">
                  <Button variant="outlined" onClick={() => void call('library:close')}>
                    Close
                  </Button>
                </Row>
              </Group>
            </div>

            <div {...at('backups')}>
              <Group title="Backups" note="Encrypted copies of this library, kept somewhere else. Each library is backed up on its own.">
                <BackupSettings />
              </Group>
            </div>

            <div {...at('sync')}>
              <Group title="Sync" note="Keep this library the same on your other computers, over your own network.">
                <SyncSettings />
              </Group>
            </div>

            <div {...at('storage')}>
              <Group title="Previews and index" note="What Tessera keeps to show and search this library quickly. Both can be made again.">
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
            </div>

            <div {...at('appearance')}>
              <Group title="Appearance" note="How Tessera looks, whichever library is open.">
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
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {SEEDS.map((seed) => {
                      const sc = schemeFromSeed(seed, false);
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
                            <span style={{ background: sc.primary, gridRow: 'span 2' }} />
                            <span style={{ background: sc.secondaryContainer }} />
                            <span style={{ background: sc.tertiary }} />
                          </span>
                          {on && <Check sx={{ position: 'relative', color: '#fff', fontSize: 18 }} />}
                        </ButtonBase>
                      );
                    })}
                  </div>
                </Row>
              </Group>
            </div>

            <div {...at('sites')}>
              <Group title="Sites" note="Licences Tessera should assume for the sites you download from.">
                <SiteRules />
              </Group>
            </div>

            <div {...at('computers')}>
              <Group title="Paired computers" note="The computers Tessera can sync libraries with.">
                <PairedComputers />
              </Group>
            </div>

            <div {...at('helpers')}>
              <Group title="Helpers" note="Small official programs Tessera fetches for backups, cloud storage and sync.">
                <Helpers />
              </Group>
            </div>

            <div {...at('privacy')}>
              <Group title="Privacy and problems" note="What leaves this computer, and what to do when something goes wrong.">
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
            </div>

          </div>
        </div>
      </div>
      {lib && <RenameLibrary open={renaming} name={lib.name} onClose={() => setRenaming(false)} />}
    </Page>
  );
}
