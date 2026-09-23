import ArrowBack from '@mui/icons-material/ArrowBack';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DoneAllRounded from '@mui/icons-material/DoneAllRounded';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import Chip from '@mui/material/Chip';
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
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { FAVOURITES, hasRules } from '@shared/collection';
import { licenceInfo } from '@shared/licences';
import type { AssetRow, BrowseQuery, Filters, PackRow } from '@shared/query';
import { call } from '../../api';
import { EmptyState } from '../../components/EmptyState';
import { formatBytes, formatCount } from '../../components/labels';
import { failed, notify, useNotices } from '../../notices/store';
import { VirtualGrid } from '../../components/VirtualGrid';
import { useBrowse } from '../../state/browse';
import { useCollections } from '../../state/collections';
import { useIndexVersion, useLibraryId } from '../../state/library';
import { useNav } from '../../state/nav';
import { usePagedRows } from '../../state/paged';
import { md, mdAlpha, SHAPE } from '../../theme';
import { AssetTile, TILE_LABEL_HEIGHT } from '../browse/AssetTile';
import { removeAssets } from '../browse/deleting';
import { PackCard } from '../browse/PackCard';
import { AssetMenu, PackMenu } from '../browse/TileMenu';
import { CopyButton } from '../projects/CopyButton';
import { useProjects } from '../../state/projects';
import { CollectionDialog } from './CollectionDialog';

const Viewer = lazy(() => import('../../viewer/Viewer').then((m) => ({ default: m.Viewer })));

/** Buttons in the bar keep to one line, however many of them there are. */
const action = { color: md('inversePrimary'), whiteSpace: 'nowrap', flexShrink: 0 };

/** A saved search has no packs of its own: what it shows comes from the search. */
const smartOf = (c: { kind: string }) => c.kind === 'smart';

/** One collection: the packs and assets in it, with ways to rename, prune or delete it. */
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
  const projects = useProjects().data ?? [];
  const [size, setSize] = useState<number | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; asset: AssetRow; index: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Toasts rise above the bar while it is showing, as they do in Browse.
  const picking = selected.size > 0;
  useEffect(() => {
    if (!picking) return;
    useNotices.getState().setLift(68);
    return () => useNotices.getState().setLift(0);
  }, [picking]);

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
        ? { scope: 'library', text: collection.query.text, filters: collection.query.filters as Filters, includeSupport: collection.query.includeSupport, favourites: collection.query.favourites }
        : { scope: 'all', text: '', filters: {}, collectionId: id },
    [collection?.query, id],
  );
  const rows = usePagedRows<AssetRow>(['collection', lib, version, id, query], (o, l) => call('browse:assets', query, 'relevance', o, l), !!lib && !!collection);
  // Packs put in whole show as packs: their assets came with them and aren't listed one by one.
  const inPacks = useQuery({
    queryKey: ['collection-packs', lib, version, id],
    queryFn: () => call('browse:packs', { scope: 'all', text: '', filters: {}, collectionId: id }, 'name', 0, 500),
    enabled: !!lib && !!collection && !smartOf(collection),
    placeholderData: (p) => p,
  }).data?.rows ?? [];
  const [packMenu, setPackMenu] = useState<{ anchor: HTMLElement; pack: PackRow } | null>(null);

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
  // What it holds in all: the loose assets and everything inside its packs.
  const held = rows.total + inPacks.reduce((n, p) => n + p.assetCount, 0);
  const forProject = projects.find((p) => p.id === collection.projectId) ?? null;
  const ruleChips = [
    ...collection.rules.licences.map((l) => licenceInfo(l)?.short ?? l),
    ...collection.rules.creators,
    ...collection.rules.styles,
    ...collection.rules.tags,
  ];
  /** Everything in the collection as files: the loose assets and every file of its packs. */
  const everything = async () => {
    const out = await call('assets:refs', (await call('browse:assets', query, 'relevance', 0, 5000)).rows.map((r) => r.id));
    for (const p of inPacks) for (const f of await call('pack:files', p.id)) out.push({ packId: f.packId, ref: f.ref });
    return out;
  };
  const smart = collection.kind === 'smart';
  // The library's own collection: starred things. It keeps its name and stays.
  const own = collection.id === FAVOURITES;

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

  /** Take whole packs out of the collection; the packs themselves stay in the library. */
  const takePacksOut = async (ids: string[]) => {
    try {
      await call('collections:change', id, { removePacks: ids });
      notify.success(ids.length === 1 ? `Taken out of ${collection?.name ?? 'the collection'}.` : `Took ${ids.length} packs out.`);
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
    s.setFavourites(collection.query?.favourites ?? false);
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
            {[inPacks.length ? `${inPacks.length} pack${inPacks.length === 1 ? '' : 's'}` : '', `${formatCount(held)} asset${held === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
            {inPacks.length > 0 && rows.total > 0 ? ` (${rows.total} added on their own)` : ''}
            {smart && ` · a saved search${collection.query?.text ? ` for “${collection.query.text}”` : ''}; it updates as your library changes`}
          </Typography>
          {(forProject || hasRules(collection.rules)) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
              {forProject && <Chip size="small" icon={<SportsEsportsOutlined />} label={`For ${forProject.name}`} onClick={() => go({ to: 'project', id: forProject.id })} />}
              {ruleChips.map((r) => (
                <Chip key={r} size="small" variant="outlined" icon={<AutoAwesomeOutlined />} label={r} />
              ))}
            </div>
          )}
          {collection.description && (
            <Typography variant="bodyMedium" sx={{ color: md('onSurface'), mt: 1, maxWidth: 760 }}>
              {collection.description}
            </Typography>
          )}
        </div>
        {forProject && (
          <CopyButton items={everything} to={forProject} variant="contained" size="medium" sx={{ mr: 1 }} />
        )}
        {smart && (
          <Button variant="outlined" startIcon={<SearchOutlined />} onClick={openInBrowse}>
            Open in Browse
          </Button>
        )}
        {!own && (
          <>
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
          </>
        )}
      </header>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {inPacks.length > 0 && (
          <div style={{ padding: '4px 32px 16px' }}>
            <Typography variant="labelLarge" sx={{ color: md('onSurfaceVariant'), textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11, display: 'block', mb: 1 }}>
              Packs
            </Typography>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {inPacks.map((p) => (
                <div key={p.id} style={{ width: Math.max(200, tileSize * 1.4) }}>
                  <PackCard
                    pack={p}
                    width={Math.max(200, tileSize * 1.4)}
                    selected={false}
                    onClick={(_, x) => go({ to: 'pack', id: x.id })}
                    onOpen={(x) => go({ to: 'pack', id: x.id })}
                    onMenu={(anchor, x) => setPackMenu({ anchor, pack: x })}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {!rows.loading && rows.total === 0 && inPacks.length === 0 ? (
          <EmptyState
            icon={SearchOutlined}
            title={smart ? 'Nothing matches this search yet' : 'Nothing in this collection yet'}
            body={smart ? 'It fills itself in as packs that match are added.' : 'Add whole packs or single assets from anywhere in the library: both keep their place here.'}
            actions={
              <Button variant="contained" onClick={() => go({ to: 'browse' })}>
                {smart ? 'Browse the library' : 'Pick assets'}
              </Button>
            }
          />
        ) : rows.total === 0 ? null : (
          <>
            {inPacks.length > 0 && (
              <Typography variant="labelLarge" sx={{ color: md('onSurfaceVariant'), textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11, display: 'block', px: 4, pb: 1 }}>
                Assets
              </Typography>
            )}
            <VirtualGrid label="Assets in this collection" count={rows.total} minItemWidth={tileSize} itemHeight={(w) => w + TILE_LABEL_HEIGHT} gap={8} render={render} onRangeChange={rows.setVisibleRange} />
          </>
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
      {packMenu && (
        <PackMenu
          anchor={packMenu.anchor}
          pack={packMenu.pack}
          onClose={() => setPackMenu(null)}
          onOpen={() => go({ to: 'pack', id: packMenu.pack.id })}
          {...(smart
            ? {}
            : {
                extra: {
                  icon: <RemoveCircleOutlineOutlined fontSize="small" />,
                  primary: 'Take it out of this collection',
                  run: () => void takePacksOut([packMenu.pack.id]),
                },
              })}
        />
      )}
      {menu && (
        <AssetMenu
          anchor={menu.anchor}
          asset={menu.asset}
          onClose={() => setMenu(null)}
          onOpen={() => setViewing(menu.index)}
          {...(smart ? {} : { extra: { icon: <RemoveCircleOutlineOutlined fontSize="small" />, primary: 'Take it out of this collection', run: () => void remove([menu.asset.id]) } })}
        />
      )}
      <CollectionDialog
        open={renaming}
        title="Edit this collection"
        action="Save"
        initial={{ name: collection.name, description: collection.description, rules: collection.rules, projectId: collection.projectId }}
        onClose={() => setRenaming(false)}
        onDone={async (draft) => {
          setRenaming(false);
          await call('collections:change', id, { name: draft.name, description: draft.description, rules: draft.rules, projectId: draft.projectId });
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
            strip={{ items: Array.from({ length: rows.total }, (_, i) => rows.get(i)), onPick: setViewing, onNeed: rows.setVisibleRange }}
          />
        </Suspense>
      )}
    </div>
  );
}
