import ArrowBack from '@mui/icons-material/ArrowBack';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
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
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import type { AssetRow, BrowseQuery, Filters } from '@shared/query';
import { call } from '../../api';
import { EmptyState } from '../../components/EmptyState';
import { notify } from '../../notices/store';
import { VirtualGrid } from '../../components/VirtualGrid';
import { useBrowse } from '../../state/browse';
import { useCollections } from '../../state/collections';
import { useIndexVersion, useLibraryId } from '../../state/library';
import { useNav } from '../../state/nav';
import { usePagedRows } from '../../state/paged';
import { md, mdAlpha, SHAPE } from '../../theme';
import { AssetTile, TILE_LABEL_HEIGHT } from '../browse/AssetTile';
import { NameDialog } from './CollectionMenu';

const Viewer = lazy(() => import('../../viewer/Viewer').then((m) => ({ default: m.Viewer })));

/** One collection: its assets, with ways to rename, prune or delete it. */
export function CollectionPage({ id }: { id: string }) {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const { go, goBack, back } = useNav();
  const tileSize = useBrowse((s) => s.tileSize);
  const collection = useCollections().data?.find((c) => c.id === id);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [viewing, setViewing] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
            const next = new Set(e.metaKey || e.ctrlKey ? selected : []);
            if (next.has(x.id)) next.delete(x.id);
            else next.add(x.id);
            setSelected(next);
          }}
          onOpen={() => setViewing(i)}
          dragItems={(x) => [{ packId: x.packId, ref: x.ref }]}
        />
      );
    },
    [rows, selected],
  );

  if (!collection) return null;
  const smart = collection.kind === 'smart';

  const remove = async () => {
    const items = await call('assets:refs', [...selected]);
    await call('collections:change', id, { remove: items });
    notify.success(`Removed ${items.length} from ${collection.name}.`);
    setSelected(new Set());
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
          <VirtualGrid count={rows.total} minItemWidth={tileSize} itemHeight={(w) => w + TILE_LABEL_HEIGHT} gap={8} render={render} onRangeChange={rows.setVisibleRange} />
        )}
        {!smart && selected.size > 0 && (
          <div style={{ position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px 8px 20px', borderRadius: SHAPE.full, background: md('inverseSurface'), color: md('inverseOnSurface'), boxShadow: `0 4px 16px ${mdAlpha('shadow', 0.25)}` }}>
            <Typography variant="labelLarge">{selected.size} selected</Typography>
            <Button startIcon={<RemoveCircleOutlineOutlined />} onClick={() => void remove()} sx={{ color: md('inversePrimary') }}>
              Remove from collection
            </Button>
          </div>
        )}
      </div>
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
