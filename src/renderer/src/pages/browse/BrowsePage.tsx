import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import StarOutlineRounded from '@mui/icons-material/StarOutlineRounded';
import GridViewOutlined from '@mui/icons-material/GridViewOutlined';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
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
import { useIndexVersion, useLibraryId, useStats } from '../../state/library';
import { useImport } from '../../state/importer';
import AddRounded from '@mui/icons-material/AddRounded';
import { useNav } from '../../state/nav';
import { usePagedRows } from '../../state/paged';
import { Page } from '../Placeholder';
// The viewer brings three.js; it loads the first time something is opened.
const Viewer = lazy(() => import('../../viewer/Viewer').then((m) => ({ default: m.Viewer })));
import { AssetTile, TILE_LABEL_HEIGHT } from './AssetTile';
import { BrowseControls, BrowseFilters } from './BrowseToolbar';
import { DetailsSheet } from './DetailsSheet';
import { SelectionBar } from './SelectionBar';
import { starAssets, starPack } from './StarButton';
import { AssetMenu, PackMenu } from './TileMenu';
import { FilterPane, FilterRail } from './FilterPane';
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



/** What the three dots on a tile were pressed for. */
type TileMenu = { anchor: HTMLElement; index: number } & ({ kind: 'asset'; asset: AssetRow } | { kind: 'pack'; pack: PackRow });

/**
 * Nothing to show, for one of three reasons: the search and filters are too narrow, the packs
 * are still waiting in Review, or the library has nothing in it yet. Each says what to do next.
 */
function BrowseEmpty() {
  const s = useBrowse();
  const go = useNav((n) => n.go);
  const stats = useStats().data;
  const filters = activeFilterCount(s.filters);
  const what = s.mode === 'assets' ? 'assets' : 'packs';

  if (s.favourites) {
    return (
      <EmptyState
        icon={StarOutlineRounded}
        title="Nothing starred yet"
        body="The star in a tile's corner keeps a thing to hand. Starred assets also gather in a Favourites collection."
        actions={
          <Button variant="contained" onClick={() => s.setFavourites(false)}>
            Show everything
          </Button>
        }
      />
    );
  }

  if (s.text || filters) {
    return (
      <EmptyState
        icon={SearchOffOutlined}
        title="Nothing matches"
        body={`No ${what}${s.text ? ` for “${s.text}”` : ''}${filters ? ` with ${filters} filter${filters > 1 ? 's' : ''} on` : ''}.`}
        actions={
          <>
            {filters > 0 && (
              <Button variant="contained" onClick={s.clearFilters}>
                Clear filters
              </Button>
            )}
            {s.text && (
              <Button variant={filters ? 'outlined' : 'contained'} onClick={() => s.setText('')}>
                Clear the search
              </Button>
            )}
          </>
        }
      />
    );
  }

  if (stats?.inbox) {
    return (
      <EmptyState
        icon={RateReviewOutlined}
        title={stats.inbox === 1 ? 'One pack is waiting in Review' : `${stats.inbox} packs are waiting in Review`}
        body="They need a licence and a link before their assets show up here."
        actions={
          <Button variant="contained" onClick={() => go({ to: 'inbox' })}>
            Open Review
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={GridViewOutlined}
      title="Nothing to browse yet"
      body="Add a pack and its assets show up here, sorted and searchable."
      actions={
        <>
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => void useImport.getState().choose('files')}>
            Add packs
          </Button>
          <Button variant="outlined" startIcon={<DownloadOutlined />} onClick={() => go({ to: 'downloads' })}>
            Download from a link
          </Button>
        </>
      }
    />
  );
}

export function BrowsePage() {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const s = useBrowse();
  const go = useNav((n) => n.go);
  const text = useDebounced(s.text, 150);
  const query = useMemo(() => browseQuery({ text, filters: s.filters, includeSupport: s.includeSupport, favourites: s.favourites }), [text, s.filters, s.includeSupport, s.favourites]);
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
  const [menu, setMenu] = useState<TileMenu | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const columns = useRef(1);
  const setColumns = useCallback((c: number) => {
    columns.current = c;
  }, []);

  /** Add to, or take out of, what is picked. */
  const toggle = useCallback(
    (id: number | string, index: number) => {
      const next = new Set(s.selection);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      s.select([...next], index);
    },
    [s],
  );
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
            setCursor(i);
            s.focus({ kind: 'asset', id: x.id });
            if (e.shiftKey || e.metaKey || e.ctrlKey) clickAsset(e, x.id, i);
            // While things are picked out, a plain click adds to or removes from the pile.
            else if (s.selection.size > 0) toggle(x.id, i);
            else setViewing(i);
          }}
          onOpen={() => {
            setCursor(i);
            setViewing(i);
          }}
          onHold={(x) => {
            setCursor(i);
            if (!s.selection.has(x.id)) s.select([...s.selection, x.id], i);
          }}
          onMenu={(anchor, x) => setMenu({ anchor, kind: 'asset', asset: x, index: i })}
          dragItems={(x) => (s.selection.has(x.id) && s.selection.size > 1 ? call('assets:refs', [...s.selection].map(Number)) : [{ packId: x.packId, ref: x.ref }])}
        />
      );
    },
    [assets, s, clickAsset, toggle],
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
            setCursor(i);
            s.focus({ kind: 'pack', id: x.id });
            if (e.shiftKey || e.metaKey || e.ctrlKey) clickPack(e, x.id, i);
            else if (s.selection.size > 0) toggle(x.id, i);
            else go({ to: 'pack', id: x.id });
          }}
          onOpen={(x) => go({ to: 'pack', id: x.id })}
          onHold={(x) => {
            setCursor(i);
            if (!s.selection.has(x.id)) s.select([...s.selection, x.id], i);
          }}
          onMenu={(anchor, x) => setMenu({ anchor, kind: 'pack', pack: x, index: i })}
        />
      );
    },
    [packs, s, clickPack, toggle, go],
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        void call('browse:allIds', query, s.mode).then((ids) => s.select(ids));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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
      } else if (e.key === 's' || e.key === 'S') {
        // S stars: a pile all at once, or the one under the cursor, which it also un-stars.
        e.preventDefault();
        if (s.mode === 'packs') {
          if (s.selection.size) for (const id of [...s.selection].map(String)) starPack(id, true);
          else {
            const p = packs.get(at);
            if (p) starPack(p.id, !p.fav);
          }
        } else if (s.selection.size) {
          void call('assets:refs', [...s.selection].map(Number)).then((items) => starAssets(items, true));
        } else {
          const a = assets.get(at);
          if (a) starAssets([{ packId: a.packId, ref: a.ref }], !a.fav);
        }
      } else if (e.key === 'Escape') {
        s.select([], null);
        s.focus(null);
        setCursor(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s, cursor, viewing, moveTo, packs, go, query]);

  const viewed = viewing !== null ? assets.get(viewing) : undefined;

  const empty = !current.loading && current.total === 0;
  const filtering = !!text || activeFilterCount(s.filters) > 0;
  // Nothing in the library yet: no filters to show, just a way to add packs.
  const stats = useStats().data;
  // The filter pane goes only when there is nothing in the library at all: a star filter is a
  // narrowing like any other, and the facets should follow it.
  const nothingYet = stats?.assets === 0 && !filtering && !s.favourites;

  return (
    <Page title="Browse" flush actions={<BrowseControls total={current.total} stale={current.stale} />}>
      <div style={{ height: '100%', display: 'flex', minHeight: 0 }}>
        {!nothingYet && (s.filtersOpen ? <FilterPane facets={facets.data} /> : <FilterRail />)}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <BrowseFilters />
        <div style={{ height: 2 }}>{current.stale && <LinearProgress sx={{ height: 2, borderRadius: 0 }} />}</div>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }} role="listbox" aria-multiselectable aria-label={s.mode === 'assets' ? 'Assets' : 'Packs'}>
          {empty ? (
            <BrowseEmpty />
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
      </div>
      {menu?.kind === 'asset' && (
        <AssetMenu
          anchor={menu.anchor}
          asset={menu.asset}
          onClose={() => setMenu(null)}
          onOpen={() => {
            setCursor(menu.index);
            setViewing(menu.index);
          }}
        />
      )}
      {menu?.kind === 'pack' && (
        <PackMenu anchor={menu.anchor} pack={menu.pack} onClose={() => setMenu(null)} onOpen={() => go({ to: 'pack', id: menu.pack.id })} />
      )}
      {s.selection.size > 0 && viewing === null && (
        <SelectionBar
          {...(s.mode === 'packs' ? { packs: true } : {})}
          total={current.total}
          all={() => call('browse:allIds', query, s.mode)}
        />
      )}
      {s.focused && <DetailsSheet item={s.focused} />}
      {viewed && viewing !== null && (
        <Suspense fallback={null}>
        <Viewer
          asset={viewed}
          position={{ index: viewing, total: assets.total }}
          {...(viewing > 0 ? { onPrev: () => (moveTo(viewing - 1), setViewing(viewing - 1)) } : {})}
          {...(viewing < assets.total - 1 ? { onNext: () => (moveTo(viewing + 1), setViewing(viewing + 1)) } : {})}
          onClose={() => setViewing(null)}
          strip={{
            items: Array.from({ length: assets.total }, (_, i) => assets.get(i)),
            onPick: (i) => (moveTo(i), setViewing(i)),
            onNeed: assets.setVisibleRange,
          }}
        />
        </Suspense>
      )}
    </Page>
  );
}
