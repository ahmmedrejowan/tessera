import DeleteForeverOutlined from '@mui/icons-material/DeleteForeverOutlined';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { call } from '../../api';
import { formatBytes } from '../../components/labels';
import { ask } from '../../notices/dialogs';
import { failed, notify } from '../../notices/store';
import { useIndexVersion, useLibraryId } from '../../state/library';
import { useSettings, useUpdateSettings } from '../../state/queries';
import { md, SHAPE } from '../../theme';
import { Row } from './parts';

const KEEP = [
  { value: 7, label: 'A week' },
  { value: 30, label: 'A month' },
  { value: 90, label: 'Three months' },
  { value: 0, label: 'Until I empty it' },
];

/** When it went, in words. */
function when(at: string): string {
  const then = new Date(at);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days < 1) return then.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString([], { dateStyle: 'medium' });
}

/**
 * The library's own wastebasket: what was deleted, waiting to be put back. It lives inside the
 * library, so it travels with it and restores to exactly where things were.
 */
export function BinSettings() {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const client = useQueryClient();
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const bin = useQuery({ queryKey: ['bin', lib, version], queryFn: () => call('bin:list'), enabled: !!lib });
  const entries = bin.data ?? [];
  const reload = () => void client.invalidateQueries({ queryKey: ['bin'] });

  const restore = async (id: string) => {
    try {
      await call('bin:restore', id);
      notify.success('Back where it was.');
      reload();
    } catch (e) {
      failed(e);
    }
  };

  const empty = async () => {
    const yes = await ask<boolean>({
      tone: 'warning',
      title: entries.length === 1 ? 'Empty the bin?' : `Empty the bin, all ${entries.length} things?`,
      body: 'This is the one that cannot be undone: the files go from the disk for good.',
      actions: [
        { label: 'Keep them', value: false, kind: 'text' },
        { label: 'Empty it', value: true, kind: 'danger' },
      ],
    });
    if (!yes) return;
    try {
      const n = await call('bin:empty');
      notify.success(n === 1 ? 'One thing gone for good.' : `${n} things gone for good.`);
      reload();
    } catch (e) {
      failed(e);
    }
  };

  return (
    <>
      <Row title="Keep deleted things for" body="After that they go for good, on the next read of the library.">
        <Select size="small" value={settings?.binKeepDays ?? 30} onChange={(e) => update.mutate({ binKeepDays: Number(e.target.value) })} sx={{ minWidth: 180 }}>
          {KEEP.map((k) => (
            <MenuItem key={k.value} value={k.value}>
              {k.label}
            </MenuItem>
          ))}
        </Select>
      </Row>
      <Row
        title={entries.length ? `${entries.length} thing${entries.length === 1 ? '' : 's'} waiting` : 'The bin is empty'}
        body={entries.length ? `${formatBytes(entries.reduce((n, e) => n + e.size, 0))} in all. Putting something back returns it to the pack and folder it came from.` : 'Deleted packs and files wait here until you empty the bin, or until the time above runs out.'}
      >
        <Button color="error" startIcon={<DeleteForeverOutlined />} disabled={!entries.length} onClick={() => void empty()}>
          Empty the bin
        </Button>
      </Row>
      {entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12 }}>
          {entries.map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: SHAPE.sm, background: md('surfaceContainerLow') }}>
              {e.kind === 'pack' ? <FolderOutlined sx={{ fontSize: 18, color: md('onSurfaceVariant') }} /> : <InsertDriveFileOutlined sx={{ fontSize: 18, color: md('onSurfaceVariant') }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography variant="bodyMedium" noWrap sx={{ color: md('onSurface') }}>
                  {e.shown}
                </Typography>
                <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant') }}>
                  {e.kind === 'pack' ? 'A whole pack' : e.packName}
                  {e.size ? ` · ${formatBytes(e.size)}` : ''} · {when(e.deletedAt)}
                  {e.hiddenOnly ? ' · hidden, inside its pack’s archive' : ''}
                </Typography>
              </div>
              <Button size="small" onClick={() => void restore(e.id)}>
                Put it back
              </Button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
