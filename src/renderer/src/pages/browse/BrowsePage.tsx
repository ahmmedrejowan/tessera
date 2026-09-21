import SearchOffOutlined from '@mui/icons-material/SearchOffOutlined';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { AssetRow, PackRow } from '@shared/query';
import { call } from '../../api';
import { EmptyState } from '../../components/EmptyState';
import { VirtualGrid } from '../../components/VirtualGrid';
import { activeFilterCount, browseQuery, useBrowse } from '../../state/browse';
import { useIndexVersion, useLibraryId } from '../../state/library';
import { useNav } from '../../state/nav';
import { usePagedRows } from '../../state/paged';
import { AssetTile, TILE_LABEL_HEIGHT } from './AssetTile';
import { BrowseToolbar } from './BrowseToolbar';
import { DetailsSheet } from './DetailsSheet';
import { FilterPane } from './FilterPane';
import { coverHeight, PACK_LABEL_HEIGHT, PackCard } from './PackCard';

/** The value after it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Selection by click: plain click picks one, ⌘/Ctrl adds or removes, Shift extends from the
 * last plain click. The clicked item is also shown in the details sheet.
 */
function useSelection<T>(ids: (index: number) => T | undefined) {
  const { selection, anchor, select } = useBrowse();
  return useCallback(
    (e: MouseEvent, id: T, index: number) => {
      if (e.shiftKey && anchor !== null) {
        const [a, b] = anchor < index ? [anchor, index] : [index, anchor];
        const range: T[] = [];
        for (let i = a; i <= b; i++) {
          const x = ids(i);
          if (x !== undefined) range.push(x);
        }
        select(range as (number | string)[]);
      } else if (e.metaKey || e.ctrlKey) {
        const next = new Set(selection);
        if (next.has(id as number | string)) next.delete(id as number | string);
        else next.add(id as number | string);
        select([...next], index);
      } else {
        select([id as number | string], index);
      }
    },
    [selection, anchor, select, ids],
  );
}

export function BrowsePage() {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const s = useBrowse();
  const go = useNav((n) => n.go);
  const text = useDebounced(s.text, 150);
  const query = useMemo(() => browseQuery({ text, filters: s.filters, includeSupport: s.includeSupport }), [text, s.filters, s.includeSupport]);
  // "Best match" without search words means browsing: assets grouped by pack, then folder.
  const assetSort = !text && s.assetSort === 'relevance' ? 'pack' : s.assetSort;

  const assets = usePagedRows<AssetRow>(
    ['assets', lib, version, query, assetSort],
    (offset, limit) => call('browse:assets', query, assetSort, offset, limit),
    !!lib && s.mode === 'assets',
  );
  const packs = usePagedRows<PackRow>(
    ['packs', lib, version, query, s.packSort],
    (offset, limit) => call('browse:packs', query, s.packSort, offset, limit),
    !!lib && s.mode === 'packs',
  );
  const facets = useQuery({
    queryKey: ['facets', lib, version, query, s.mode],
    queryFn: () => call('browse:facets', query, s.mode),
    enabled: !!lib && s.filtersOpen,
    placeholderData: (p) => p,
  });

  const clickAsset = useSelection<number>((i) => assets.get(i)?.id);
  const clickPack = useSelection<string>((i) => packs.get(i)?.id);
  const current = s.mode === 'assets' ? assets : packs;

  const renderAsset = useCallback(
    (i: number, width: number) => {
      const a = assets.get(i);
      return (
        <AssetTile
          asset={a}
          width={width}
          selected={!!a && s.selection.has(a.id)}
          onClick={(e, x) => {
            clickAsset(e, x.id, i);
            s.focus({ kind: 'asset', id: x.id });
          }}
          onOpen={(x) => s.focus({ kind: 'asset', id: x.id })}
        />
      );
    },
    [assets, s, clickAsset],
  );
  const renderPack = useCallback(
    (i: number, width: number) => {
      const p = packs.get(i);
      return (
        <PackCard
          pack={p}
          width={width}
          selected={!!p && s.selection.has(p.id)}
          onClick={(e, x) => {
            clickPack(e, x.id, i);
            s.focus({ kind: 'pack', id: x.id });
          }}
          onOpen={(x) => go({ to: 'pack', id: x.id })}
        />
      );
    },
    [packs, s, clickPack, go],
  );

  // Escape clears the selection and closes the details sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) {
        s.select([], null);
        s.focus(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);

  const empty = !current.loading && current.total === 0;
  const filtering = !!text || activeFilterCount(s.filters) > 0;

  return (
    <div style={{ height: '100%', display: 'flex', minHeight: 0 }}>
      {s.filtersOpen && <FilterPane facets={facets.data} />}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <BrowseToolbar total={current.total} stale={current.stale} />
        <div style={{ height: 2 }}>{current.stale && <LinearProgress sx={{ height: 2, borderRadius: 0 }} />}</div>
        <div style={{ flex: 1, minHeight: 0 }} role="listbox" aria-multiselectable aria-label={s.mode === 'assets' ? 'Assets' : 'Packs'}>
          {empty ? (
            <EmptyState
              icon={SearchOffOutlined}
              title={filtering ? 'Nothing matches' : 'The library is empty'}
              body={
                filtering
                  ? `No ${s.mode} match${text ? ` “${text}”` : ''}${activeFilterCount(s.filters) ? ` with ${activeFilterCount(s.filters)} filter${activeFilterCount(s.filters) > 1 ? 's' : ''} on` : ''}.`
                  : 'Packs you add appear here once they have a licence and a source.'
              }
              actions={
                filtering && (
                  <>
                    {activeFilterCount(s.filters) > 0 && (
                      <Button variant="outlined" onClick={s.clearFilters}>
                        Clear filters
                      </Button>
                    )}
                    {text && <Button onClick={() => s.setText('')}>Clear search</Button>}
                  </>
                )
              }
            />
          ) : s.mode === 'assets' ? (
            <VirtualGrid
              key="assets"
              count={assets.total}
              minItemWidth={s.tileSize}
              itemHeight={(w) => w + TILE_LABEL_HEIGHT}
              gap={8}
              render={renderAsset}
              onRangeChange={assets.setVisibleRange}
            />
          ) : (
            <VirtualGrid
              key="packs"
              count={packs.total}
              minItemWidth={Math.max(200, s.tileSize * 1.4)}
              itemHeight={(w) => coverHeight(w) + PACK_LABEL_HEIGHT + 12}
              gap={16}
              render={renderPack}
              onRangeChange={packs.setVisibleRange}
            />
          )}
        </div>
      </div>
      {s.focused && <DetailsSheet item={s.focused} />}
    </div>
  );
}
