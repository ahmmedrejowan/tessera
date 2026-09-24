import AddOutlined from '@mui/icons-material/AddOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import CollectionsBookmarkOutlined from '@mui/icons-material/CollectionsBookmarkOutlined';
import StarRounded from '@mui/icons-material/StarRounded';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { FAVOURITES, type CollectionSummary } from '@shared/collection';
import { AssetThumb } from '../../components/AssetThumb';
import { formatCount } from '../../components/labels';
import { SortButton } from '../../components/SortButton';
import { EmptyState } from '../../components/EmptyState';
import { newCollection, useCollections } from '../../state/collections';
import { useNav } from '../../state/nav';
import { md, SHAPE } from '../../theme';
import { Page } from '../Placeholder';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import Tooltip from '@mui/material/Tooltip';
import { call } from '../../api';
import { DeleteIcon, EditIcon } from '../../components/icons';
import { ask } from '../../notices/dialogs';
import { notify } from '../../notices/store';
import { mdAlpha } from '../../theme';
import { CollectionDialog, type CollectionDraft } from './CollectionDialog';

type CollectionSort = 'name' | 'updated' | 'size';

/** How the collections are ordered; Favourites is always first, whatever is chosen. */
const by: Record<CollectionSort, (a: CollectionSummary, b: CollectionSummary) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  size: (a, b) => b.assets - a.assets,
};

export function CollectionCard({ c }: { c: CollectionSummary }) {
  const go = useNav((s) => s.go);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const own = c.id === FAVOURITES;
  return (
    <div className="tile" onClick={() => go({ to: 'collection', id: c.id })} style={{ position: 'relative', padding: 8, borderRadius: SHAPE.lg, background: md('surfaceContainerLow'), cursor: 'default' }}>
      <Tooltip title="More">
        <IconButton
          size="small"
          aria-label={`More for ${c.name}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenu(e.currentTarget);
          }}
          sx={{
            position: 'absolute',
            top: 14,
            right: 14,
            zIndex: 1,
            opacity: 0,
            backgroundColor: mdAlpha('surface', 0.86),
            '&:hover': { backgroundColor: md('surface') },
            '.tile:hover &': { opacity: 1 },
            '&:focus-visible': { opacity: 1 },
          }}
        >
          <MoreVertRounded fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} onClick={(e) => e.stopPropagation()}>
        <MenuItem
          onClick={() => {
            setMenu(null);
            go({ to: 'collection', id: c.id });
          }}
        >
          <ListItemIcon>
            <OpenInFullRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Open" />
        </MenuItem>
        {!own && (
          <MenuItem
            onClick={() => {
              setMenu(null);
              setEditing(true);
            }}
          >
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Edit details" />
          </MenuItem>
        )}
        {!own && (
          <MenuItem
            onClick={async () => {
              setMenu(null);
              if (await ask<boolean>({
                tone: 'warning',
                title: `Delete “${c.name}”?`,
                body: 'Only the collection goes. The packs and assets in it stay where they are.',
                actions: [
                  { label: 'Keep it', value: false, kind: 'text' },
                  { label: 'Delete', value: true, kind: 'danger' },
                ],
              })) {
                await call('collections:change', c.id, { delete: true });
                notify.success(`Deleted “${c.name}”.`);
              }
            }}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon sx={{ color: 'error.main' }}>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Delete" />
          </MenuItem>
        )}
      </Menu>
      <CollectionDialog
        open={editing}
        title="Edit this collection"
        action="Save"
        initial={{ name: c.name, description: c.description, rules: c.rules, projectId: c.projectId }}
        onClose={() => setEditing(false)}
        onDone={async (draft) => {
          setEditing(false);
          await call('collections:change', c.id, { name: draft.name, description: draft.description, rules: draft.rules, projectId: draft.projectId });
        }}
      />
      <div style={{ aspectRatio: '4 / 3', borderRadius: SHAPE.md, overflow: 'hidden', display: 'grid', gridTemplateColumns: c.samples.length > 1 ? '1fr 1fr' : '1fr', gap: 2, background: md('surfaceContainerHigh') }}>
        {c.samples.length ? (
          c.samples.map((s) => (
            <div key={`${s.packId}${s.ref}`} style={{ overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
              <div style={{ width: c.samples.length > 2 ? '100%' : '70%' }}>
                <AssetThumb asset={{ ...s, kind: s.kind as never, type: s.type as never }} size={120} rounded={0} />
              </div>
            </div>
          ))
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', color: md('onSurfaceVariant') }}>
            {c.id === FAVOURITES ? <StarRounded sx={{ fontSize: 40, opacity: 0.6 }} /> : c.kind === 'smart' ? <AutoAwesomeOutlined sx={{ fontSize: 40, opacity: 0.6 }} /> : <CollectionsBookmarkOutlined sx={{ fontSize: 40, opacity: 0.6 }} />}
          </div>
        )}
      </div>
      <div style={{ padding: '10px 6px 4px' }}>
        <Typography variant="titleSmall" noWrap sx={{ color: md('onSurface'), display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {c.id === FAVOURITES && <StarRounded sx={{ fontSize: 16, color: md('tertiary') }} />}
          {c.kind === 'smart' && <AutoAwesomeOutlined sx={{ fontSize: 16, color: md('tertiary') }} />}
          {c.name}
        </Typography>
        <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant') }}>
          {[c.packCount ? `${c.packCount} pack${c.packCount === 1 ? '' : 's'}` : '', `${formatCount(c.assets)} asset${c.assets === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
          {c.kind === 'smart' ? ' · updates itself' : ''}
        </Typography>
      </div>
    </div>
  );
}

/** Your own groupings of assets across packs, and saved searches. */
export function CollectionsPage() {
  const collections = useCollections().data;
  const go = useNav((s) => s.go);
  const [naming, setNaming] = useState(false);
  const [sort, setSort] = useState<CollectionSort>('name');
  const create = async (draft: CollectionDraft) => {
    setNaming(false);
    const id = await newCollection(draft.name, { description: draft.description, rules: draft.rules, projectId: draft.projectId });
    go({ to: 'collection', id });
  };
  return (
    <Page
      flush
      title="Collections"
      subtitle="Assets gathered for one game, or one job"
      aside={
        <SortButton
          value={sort}
          options={[
            { value: 'name' as const, label: 'Name' },
            { value: 'updated' as const, label: 'Recently changed' },
            { value: 'size' as const, label: 'Most assets' },
          ]}
          onChange={setSort}
          width={186}
        />
      }
      actions={
        <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setNaming(true)}>
          New collection
        </Button>
      }
    >
      {collections && !collections.length ? (
        <EmptyState
          icon={CollectionsBookmarkOutlined}
          title="No collections yet"
          body="Gather what one game needs from any pack. Pick assets in Browse and add them here, or save a search as a smart collection that keeps itself up to date."
          actions={
            <Button variant="contained" startIcon={<AddOutlined />} onClick={() => setNaming(true)}>
              New collection
            </Button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, padding: '8px 32px 32px' }}>
          {/* What you starred comes first, then the rest as they are named. */}
          {[...(collections ?? [])]
            .sort((a, b) => (a.id === FAVOURITES ? -1 : b.id === FAVOURITES ? 1 : by[sort](a, b)))
            .map((c) => <CollectionCard key={c.id} c={c} />)}
        </div>
      )}
      <CollectionDialog open={naming} title="New collection" action="Create" onClose={() => setNaming(false)} onDone={(draft) => void create(draft)} />
    </Page>
  );
}
