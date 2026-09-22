import AddRounded from '@mui/icons-material/AddRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, type DragEvent, type ReactNode } from 'react';
import { hostLabel, linksIn } from '@shared/links';
import type { DownloadItem } from '@shared/types';
import { call } from '../api';
import { EmptyState } from '../components/EmptyState';
import { formatBytes } from '../components/labels';
import { SegmentedButton } from '../components/SegmentedButton';
import { failed, notify } from '../notices/store';
import { addDownloads, isGoing, queueLinks, useDownloads } from '../state/downloads';
import { useLibraryRecord } from '../state/library';
import { useSettings, useUpdateSettings } from '../state/queries';
import { md, mdAlpha, SHAPE } from '../theme';
import { PAGE, Page } from './Placeholder';

/** Sites whose asset pages Tessera can follow to the file behind them. */
const KNOWN_SITES = 'Kenney, Poly Haven, ambientCG, OpenGameArt, GitHub releases, Google Drive and Dropbox';

/** Big enough to be worth a word before it starts. */
const LARGE = 2 * 1024 * 1024 * 1024;

const speed = (n: number) => `${formatBytes(n)}/s`;

/** How long is left, roughly: nobody needs "1 m 47 s". */
function left(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '';
  if (seconds < 45) return 'less than a minute left';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `about ${mins} min left`;
  const hours = Math.floor(mins / 60);
  return `about ${hours} h ${mins % 60} min left`;
}

/** How long it took, from when it started to when it stopped. */
function took(d: DownloadItem): string {
  if (!d.startedAt || !d.finishedAt) return '';
  const s = Math.round((Date.parse(d.finishedAt) - Date.parse(d.startedAt)) / 1000);
  return s < 1 ? '' : s < 60 ? `in ${s}s` : `in ${Math.round(s / 60)} min`;
}

/** When it finished, in words. */
function when(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** What a download is doing, in a line under its name. */
function line(d: DownloadItem): string {
  const size = d.total ? `${formatBytes(d.received)} of ${formatBytes(d.total)}` : d.received ? formatBytes(d.received) : '';
  switch (d.state) {
    case 'waiting':
      return d.error ?? (d.total && d.total > LARGE ? 'Waiting its turn · a big one' : 'Waiting its turn');
    case 'running':
      return [size, d.speed ? speed(d.speed) : '', left(d.eta)].filter(Boolean).join(' · ');
    case 'paused':
      return size ? `Paused · ${size}` : 'Paused';
    case 'ready':
      return [`Downloaded · ${formatBytes(d.total ?? d.received)}`, took(d), when(d.finishedAt)].filter(Boolean).join(' · ');
    case 'added':
      return [d.packName ? `In your library as “${d.packName}”` : 'In your library', formatBytes(d.total ?? d.received), when(d.finishedAt)].filter(Boolean).join(' · ');
    case 'failed':
      return d.error ?? 'It didn’t work';
    case 'cancelled':
      return 'Stopped';
  }
}

function Section({ title, note, actions, children }: { title: string; note?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px' }}>
        <Typography variant="titleSmall" sx={{ color: md('primary') }}>
          {title}
        </Typography>
        <Typography variant="bodySmall" sx={{ flex: 1, color: md('onSurfaceVariant') }}>
          {note}
        </Typography>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Row({ d, autoAdd }: { d: DownloadItem; autoAdd: boolean }) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const act = (what: 'pause' | 'resume' | 'cancel' | 'again' | 'remove') => void call(`downloads:${what}`, d.id).catch(failed);
  const bar = d.state === 'running' || d.state === 'paused';
  const percent = d.total ? Math.min(100, Math.round((d.received / d.total) * 100)) : null;
  const tone = d.state === 'failed' ? md('error') : d.state === 'added' ? md('primary') : md('onSurfaceVariant');
  const Icon = d.state === 'failed' ? ErrorOutlineRounded : d.state === 'added' ? CheckCircleRounded : d.state === 'waiting' ? ScheduleRounded : DownloadOutlined;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
      <Icon sx={{ color: tone }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <Typography variant="titleSmall" noWrap sx={{ color: md('onSurface'), flex: 1, minWidth: 0 }}>
            {d.name}
          </Typography>
          {bar && percent !== null && (
            <Typography variant="labelMedium" sx={{ color: md('onSurfaceVariant'), fontVariantNumeric: 'tabular-nums' }}>
              {percent}%
            </Typography>
          )}
        </div>
        <Typography variant="bodySmall" component="div" noWrap sx={{ color: tone }}>
          {d.host} · {line(d)}
        </Typography>
        {bar && (
          <LinearProgress
            variant={percent === null ? 'indeterminate' : 'determinate'}
            {...(percent === null ? {} : { value: percent })}
            sx={{ mt: 1, height: 4, borderRadius: 2, backgroundColor: mdAlpha('onSurface', 0.08), opacity: d.state === 'paused' ? 0.5 : 1 }}
          />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {d.state === 'ready' && !autoAdd && (
          <Button variant="contained" onClick={() => void addDownloads([d.id])}>
            Add
          </Button>
        )}
        {(d.state === 'running' || d.state === 'waiting') && (
          <Tooltip title="Pause">
            <IconButton onClick={() => act('pause')} aria-label={`Pause ${d.name}`}>
              <PauseRounded />
            </IconButton>
          </Tooltip>
        )}
        {d.state === 'paused' && (
          <Tooltip title="Carry on">
            <IconButton onClick={() => act('resume')} aria-label={`Carry on with ${d.name}`}>
              <PlayArrowRounded />
            </IconButton>
          </Tooltip>
        )}
        {d.state === 'failed' && (
          <Tooltip title="Try again">
            <IconButton onClick={() => act('resume')} aria-label={`Try ${d.name} again`}>
              <RefreshRounded />
            </IconButton>
          </Tooltip>
        )}
        {isGoing(d) && (
          <Tooltip title="Stop">
            <IconButton onClick={() => act('cancel')} aria-label={`Stop ${d.name}`}>
              <CloseRounded />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="More">
          <IconButton onClick={(e) => setMenu(e.currentTarget)} aria-label={`More for ${d.name}`}>
            <MoreVertRounded />
          </IconButton>
        </Tooltip>
        <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { minWidth: 220 } } }}>
          <MenuItem
            onClick={() => {
              setMenu(null);
              void call('app:openExternal', d.url);
            }}
          >
            <ListItemIcon>
              <OpenInNewRounded />
            </ListItemIcon>
            <ListItemText primary="Open the link" secondary={d.host} />
          </MenuItem>
          {d.file && (
            <MenuItem
              onClick={() => {
                setMenu(null);
                void call('fs:reveal', d.file!);
              }}
            >
              <ListItemIcon>
                <FolderOpenOutlined />
              </ListItemIcon>
              <ListItemText primary="Show the file" />
            </MenuItem>
          )}
          {d.state === 'added' && (
            <MenuItem
              onClick={() => {
                setMenu(null);
                void addDownloads([d.id]);
              }}
            >
              <ListItemIcon>
                <AddRounded />
              </ListItemIcon>
              <ListItemText primary="Add to the library again" />
            </MenuItem>
          )}
          {!isGoing(d) && (
            <MenuItem
              onClick={() => {
                setMenu(null);
                act('again');
              }}
            >
              <ListItemIcon>
                <RefreshRounded />
              </ListItemIcon>
              <ListItemText primary="Download again" secondary="A fresh copy from the site" />
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setMenu(null);
              act('remove');
            }}
          >
            <ListItemIcon>
              <DeleteOutlineRounded />
            </ListItemIcon>
            <ListItemText primary="Remove from the list" secondary={d.file ? 'Deletes the downloaded file' : undefined} />
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
}

/**
 * Downloads: links the user brings — typed, pasted a line at a time, or dropped as a list — are
 * fetched here and then added to the library like any other pack, with their link on record.
 */
export function DownloadsPage() {
  const record = useLibraryRecord();
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const rows = useDownloads().data ?? [];
  const [text, setText] = useState('');
  const [over, setOver] = useState(false);
  const found = linksIn(text);
  const hosts = [...new Set(found.map((u) => hostLabel(u)))];
  const autoAdd = record?.autoAddDownloads ?? true;

  const going = rows.filter(isGoing);
  const finished = rows.filter((d) => !isGoing(d));
  const running = going.filter((d) => d.state === 'running');
  const ready = finished.filter((d) => d.state === 'ready');
  const failures = finished.filter((d) => d.state === 'failed');
  const kept = rows.filter((d) => d.file).reduce((n, d) => n + (d.total ?? d.received), 0);

  // What the whole queue is doing, as one line.
  const total = going.reduce((n, d) => n + (d.total ?? 0), 0);
  const received = going.reduce((n, d) => n + d.received, 0);
  const rate = running.reduce((n, d) => n + d.speed, 0);
  const eta = rate && total > received ? (total - received) / rate : null;
  const allPaused = !!going.length && going.every((d) => d.state === 'paused');

  const start = async () => {
    await queueLinks(text);
    setText('');
  };

  const drop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const dropped = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    const paths = window.tessera.pathsFor([...e.dataTransfer.files]);
    const inFiles = paths.length ? await call('downloads:linksIn', paths) : [];
    const links = [...linksIn(dropped), ...inFiles];
    if (!links.length) {
      notify.info('No links in that. Drop a link, or a file holding a list of them.');
      return;
    }
    await queueLinks(links.join('\n'));
  };

  return (
    <Page
      flush
      title="Downloads"
      subtitle="Links you bring, fetched and added like any other pack"
      actions={
        going.length ? (
          <Button startIcon={allPaused ? <PlayArrowRounded /> : <PauseRounded />} onClick={() => void call(allPaused ? 'downloads:resumeAll' : 'downloads:pauseAll').catch(failed)}>
            {allPaused ? 'Carry on with all' : 'Pause all'}
          </Button>
        ) : undefined
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => void drop(e)}
        style={{ padding: PAGE.body, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1060, minHeight: '100%' }}
      >
        <div style={{ padding: 20, borderRadius: SHAPE.lg, background: over ? md('primaryContainer') : md('surfaceContainerLowest'), border: `1px ${over ? 'dashed' : 'solid'} ${over ? md('primary') : md('outlineVariant')}` }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a link, or many — one per line"
            slotProps={{ input: { sx: { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13 } } }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
            <Typography variant="bodySmall" sx={{ flex: 1, color: md('onSurfaceVariant') }}>
              {found.length ? `${found.length} link${found.length > 1 ? 's' : ''} · ${hosts.slice(0, 3).join(', ')}${hosts.length > 3 ? ` and ${hosts.length - 3} more` : ''}` : 'Or drop a link here, or a file holding a list of them.'}
            </Typography>
            <Button variant="contained" startIcon={<DownloadOutlined />} disabled={!found.length} onClick={() => void start()}>
              Download
            </Button>
          </div>
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 1.5 }}>
            Asset pages from {KNOWN_SITES} lead to their file. Other links should point straight at one.
          </Typography>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '4px 16px', borderRadius: SHAPE.lg, background: md('surfaceContainerLowest') }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer', padding: '10px 0' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurface') }}>
                Add finished downloads by themselves
              </Typography>
              <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
                Ones with a clear licence go into the library; the rest wait in Review. Off: they wait here for you.
              </Typography>
            </span>
            <Switch checked={autoAdd} onChange={(_, v) => void call('library:setPrefs', { autoAddDownloads: v }).catch(failed)} slotProps={{ input: { 'aria-label': 'Add finished downloads by themselves' } }} />
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
              At once
            </Typography>
            <SegmentedButton<string>
              label="How many downloads at once"
              value={String(settings?.downloadsAtOnce ?? 3)}
              onChange={(n) => update.mutate({ downloadsAtOnce: Number(n) })}
              options={['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }))}
            />
          </div>
        </div>

        {going.length > 0 && (
          <Section
            title={running.length ? `Downloading ${running.length} of ${going.length}` : `${going.length} waiting`}
            note={[received ? `${formatBytes(received)}${total ? ` of ${formatBytes(total)}` : ''}` : '', rate ? speed(rate) : '', left(eta)].filter(Boolean).join(' · ')}
          >
            {going.map((d) => (
              <Row key={d.id} d={d} autoAdd={autoAdd} />
            ))}
          </Section>
        )}

        {finished.length > 0 && (
          <Section
            title="Finished"
            note={[`${finished.length}`, failures.length ? `${failures.length} failed` : '', kept ? `${formatBytes(kept)} kept here` : ''].filter(Boolean).join(' · ')}
            actions={
              <div style={{ display: 'flex', gap: 8 }}>
                {ready.length > 1 && !autoAdd && (
                  <Button variant="contained" startIcon={<AddRounded />} onClick={() => void addDownloads(ready.map((d) => d.id))}>
                    Add all {ready.length}
                  </Button>
                )}
                {failures.length > 1 && (
                  <Button startIcon={<RefreshRounded />} onClick={() => void call('downloads:retryFailed').catch(failed)}>
                    Try {failures.length} again
                  </Button>
                )}
                <Button onClick={() => void call('downloads:clear').catch(failed)}>Clear finished</Button>
              </div>
            }
          >
            {finished.map((d) => (
              <Row key={d.id} d={d} autoAdd={autoAdd} />
            ))}
          </Section>
        )}

        {!rows.length && (
          <div style={{ flex: 1, minHeight: 260 }}>
            <EmptyState
              icon={DownloadOutlined}
              title="Bring links, get packs"
              body="Paste the link to a pack you want — or a whole list of them — and Tessera fetches it, then adds it to your library with the link on record."
            />
          </div>
        )}
      </div>
    </Page>
  );
}
