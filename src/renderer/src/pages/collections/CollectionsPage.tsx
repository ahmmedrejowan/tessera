import AddOutlined from '@mui/icons-material/AddOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import CollectionsBookmarkOutlined from '@mui/icons-material/CollectionsBookmarkOutlined';
import StarRounded from '@mui/icons-material/StarRounded';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { FAVOURITES, type CollectionSummary } from '@shared/collection';
import { AssetThumb } from '../../components/AssetThumb';
import { EmptyState } from '../../components/EmptyState';
import { newCollection, useCollections } from '../../state/collections';
import { useNav } from '../../state/nav';
import { md, SHAPE } from '../../theme';
import { Page } from '../Placeholder';
import { NameDialog } from './CollectionMenu';

function CollectionCard({ c }: { c: CollectionSummary }) {
  const go = useNav((s) => s.go);
  return (
    <div className="tile" onClick={() => go({ to: 'collection', id: c.id })} style={{ padding: 8, borderRadius: SHAPE.lg, background: md('surfaceContainerLow'), cursor: 'default' }}>
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
          {c.count} asset{c.count === 1 ? '' : 's'}
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
  const create = async (name: string, description: string) => {
    setNaming(false);
    const id = await newCollection(name, { description });
    go({ to: 'collection', id });
  };
  return (
    <Page
      flush
      title="Collections"
      subtitle="Assets gathered for one game, or one job"
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
          {collections
            ?.slice()
            .sort((a, b) => (a.id === FAVOURITES ? -1 : b.id === FAVOURITES ? 1 : 0))
            .map((c) => <CollectionCard key={c.id} c={c} />)}
        </div>
      )}
      <NameDialog open={naming} title="New collection" action="Create" onClose={() => setNaming(false)} onDone={(n, d) => void create(n, d)} />
    </Page>
  );
}
