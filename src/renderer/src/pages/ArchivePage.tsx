import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import Button from '@mui/material/Button';
import { useCallback, useState } from 'react';
import type { PackRow, PackSort } from '@shared/query';
import { call } from '../api';
import { EmptyState } from '../components/EmptyState';
import { SortButton } from '../components/SortButton';
import { VirtualGrid } from '../components/VirtualGrid';
import { useBrowse } from '../state/browse';
import { useIndexVersion, useLibraryId } from '../state/library';
import { useNav } from '../state/nav';
import { usePagedRows } from '../state/paged';
import { archivePack } from './browse/archiving';
import { coverHeight, PACK_LABEL_HEIGHT, PackCard } from './browse/PackCard';
import { PackMenu } from './browse/TileMenu';
import { Page } from './Placeholder';

/**
 * Packs put away: kept in full, out of the way of browsing. They keep their licences, their
 * collections and their place in any game they were copied into; they simply aren't browsed.
 */
export function ArchivePage() {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const go = useNav((n) => n.go);
  const tileSize = useBrowse((s) => s.tileSize);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; pack: PackRow } | null>(null);

  const query = { scope: 'library' as const, text: '', filters: {}, archived: 'only' as const };
  const [sort, setSort] = useState<PackSort>('name');
  const packs = usePagedRows<PackRow>(['archived', lib, version, sort], (offset, limit) => call('browse:packs', query, sort, offset, limit), !!lib);

  const render = useCallback(
    (i: number, width: number) => {
      const p = packs.get(i);
      return (
        <PackCard
          pack={p}
          width={width}
          selected={false}
          onClick={(_, x) => go({ to: 'pack', id: x.id })}
          onOpen={(x) => go({ to: 'pack', id: x.id })}
          onMenu={(anchor, x) => setMenu({ anchor, pack: x })}
        />
      );
    },
    [packs, go],
  );

  return (
    <Page
      title="Archive"
      subtitle="Packs kept in full, out of the way of browsing"
      flush
      aside={
        <SortButton
          value={sort}
          options={[
            { value: 'name' as const, label: 'Name' },
            { value: 'added' as const, label: 'Recently added' },
            { value: 'count' as const, label: 'Most assets' },
            { value: 'size' as const, label: 'Largest' },
          ]}
          onChange={setSort}
          width={186}
        />
      }
      actions={
        packs.total > 0 ? (
          <Button
            startIcon={<UnarchiveOutlined />}
            onClick={async () => {
              for (const id of (await call('browse:allIds', query, 'packs')).map(String)) await archivePack(id, false);
            }}
          >
            Bring them all back
          </Button>
        ) : undefined
      }
    >
      <div style={{ height: '100%', minHeight: 0 }}>
        {!packs.loading && packs.total === 0 ? (
          <EmptyState
            icon={ArchiveOutlined}
            title="The archive is empty"
            body="Archiving a pack keeps it in full and takes it out of browsing, for the ones you want to keep but rarely reach for. A pack card’s menu has the way to do it."
            actions={
              <Button variant="contained" onClick={() => go({ to: 'browse' })}>
                Browse the library
              </Button>
            }
          />
        ) : (
          <VirtualGrid
            label="Archived packs"
            count={packs.total}
            minItemWidth={Math.max(200, tileSize * 1.4)}
            itemHeight={(w) => coverHeight(w) + PACK_LABEL_HEIGHT + 12}
            gap={16}
            padding={32}
            render={render}
            onRangeChange={packs.setVisibleRange}
          />
        )}
      </div>
      {menu && <PackMenu anchor={menu.anchor} pack={menu.pack} onClose={() => setMenu(null)} onOpen={() => go({ to: 'pack', id: menu.pack.id })} />}
    </Page>
  );
}
