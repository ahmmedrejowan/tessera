import DeleteForeverOutlined from '@mui/icons-material/DeleteForeverOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import RestoreOutlined from '@mui/icons-material/RestoreOutlined';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { BinEntry } from '@shared/types';
import { call } from '../api';
import { EmptyState } from '../components/EmptyState';
import { formatBytes } from '../components/labels';
import { SortButton } from '../components/SortButton';
import { ask } from '../notices/dialogs';
import { failed, notify } from '../notices/store';
import { useIndexVersion, useLibraryId } from '../state/library';
import { useSettings, useUpdateSettings } from '../state/queries';
import { md, SHAPE } from '../theme';
import { Page } from './Placeholder';

export const KEEP = [
  { value: 7, label: 'A week' },
  { value: 30, label: 'A month' },
  { value: 90, label: 'Three months' },
  { value: 0, label: 'Until I empty it' },
];

/** When it went, in words. */
function when(at: string): string {
  const then = new Date(at);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days < 1) return `Today, ${then.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString([], { dateStyle: 'medium' });
}

function Entry({ entry, onDone }: { entry: BinEntry; onDone: () => void }) {
  const restore = async () => {
    try {
      await call('bin:restore', entry.id);
      notify.success('Back where it was.');
      onDone();
    } catch (e) {
      failed(e);
    }
  };
  const forGood = async () => {
    const yes = await ask<boolean>({
      tone: 'warning',
      title: `Delete ${entry.shown} for good?`,
      body: 'This is the one that cannot be undone: it goes from the disk.',
      actions: [
        { label: 'Keep it', value: false, kind: 'text' },
        { label: 'Delete for good', value: true, kind: 'danger' },
      ],
    });
    if (!yes) return;
    try {
      await call('bin:empty', [entry.id]);
      onDone();
    } catch (e) {
      failed(e);
    }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
      {entry.kind === 'pack' ? <FolderOutlined sx={{ color: md('onSurfaceVariant') }} /> : <InsertDriveFileOutlined sx={{ color: md('onSurfaceVariant') }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleSmall" noWrap sx={{ color: md('onSurface') }}>
          {entry.shown}
        </Typography>
        <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant') }}>
          {entry.kind === 'pack' ? 'A whole pack' : `In ${entry.packName}`}
          {entry.size ? ` · ${formatBytes(entry.size)}` : ''} · {when(entry.deletedAt)}
          {entry.hiddenOnly ? ' · hidden, inside its pack’s archive' : ''}
        </Typography>
      </div>
      <Button startIcon={<RestoreOutlined />} onClick={() => void restore()}>
        Put it back
      </Button>
      <Button color="error" startIcon={<DeleteForeverOutlined />} onClick={() => void forGood()}>
        For good
      </Button>
    </div>
  );
}

/**
 * The library's own bin. Everything deleted waits here, inside the library, and goes back to the
 * exact pack and folder it came from.
 */
export function BinPage() {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const client = useQueryClient();
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const bin = useQuery({ queryKey: ['bin', lib, version], queryFn: () => call('bin:list'), enabled: !!lib });
  const [sort, setSort] = useState<'when' | 'name' | 'size'>('when');
  const entries = [...(bin.data ?? [])].sort((a, b) =>
    sort === 'name' ? a.shown.localeCompare(b.shown) : sort === 'size' ? b.size - a.size : b.deletedAt.localeCompare(a.deletedAt),
  );
  const reload = () => void client.invalidateQueries({ queryKey: ['bin'] });

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
    <Page
      title="Bin"
      subtitle={entries.length ? `${entries.length} thing${entries.length === 1 ? '' : 's'} waiting · ${formatBytes(entries.reduce((n, e) => n + e.size, 0))}` : 'What you deleted from this library'}
      aside={
        <>
        <SortButton
          value={sort}
          options={[
            { value: 'when' as const, label: 'Newest first' },
            { value: 'name' as const, label: 'Name' },
            { value: 'size' as const, label: 'Largest' },
          ]}
          onChange={setSort}
          width={160}
        />
        <Select size="small" value={settings?.binKeepDays ?? 30} onChange={(e) => update.mutate({ binKeepDays: Number(e.target.value) })} sx={{ minWidth: 190 }}>
          {KEEP.map((k) => (
            <MenuItem key={k.value} value={k.value}>
              Keep for {k.label.toLowerCase()}
            </MenuItem>
          ))}
        </Select>
        </>
      }
      actions={
        <Button color="error" startIcon={<DeleteForeverOutlined />} disabled={!entries.length} onClick={() => void empty()}>
          Empty the bin
        </Button>
      }
    >
      {entries.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((e) => (
            <Entry key={e.id} entry={e} onDone={reload} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={DeleteOutlineRounded}
          title="The bin is empty"
          body="Packs and files you delete wait here, inside the library, until you empty the bin or the time above runs out. Putting one back returns it to the pack and folder it came from."
        />
      )}
    </Page>
  );
}
