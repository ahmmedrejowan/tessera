import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, type DragEvent } from 'react';
import { hostLabel, linksIn } from '@shared/links';
import type { DownloadItem } from '@shared/types';
import { call } from '../api';
import { EmptyState } from '../components/EmptyState';
import { formatBytes } from '../components/labels';
import { failed, notify } from '../notices/store';
import { addDownloads, isGoing, queueLinks, useDownloads } from '../state/downloads';
import { useLibraryRecord } from '../state/library';
import { md, mdAlpha, SHAPE } from '../theme';
import { Page } from './Placeholder';

const rate = (n: number) => `${formatBytes(n)}/s`;
/** Big enough to be worth a word before it starts. */
const LARGE = 2 * 1024 * 1024 * 1024;

/** What a download is doing, in a line under its name. */
function line(d: DownloadItem): string {
  const size = d.total ? `${formatBytes(d.received)} of ${formatBytes(d.total)}` : d.received ? formatBytes(d.received) : '';
  switch (d.state) {
    case 'waiting':
      return 'Waiting its turn';
    case 'running':
      return [size, d.speed ? rate(d.speed) : ''].filter(Boolean).join(' · ');
    case 'paused':
      return size ? `Paused · ${size}` : 'Paused';
    case 'ready':
      return `Downloaded · ${formatBytes(d.total ?? d.received)}`;
    case 'added':
      return d.packName ? `In your library as “${d.packName}”` : 'In your library';
    case 'failed':
      return d.error ?? 'It didn’t work';
    case 'cancelled':
      return 'Stopped';
  }
}

function Row({ d, autoAdd }: { d: DownloadItem; autoAdd: boolean }) {
  const act = (what: 'pause' | 'resume' | 'cancel') => void call(`downloads:${what}`, d.id).catch(failed);
  const bar = d.state === 'running' || d.state === 'paused';
  const tone = d.state === 'failed' ? md('error') : d.state === 'added' ? md('primary') : md('onSurfaceVariant');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
      <span style={{ color: tone, display: 'flex' }}>
        {d.state === 'failed' ? <ErrorOutlineRounded /> : d.state === 'added' ? <CheckCircleRounded /> : <DownloadOutlined />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleSmall" noWrap sx={{ color: md('onSurface') }}>
          {d.name}
        </Typography>
        <Typography variant="bodySmall" component="div" noWrap sx={{ color: tone }}>
          {d.host} · {line(d)}
          {d.state === 'waiting' && d.total && d.total > LARGE ? ' · a big one' : ''}
        </Typography>
        {bar && (
          <LinearProgress
            variant={d.total ? 'determinate' : 'indeterminate'}
            value={d.total ? Math.min(100, (d.received / d.total) * 100) : undefined}
            sx={{ mt: 1, height: 4, borderRadius: 2, backgroundColor: mdAlpha('onSurface', 0.08) }}
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
            <IconButton onClick={() => act('pause')}>
              <PauseRounded />
            </IconButton>
          </Tooltip>
        )}
        {d.state === 'paused' && (
          <Tooltip title="Carry on">
            <IconButton onClick={() => act('resume')}>
              <PlayArrowRounded />
            </IconButton>
          </Tooltip>
        )}
        {d.state === 'failed' && (
          <>
            <Tooltip title="Open the link in your browser">
              <IconButton onClick={() => void call('app:openExternal', d.url)}>
                <OpenInNewRounded />
              </IconButton>
            </Tooltip>
            <Tooltip title="Try again">
              <IconButton onClick={() => act('resume')}>
                <RefreshRounded />
              </IconButton>
            </Tooltip>
          </>
        )}
        {(d.state === 'ready' || d.state === 'added') && d.file && (
          <Tooltip title="Show the file">
            <IconButton onClick={() => void call('fs:reveal', d.file!)}>
              <FolderOpenOutlined />
            </IconButton>
          </Tooltip>
        )}
        {isGoing(d) && (
          <Tooltip title="Stop and remove">
            <IconButton onClick={() => act('cancel')}>
              <CloseRounded />
            </IconButton>
          </Tooltip>
        )}
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
  const rows = useDownloads().data ?? [];
  const [text, setText] = useState('');
  const [over, setOver] = useState(false);
  const found = linksIn(text);
  const hosts = [...new Set(found.map((u) => hostLabel(u)))];
  const autoAdd = record?.autoAddDownloads ?? true;
  const kept = rows.filter((d) => d.file).reduce((n, d) => n + (d.total ?? d.received), 0);

  const start = async () => {
    await queueLinks(text);
    setText('');
  };

  const setAutoAdd = async (on: boolean) => {
    try {
      await call('library:setPrefs', { autoAddDownloads: on });
    } catch (e) {
      failed(e);
    }
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
    <Page title="Downloads">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => void drop(e)}
        style={{ padding: '0 32px 32px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1000, minHeight: '100%' }}
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
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 16px', cursor: 'pointer' }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurface') }}>
              Add finished downloads by themselves
            </Typography>
            <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
              Ones with a clear licence go into the library; the rest wait in Review. Off: they wait here for you.
            </Typography>
          </span>
          <Switch
            checked={autoAdd}
            onChange={(_, v) => void setAutoAdd(v)}
            slotProps={{ input: { 'aria-label': 'Add finished downloads by themselves' } }}
          />
        </label>

        {rows.length ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((d) => (
                <Row key={d.id} d={d} autoAdd={autoAdd} />
              ))}
            </div>
            {kept > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
                <Typography variant="bodySmall" sx={{ flex: 1, color: md('onSurfaceVariant') }}>
                  Downloaded files kept here: {formatBytes(kept)}. Your library keeps its own copy of everything added.
                </Typography>
                <Button onClick={() => void call('downloads:clear').catch(failed)}>Clear finished</Button>
              </div>
            )}
          </>
        ) : (
          <div style={{ flex: 1, minHeight: 280 }}>
            <EmptyState
              icon={DownloadOutlined}
              title="Bring links, get packs"
              body="Paste the link to a pack you want — or a whole list of them — and Tessera fetches it, then adds it to your library with the link on record. Links to files it can fetch; pages that need a browser it will say so about."
            />
          </div>
        )}
      </div>
    </Page>
  );
}
