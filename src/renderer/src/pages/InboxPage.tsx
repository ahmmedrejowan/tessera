import AddOutlined from '@mui/icons-material/AddOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { PackRow } from '@shared/query';
import { call } from '../api';
import { EmptyState } from '../components/EmptyState';
import { formatBytes, sourceName, typeSummary } from '../components/labels';
import { LicenceChip } from '../components/LicenceChip';
import { failed, notify } from '../notices/store';
import { useImport } from '../state/importer';
import { useIndexVersion, useLibraryId } from '../state/library';
import { useNav } from '../state/nav';
import { md, SHAPE } from '../theme';
import { coverHeight, PackCard } from './browse/PackCard';
import { Page } from './Placeholder';

/** What a pack still needs before it can join the library. */
const missing = (p: PackRow) => [!p.licence && 'licence', !p.source && 'source'].filter(Boolean) as string[];

function InboxRow({ pack, onMove }: { pack: PackRow; onMove: () => void }) {
  const go = useNav((s) => s.go);
  const needs = missing(pack);
  return (
    <div className="tile" onClick={() => go({ to: 'pack', id: pack.id })} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: 10, borderRadius: SHAPE.lg, cursor: 'default' }}>
      <div style={{ width: 120, height: coverHeight(120) + 12, overflow: 'hidden', pointerEvents: 'none', flexShrink: 0 }}>
        <PackCard pack={pack} width={120} selected={false} onClick={() => undefined} onOpen={() => undefined} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Typography variant="titleMedium" noWrap sx={{ color: md('onSurface') }}>
          {pack.name}
        </Typography>
        <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
          {typeSummary(pack.types)} · {formatBytes(pack.size)}
        </Typography>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <LicenceChip id={pack.licence} />
          <Typography variant="labelMedium" sx={{ color: pack.source ? md('onSurfaceVariant') : md('error') }}>
            {sourceName(pack.source) ?? 'Source unknown'}
          </Typography>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
        {needs.length ? (
          <Button variant="outlined" onClick={() => go({ to: 'pack', id: pack.id })}>
            Add {needs.join(' and ')}
          </Button>
        ) : (
          <Button variant="contained" startIcon={<CheckCircleOutlined />} onClick={onMove}>
            Move to library
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Packs waiting to join the library. A pack needs a licence and a source first — the check that
 * keeps assets with unknown terms out of your games.
 */
export function InboxPage() {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const choose = useImport((s) => s.choose);
  const [busy, setBusy] = useState(false);
  const query = { scope: 'inbox' as const, text: '', filters: {} };
  const packs = useQuery({ queryKey: ['inbox', lib, version], queryFn: () => call('browse:packs', query, 'added', 0, 1000), enabled: !!lib, placeholderData: (p) => p }).data;
  const rows = packs?.rows ?? [];
  const ready = rows.filter((p) => !missing(p).length);

  const move = async (list: PackRow[]) => {
    setBusy(true);
    let moved = 0;
    for (const p of list) {
      try {
        await call('pack:status', p.id, 'library');
        moved++;
      } catch (e) {
        failed(e);
      }
    }
    setBusy(false);
    if (moved) notify.success(`Moved ${moved} pack${moved > 1 ? 's' : ''} to the library.`);
  };

  return (
    <Page
      title="Inbox"
      actions={
        ready.length > 1 && (
          <Button variant="contained" disabled={busy} startIcon={<CheckCircleOutlined />} onClick={() => void move(ready)}>
            Move {ready.length} ready packs
          </Button>
        )
      }
    >
      {packs && !rows.length ? (
        <EmptyState
          icon={InboxOutlined}
          title="Nothing waiting"
          body="New packs wait here until they have a licence and a source, so nothing with unknown terms slips into your games. Packs that state their licence skip the wait."
          actions={
            <Button variant="contained" startIcon={<AddOutlined />} onClick={() => void choose('files')}>
              Add packs
            </Button>
          }
        />
      ) : (
        <div style={{ padding: '4px 22px 32px', display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 1100 }}>
          {rows.length > 0 && (
            <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), px: 1.25, pb: 1 }}>
              {rows.length} waiting · {ready.length} ready to move. Open a pack to check what was detected and add anything missing.
            </Typography>
          )}
          {rows.map((p) => (
            <InboxRow key={p.id} pack={p} onMove={() => void move([p])} />
          ))}
        </div>
      )}
    </Page>
  );
}
