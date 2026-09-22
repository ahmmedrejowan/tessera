import SearchOffOutlined from '@mui/icons-material/SearchOffOutlined';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { AssetRow, PackRow } from '@shared/query';
import { call } from '../../api';
import { EmptyState } from '../../components/EmptyState';
import { VirtualGrid } from '../../components/VirtualGrid';
import { activeFilterCount, browseQuery, useBrowse } from '../../state/browse';
import { useIndexVersion, useLibraryId } from '../../state/library';
import { useNav } from '../../state/nav';
import { usePagedRows } from '../../state/paged';
// The viewer brings three.js; it loads the first time something is opened.
const Viewer = lazy(() => import('../../viewer/Viewer').then((m) => ({ default: m.Viewer })));
import { AssetTile, TILE_LABEL_HEIGHT } from './AssetTile';
import { BrowseToolbar } from './BrowseToolbar';
import { DetailsSheet } from './DetailsSheet';
import { SelectionBar } from './SelectionBar';
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

  const [viewing, setViewing] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const columns = useRef(1);
  const setColumns = useCallback((c: number) => {
    columns.current = c;
  }, []);

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
            setCursor(i);
            s.focus({ kind: 'asset', id: x.id });
          }}
          onOpen={() => {
            setCursor(i);
            setViewing(i);
          }}
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
            setCursor(i);
            s.focus({ kind: 'pack', id: x.id });
          }}
          onOpen={(x) => go({ to: 'pack', id: x.id })}
        />
      );
    },
    [packs, s, clickPack, go],
  );

  // Results changed: the cursor and any open preview point at other things now.
  useEffect(() => {
    setCursor(null);
    setViewing(null);
  }, [query, s.mode, assetSort, s.packSort]);

  /** Move the cursor to an item: select it, show it in the details sheet, keep it in view. */
  const moveTo = useCallback(
    (i: number) => {
      const total = s.mode === 'assets' ? assets.total : packs.total;
      if (!total) return;
      const next = Math.max(0, Math.min(total - 1, i));
      setCursor(next);
      if (s.mode === 'assets') {
        const a = assets.get(next);
        if (a) {
          s.select([a.id], next);
          s.focus({ kind: 'asset', id: a.id });
        }
      } else {
        const p = packs.get(next);
        if (p) {
          s.select([p.id], next);
          s.focus({ kind: 'pack', id: p.id });
        }
      }
    },
    [s, assets, packs],
  );

  // Keyboard: arrows move through the grid, Space previews, Enter opens, Escape clears.
  useEffect(() => {
    if (viewing !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const cols = columns.current;
      const at = cursor ?? -1;
      const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
      if (e.key in moves) {
        e.preventDefault();
        moveTo(at < 0 ? 0 : at + moves[e.key]!);
      } else if (e.key === ' ' && at >= 0 && s.mode === 'assets') {
        e.preventDefault();
        setViewing(at);
      } else if (e.key === 'Enter' && at >= 0) {
        e.preventDefault();
        if (s.mode === 'assets') setViewing(at);
        else {
          const p = packs.get(at);
          if (p) go({ to: 'pack', id: p.id });
        }
      } else if (e.key === 'Escape') {
        s.select([], null);
        s.focus(null);
        setCursor(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s, cursor, viewing, moveTo, packs, go]);

  const viewed = viewing !== null ? assets.get(viewing) : undefined;

  const empty = !current.loading && current.total === 0;
  const filtering = !!text || activeFilterCount(s.filters) > 0;

  return (
    <div style={{ height: '100%', display: 'flex', minHeight: 0 }}>
      {s.filtersOpen && <FilterPane facets={facets.data} />}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <BrowseToolbar total={current.total} stale={current.stale} />
        <div style={{ height: 2 }}>{current.stale && <LinearProgress sx={{ height: 2, borderRadius: 0 }} />}</div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }} role="listbox" aria-multiselectable aria-label={s.mode === 'assets' ? 'Assets' : 'Packs'}>
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
              onColumns={setColumns}
              scrollToIndex={viewing ?? cursor}
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
              onColumns={setColumns}
              scrollToIndex={cursor}
            />
          )}
        </div>
      </div>
      {s.mode === 'assets' && s.selection.size > 0 && viewing === null && <SelectionBar />}
      {s.focused && <DetailsSheet item={s.focused} />}
      {viewed && viewing !== null && (
        <Suspense fallback={null}>
        <Viewer
          asset={viewed}
          position={{ index: viewing, total: assets.total }}
          {...(viewing > 0 ? { onPrev: () => (moveTo(viewing - 1), setViewing(viewing - 1)) } : {})}
          {...(viewing < assets.total - 1 ? { onNext: () => (moveTo(viewing + 1), setViewing(viewing + 1)) } : {})}
          onClose={() => setViewing(null)}
        />
        </Suspense>
      )}
    </div>
  );
}
