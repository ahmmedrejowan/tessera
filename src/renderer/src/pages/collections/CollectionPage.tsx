import ArrowBack from '@mui/icons-material/ArrowBack';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DoneAllRounded from '@mui/icons-material/DoneAllRounded';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import Close from '@mui/icons-material/Close';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import RemoveCircleOutlineOutlined from '@mui/icons-material/RemoveCircleOutlineOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { AssetRow, BrowseQuery, Filters } from '@shared/query';
import { call } from '../../api';
import { EmptyState } from '../../components/EmptyState';
import { formatBytes, formatCount } from '../../components/labels';
import { failed, notify } from '../../notices/store';
import { VirtualGrid } from '../../components/VirtualGrid';
import { useBrowse } from '../../state/browse';
import { useCollections } from '../../state/collections';
import { useIndexVersion, useLibraryId } from '../../state/library';
import { useNav } from '../../state/nav';
import { usePagedRows } from '../../state/paged';
import { md, mdAlpha, SHAPE } from '../../theme';
import { AssetTile, TILE_LABEL_HEIGHT } from '../browse/AssetTile';
import { removeAssets } from '../browse/deleting';
import { AssetMenu } from '../browse/TileMenu';
import { CopyButton } from '../projects/CopyButton';
import { NameDialog } from './CollectionMenu';

const Viewer = lazy(() => import('../../viewer/Viewer').then((m) => ({ default: m.Viewer })));

/** Buttons in the bar keep to one line, however many of them there are. */
const action = { color: md('inversePrimary'), whiteSpace: 'nowrap', flexShrink: 0 };

/** One collection: its assets, with ways to rename, prune or delete it. */
export function CollectionPage({ id }: { id: string }) {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const { go, goBack, back } = useNav();
  const tileSize = useBrowse((s) => s.tileSize);
  const collection = useCollections().data?.find((c) => c.id === id);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  /** Add to, or take out of, what is picked. */
  const pick = useCallback((id: number) => {
    setSelected((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [size, setSize] = useState<number | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; asset: AssetRow; index: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let live = true;
    setSize(null);
    if (!selected.size) return;
    void call('browse:sum', 'assets', [...selected])
      .then((n) => live && setSize(n))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [selected]);

  const query: BrowseQuery = useMemo(
    () =>
      collection?.query
        ? { scope: 'library', text: collection.query.text, filters: collection.query.filters as Filters, includeSupport: collection.query.includeSupport }
        : { scope: 'all', text: '', filters: {}, collectionId: id },
    [collection?.query, id],
  );
  const rows = usePagedRows<AssetRow>(['collection', lib, version, id, query], (o, l) => call('browse:assets', query, 'relevance', o, l), !!lib && !!collection);

  const render = useCallback(
    (i: number, width: number) => {
      const a = rows.get(i);
      return (
        <AssetTile
          asset={a}
          width={width}
          selected={!!a && selected.has(a.id)}
          onClick={(e, x) => {
            // A click opens; holding, right-clicking or a modifier picks things out, as in Browse.
            if (!e.metaKey && !e.ctrlKey && selected.size === 0) {
              setViewing(i);
              return;
            }
            pick(x.id);
          }}
          onOpen={() => setViewing(i)}
          onHold={(x) => setSelected((was) => (was.has(x.id) ? was : new Set([...was, x.id])))}
          onMenu={(anchor, x) => setMenu({ anchor, asset: x, index: i })}
          dragItems={(x) => [{ packId: x.packId, ref: x.ref }]}
        />
      );
    },
    [rows, selected, pick],
  );

  if (!collection) return null;
  const smart = collection.kind === 'smart';

  const remove = async (ids: number[]) => {
    try {
      const items = await call('assets:refs', ids);
      await call('collections:change', id, { remove: items });
      notify.success(items.length === 1 ? `Taken out of ${collection.name}.` : `Took ${items.length} out of ${collection.name}.`);
      setSelected(new Set());
    } catch (e) {
      failed(e);
    }
  };

  const openInBrowse = () => {
    const s = useBrowse.getState();
    s.setMode('assets');
    s.clearFilters();
    for (const [facet, values] of Object.entries(collection.query?.filters ?? {})) s.setFilter(facet as never, values);
    s.setText(collection.query?.text ?? '');
    s.setIncludeSupport(collection.query?.includeSupport ?? false);
    go({ to: 'browse' });
  };

  const viewed = viewing !== null ? rows.get(viewing) : undefined;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '20px 32px 12px' }}>
        {back.length > 0 && (
          <IconButton onClick={goBack} aria-label="Back" sx={{ mt: -0.5, ml: -1.5 }}>
            <ArrowBack />
          </IconButton>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography variant="headlineSmall" component="h1" sx={{ color: md('onSurface'), display: 'flex', alignItems: 'center', gap: 1 }}>
            {smart && <AutoAwesomeOutlined sx={{ color: md('tertiary') }} />}
            {collection.name}
          </Typography>
          <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), mt: 0.5 }}>
            {rows.total} asset{rows.total === 1 ? '' : 's'}
            {smart && ` · a saved search${collection.query?.text ? ` for “${collection.query.text}”` : ''}; it updates as your library changes`}
          </Typography>
          {collection.description && (
            <Typography variant="bodyMedium" sx={{ color: md('onSurface'), mt: 1, maxWidth: 760 }}>
              {collection.description}
            </Typography>
          )}
        </div>
        {smart && (
          <Button variant="outlined" startIcon={<SearchOutlined />} onClick={openInBrowse}>
            Open in Browse
          </Button>
        )}
        <Tooltip title="Rename">
          <IconButton onClick={() => setRenaming(true)} aria-label="Rename">
            <EditOutlined />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete collection">
          <IconButton onClick={() => setDeleting(true)} aria-label="Delete collection">
            <DeleteOutlined />
          </IconButton>
        </Tooltip>
      </header>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {!rows.loading && rows.total === 0 ? (
          <EmptyState
            icon={SearchOutlined}
            title={smart ? 'Nothing matches this search yet' : 'Nothing in this collection yet'}
            body={smart ? 'It fills itself in as packs that match are added.' : 'Pick assets in Browse and add them here, from any pack.'}
            actions={
              <Button variant="contained" onClick={() => go({ to: 'browse' })}>
                {smart ? 'Browse the library' : 'Pick assets'}
              </Button>
            }
          />
        ) : (
          <VirtualGrid label="Assets in this collection" count={rows.total} minItemWidth={tileSize} itemHeight={(w) => w + TILE_LABEL_HEIGHT} gap={8} render={render} onRangeChange={rows.setVisibleRange} />
        )}
        {selected.size > 0 && (
          <div style={{ position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 20px', borderRadius: SHAPE.full, background: md('inverseSurface'), color: md('inverseOnSurface'), boxShadow: `0 4px 16px ${mdAlpha('shadow', 0.25)}` }}>
            <Typography variant="labelLarge" sx={{ mr: 1, whiteSpace: 'nowrap' }}>
              {formatCount(selected.size)} picked{size !== null ? ` · ${formatBytes(size)}` : ''}
            </Typography>
            {rows.total > selected.size && (
              <Button startIcon={<DoneAllRounded />} onClick={async () => setSelected(new Set((await call('browse:allIds', query, 'assets')).map(Number)))} sx={action}>
                Pick all {formatCount(rows.total)}
              </Button>
            )}
            <CopyButton items={() => call('assets:refs', [...selected])} variant="text" size="medium" color={md('inversePrimary')} />
            {!smart && (
              <Button startIcon={<RemoveCircleOutlineOutlined />} onClick={() => void remove([...selected])} sx={action}>
                Take them out
              </Button>
            )}
            <Button
              startIcon={<DeleteOutlineRounded />}
              onClick={async () => {
                if (await removeAssets(() => call('assets:refs', [...selected]), selected.size)) setSelected(new Set());
              }}
              sx={action}
            >
              Delete
            </Button>
            <IconButton aria-label="Clear selection" onClick={() => setSelected(new Set())} sx={{ color: md('inverseOnSurface') }}>
              <Close fontSize="small" />
            </IconButton>
          </div>
        )}
      </div>
      {menu && (
        <AssetMenu
          anchor={menu.anchor}
          asset={menu.asset}
          onClose={() => setMenu(null)}
          onOpen={() => setViewing(menu.index)}
          {...(smart ? {} : { extra: { icon: <RemoveCircleOutlineOutlined fontSize="small" />, primary: 'Take it out of this collection', run: () => void remove([menu.asset.id]) } })}
        />
      )}
      <NameDialog
        open={renaming}
        title="Rename collection"
        initial={collection.name}
        action="Rename"
        onClose={() => setRenaming(false)}
        onDone={async (name, description) => {
          setRenaming(false);
          await call('collections:change', id, { name, ...(description ? { description } : {}) });
        }}
      />
      <Dialog open={deleting} onClose={() => setDeleting(false)}>
        <DialogTitle>Delete “{collection.name}”?</DialogTitle>
        <DialogContent>
          <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
            Only the collection goes. The assets in it stay in their packs.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              setDeleting(false);
              await call('collections:change', id, { delete: true });
              notify.success(`Deleted “${collection.name}”.`);
              go({ to: 'collections' });
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      {viewed && viewing !== null && (
        <Suspense fallback={null}>
          <Viewer
            asset={viewed}
            position={{ index: viewing, total: rows.total }}
            {...(viewing > 0 ? { onPrev: () => setViewing(viewing - 1) } : {})}
            {...(viewing < rows.total - 1 ? { onNext: () => setViewing(viewing + 1) } : {})}
            onClose={() => setViewing(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
