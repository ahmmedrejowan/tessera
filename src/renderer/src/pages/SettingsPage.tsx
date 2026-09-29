import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import Check from '@mui/icons-material/Check';
import TuneRounded from '@mui/icons-material/TuneRounded';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AfterDownload, ReportConsent, ThemeMode } from '@shared/types';
import { call } from '../api';
import { formatBytes, formatCount } from '../components/labels';
import { SegmentedButton } from '../components/SegmentedButton';
import { failed, notify } from '../notices/store';
import { useReportProblem } from '../reports/ReportProblem';
import { useLibraryRecord, useLibraryState } from '../state/library';
import { useAppInfo, useSettings, useUpdateSettings } from '../state/queries';
import { md } from '../theme';
import { schemeFromSeed } from '../theme/m3';
import { PAGE, Page } from './Placeholder';
import { BackupSettings } from './settings/BackupSettings';
import { BinSettings } from './settings/BinSettings';
import { PairedComputers, SyncSettings } from './settings/SyncSettings';
import { Helpers } from './settings/Helpers';
import { SiteRules } from './settings/SiteRules';
import { AgentSettings } from './settings/AgentSettings';
import { RenameLibrary } from './library/RenameLibrary';
import { tidyPath } from './library/Location';
import { Group, PartHeading, Row } from './settings/parts';
import { PreviewPacks } from './settings/PreviewPacks';
import { SideSections, sectionAnchor, useSectionSpy, type SideSection } from './settings/SideSections';


/** Seeds for the color scheme; each gives a full Material 3 palette in light and dark. */
const SEEDS = ['#3f6f8f', '#4758a9', '#6750a4', '#a4506b', '#a0522d', '#8a6d1f', '#3b7a4a', '#2f7a78'];

type Section = SideSection & { part: 'library' | 'app' };

const SECTIONS: Section[] = [
  { id: 'general', title: 'General', part: 'library', group: 'library' },
  { id: 'backups', title: 'Backups', part: 'library', group: 'library' },
  { id: 'sync', title: 'Sync', part: 'library', group: 'library' },
  { id: 'bin', title: 'Bin', part: 'library', group: 'library' },
  { id: 'storage', title: 'Previews and index', part: 'library', group: 'library' },
  { id: 'appearance', title: 'Appearance', part: 'app', group: 'app' },
  { id: 'sites', title: 'Sites', part: 'app', group: 'app' },
  { id: 'downloads', title: 'Downloads', part: 'app', group: 'app' },
  { id: 'adding', title: 'Adding and copying', part: 'app', group: 'app' },
  { id: 'agents', title: 'AI agents', part: 'app', group: 'app' },
  { id: 'computers', title: 'Paired computers', part: 'app', group: 'app' },
  { id: 'helpers', title: 'Helpers', part: 'app', group: 'app' },
  { id: 'privacy', title: 'Privacy and problems', part: 'app', group: 'app' },
];

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
  // Polled while it runs so the button turns into Stop and back again without a separate channel.
  const building = useQuery({ queryKey: ['thumbs-building'], queryFn: () => call('thumbs:building'), refetchInterval: (q) => (q.state.data ? 1500 : false) });
  // Counted again while previews are being drawn, and once more at the end: otherwise the line
  // above the button keeps reporting what the folder held before any of it was drawn.
  const cost = useQuery({ queryKey: ['thumbs-cost'], queryFn: () => call('thumbs:cost'), refetchInterval: building.data ? 2000 : false });
  const reports = useQuery({ queryKey: ['reports-status'], queryFn: () => call('reports:status'), staleTime: 0 }).data;
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [perPack, setPerPack] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const current = useSectionSpy(scroller, 'settings', SECTIONS, !!settings);

  // Opened for one section (from Home's first steps, say): go straight to it.
  useEffect(() => {
    if (!section || !settings) return;
    const t = setTimeout(() => document.getElementById(`settings-${section}`)?.scrollIntoView({ block: 'start' }), 50);
    return () => clearTimeout(t);
  }, [section, !!settings]);

  useEffect(() => {
    if (building.data === false) {
      void client.invalidateQueries({ queryKey: ['thumbs-cost'] });
      void client.invalidateQueries({ queryKey: ['thumbs-size'] });
    }
  }, [building.data]);

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
  const at = (id: string) => sectionAnchor('settings', id);

  return (
    <Page title="Settings" flush>
      <div style={{ display: 'grid', gridTemplateColumns: '248px minmax(0, 1fr)', height: '100%' }}>
        <SideSections
          prefix="settings"
          sections={SECTIONS}
          current={current}
          groups={[
            { id: 'library', label: 'Library Settings', sub: lib?.name ?? 'None open', icon: <AutoStoriesOutlined sx={{ fontSize: 19 }} /> },
            { id: 'app', label: 'App Settings', sub: 'Every library', icon: <TuneRounded sx={{ fontSize: 19 }} /> },
          ]}
        />

        <div ref={scroller} style={{ overflowY: 'auto', scrollbarGutter: 'stable', minHeight: 0 }}>
          <div style={{ maxWidth: PAGE.column, padding: '0 32px 64px' }}>
            <PartHeading part="library" name={lib?.name ?? 'This library'} />
            <div {...at('general')}>
              <Group part="library" title="General" note="What this library is called, where it lives, and closing it.">
                <Row title="Name" body={lib?.name}>
                  <Button onClick={() => setRenaming(true)}>Rename…</Button>
                </Row>
                <Row title="Folder" body={lib ? tidyPath(lib.path) : undefined}>
                  <Button onClick={() => lib && void call('fs:reveal', lib.path)}>{window.tessera.platform === 'darwin' ? 'Show in Finder' : 'Show'}</Button>
                </Row>
                <Row title="Packs Tessera is sure about" body="A license read in the pack itself, or set by your rule for its site, skips Review. Off: everything waits there.">
                  <Switch checked={record?.skipInboxWhenSure ?? true} onChange={(_, v) => void call('library:setPrefs', { skipInboxWhenSure: v }).catch(failed)} slotProps={{ input: { 'aria-label': 'Add sure packs straight to the library' } }} />
                </Row>
                <Row title="Close this library" body="Back to the start, to open or make another. Its backups and sync carry on as set.">
                  <Button variant="outlined" onClick={() => void call('library:close')}>
                    Close
                  </Button>
                </Row>
              </Group>
            </div>

            <div {...at('backups')}>
              <Group part="library" title="Backups" note="Encrypted copies of this library, kept somewhere else. Each library is backed up on its own.">
                <BackupSettings />
              </Group>
            </div>

            <div {...at('sync')}>
              <Group part="library" title="Sync" note="Keep this library the same on your other computers, over your own network.">
                <SyncSettings />
              </Group>
            </div>

            <div {...at('bin')}>
              <Group part="library" title="Bin" note="What you deleted from this library, waiting to be put back. It lives inside the library, so it travels with it.">
                <BinSettings />
              </Group>
            </div>

            <div {...at('storage')}>
              <Group part="library" title="Previews and index" note="What Tessera keeps to show and search this library quickly. Both can be made again.">
                <Row title="Read the library again" body="Reads every pack from scratch. Useful after moving or editing files by hand; Tessera normally notices on its own.">
                  <Button disabled={busy === 'reindex'} onClick={() => void run('reindex', () => call('library:reindex'), 'The library has been read again.')}>
                    {busy === 'reindex' ? 'Reading…' : 'Read again'}
                  </Button>
                </Row>
                <Row title="Previews" body={<PreviewCost cost={cost.data} />}>
                  <Button
                    disabled={busy === 'thumbs'}
                    onClick={() =>
                      void run(
                        'thumbs',
                        async () => {
                          await call('thumbs:clear');
                          await client.invalidateQueries({ queryKey: ['thumbs-size'] });
                          await client.invalidateQueries({ queryKey: ['thumbs-cost'] });
                        },
                        'Previews cleared.',
                      )
                    }
                  >
                    Clear
                  </Button>
                </Row>
                <Row title="Previews, pack by pack" body="Which packs the room went to, and what to do about each: draw the ones worth having on hand, clear the ones that are not, or turn a pack off for good.">
                  <Button onClick={() => setPerPack(true)}>Open</Button>
                </Row>
                <Row title="Draw them all now" body="Goes through every pack and draws whatever is missing, so browsing is instant afterwards and works offline. It runs in the background; carry on using Tessera while it does.">
                  {building.data ? (
                    <Button onClick={() => void call('thumbs:stopBuild').then(() => building.refetch())}>Stop</Button>
                  ) : (
                    <Button
                      onClick={() =>
                        void call('thumbs:build', null)
                          .then(() => building.refetch())
                          .then(() => notify.success('Drawing previews. The bar at the bottom shows how it is going.'))
                      }
                    >
                      Draw all
                    </Button>
                  )}
                </Row>
                {!!cost.data?.failed && (
                  <Row title="Previews that would not draw" body={`${formatCount(cost.data.failed)} file${cost.data.failed === 1 ? '' : 's'} could not be drawn and are not tried again. Clearing the markers makes Tessera try once more.`}>
                    <Button
                      disabled={busy === 'failed'}
                      onClick={() =>
                        void run(
                          'failed',
                          async () => {
                            await call('thumbs:clearSome', { failedOnly: true });
                            await client.invalidateQueries({ queryKey: ['thumbs-cost'] });
                          },
                          'They will be tried again.',
                        )
                      }
                    >
                      Try again
                    </Button>
                  </Row>
                )}
                <Row
                  title="Keep previews under"
                  body={
                    settings.previewCapMB
                      ? 'When they pass this, the ones for the packs you reach for least go first, then whatever was drawn longest ago. They are drawn again if you go back.'
                      : 'No limit: previews are kept for everything you have browsed.'
                  }
                >
                  <Select
                    size="small"
                    value={settings.previewCapMB}
                    onChange={(e) => update.mutate({ previewCapMB: Number(e.target.value) })}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value={0}>No limit</MenuItem>
                    <MenuItem value={256}>256 MB</MenuItem>
                    <MenuItem value={512}>512 MB</MenuItem>
                    <MenuItem value={1024}>1 GB</MenuItem>
                    <MenuItem value={2048}>2 GB</MenuItem>
                    <MenuItem value={5120}>5 GB</MenuItem>
                  </Select>
                </Row>
              </Group>
            </div>

            <PartHeading part="app" name="Tessera" />
            <div {...at('appearance')}>
              <Group part="app" title="Appearance" note="How Tessera looks, whichever library is open.">
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
                <Row title="Color" body="Every color in the app is derived from this one.">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {SEEDS.map((seed) => {
                      const sc = schemeFromSeed(seed, false);
                      const on = settings.seedColor.toLowerCase() === seed;
                      return (
                        <ButtonBase
                          key={seed}
                          aria-label={`Color ${seed}`}
                          aria-pressed={on}
                          onClick={() => update.mutate({ seedColor: seed })}
                          sx={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', outline: on ? `2px solid ${md('onSurface')}` : 'none', outlineOffset: 2 }}
                        >
                          {/* A button can't be a grid itself, so the colors sit in one. */}
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
              <Group part="app" title="Sites" note="Licenses Tessera should assume for the sites you download from.">
                <SiteRules />
              </Group>
            </div>

            <div {...at('downloads')}>
              <Group part="app" title="Downloads" note="What Tessera does with the links you bring, whichever library is open.">
                <Row title="When a download finishes" body={settings.afterDownload === 'ask' ? 'They wait in Downloads with an Add button.' : settings.afterDownload === 'review' ? 'Every one goes to Review, whatever its license says.' : 'A clear license goes into the library; anything unclear waits in Review.'}>
                  <SegmentedButton<AfterDownload>
                    label="When a download finishes"
                    value={settings.afterDownload}
                    onChange={(afterDownload) => update.mutate({ afterDownload })}
                    options={[
                      { value: 'add', label: 'Add them' },
                      { value: 'review', label: 'Send to Review' },
                      { value: 'ask', label: 'Leave to me' },
                    ]}
                  />
                </Row>
                <Row title="How many at once" body="Enough to keep a connection busy, few enough to stay polite to a site.">
                  <SegmentedButton<string>
                    label="How many downloads at once"
                    value={String(settings.downloadsAtOnce)}
                    onChange={(n) => update.mutate({ downloadsAtOnce: Number(n) })}
                    options={['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }))}
                  />
                </Row>
              </Group>
            </div>

            <div {...at('adding')}>
              <Group part="app" title="Adding and copying" note="What happens to your own files when they go into a library, and into a game.">
                <Row
                  title="Move files into the library"
                  body={
                    settings.moveIntoLibrary
                      ? 'The original is removed once the copy is safely in. The copy is always made and checked first, so a failure leaves you with the file you started with. Folders you point at are never emptied.'
                      : 'Your download stays where it is and Tessera works on its own copy. You can change this for one pack on the Add page.'
                  }
                >
                  <Switch
                    checked={settings.moveIntoLibrary}
                    onChange={(_, moveIntoLibrary) => update.mutate({ moveIntoLibrary })}
                    slotProps={{ input: { 'aria-label': 'Move files into the library' } }}
                  />
                </Row>
                <Row
                  title="Ask before copying into a game"
                  body={
                    settings.confirmCopyToGame
                      ? 'Shows how much is going and where it will land before anything is written.'
                      : 'Assets go straight into the game. Anything wrong with a license still stops for an answer.'
                  }
                >
                  <Switch
                    checked={settings.confirmCopyToGame}
                    onChange={(_, confirmCopyToGame) => update.mutate({ confirmCopyToGame })}
                    slotProps={{ input: { 'aria-label': 'Ask before copying into a game' } }}
                  />
                </Row>
              </Group>
            </div>

            <div {...at('agents')}>
              <Group part="app" title="AI agents" note="Let an agent work in this library while Tessera is open. It answers on this computer only.">
                <AgentSettings />
              </Group>
            </div>

            <div {...at('computers')}>
              <Group part="app" title="Paired computers" note="The computers Tessera can sync libraries with.">
                <PairedComputers />
              </Group>
            </div>

            <div {...at('helpers')}>
              <Group part="app" title="Helpers" note="Small official programs Tessera fetches for backups, cloud storage and sync.">
                <Helpers />
              </Group>
            </div>

            <div {...at('privacy')}>
              <Group part="app" title="Privacy and problems" note="What leaves this computer, and what to do when something goes wrong.">
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
      <PreviewPacks open={perPack} onClose={() => setPerPack(false)} />
      {lib && <RenameLibrary open={renaming} name={lib.name} onClose={() => setRenaming(false)} />}
    </Page>
  );
}


/** What previews cost, said in the terms that let someone do something about it. */
function PreviewCost({ cost }: { cost: { byKind: Record<string, { bytes: number; count: number }>; bytes: number; count: number } | undefined }) {
  if (!cost || !cost.count) return <>Nothing drawn yet. Pictures are made as you browse, and can always be made again.</>;
  const kinds = Object.entries(cost.byKind).sort((a, b) => b[1].bytes - a[1].bytes);
  const NAME: Record<string, string> = { model: '3D models', image: 'images', hdr: 'HDRIs', audio: 'sounds', font: 'fonts', pixels: 'Blender files' };
  return (
    <>
      {formatBytes(cost.bytes)} across {formatCount(cost.count)} picture{cost.count === 1 ? '' : 's'}. They can always be made again.
      <span style={{ display: 'block', marginTop: 4 }}>{kinds.map(([k, v]) => `${NAME[k] ?? k} ${formatBytes(v.bytes)}`).join(' · ')}</span>
    </>
  );
}
