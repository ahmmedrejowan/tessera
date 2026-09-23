import SearchOffOutlined from '@mui/icons-material/SearchOffOutlined';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { TYPE_LABELS, type AssetType } from '@shared/assets';
import type { AssetRow, PackRow } from '@shared/query';
import { call } from '../api';
import { EmptyState } from '../components/EmptyState';
import { formatCount } from '../components/labels';
import { CollectionIcon, ProjectIcon } from '../components/icons';
import { useCollections } from '../state/collections';
import { useIndexVersion, useLibraryId } from '../state/library';
import { useNav } from '../state/nav';
import { useBrowse } from '../state/browse';
import { useProjects } from '../state/projects';
import { AssetTile } from './browse/AssetTile';
import { PackCard } from './browse/PackCard';
import { AssetMenu, PackMenu } from './browse/TileMenu';
import { md, SHAPE } from '../theme';
import { Page } from './Placeholder';

const SHOWN = 12;

function Heading({ title, count, onAll }: { title: string; count: number; onAll?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
        {title}
      </Typography>
      <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), flex: 1 }}>
        {formatCount(count)}
      </Typography>
      {onAll && count > SHOWN && (
        <Button size="small" onClick={onAll}>
          See all
        </Button>
      )}
    </div>
  );
}

/**
 * Everything that matches what was typed, in one place: packs, assets, the kinds and tags they
 * are filed under, the collections that hold them and the games they are linked to.
 */
export function SearchPage({ text }: { text: string }) {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const go = useNav((s) => s.go);
  const q = text.trim();
  const query = { scope: 'library' as const, text: q, filters: {} };
  const [assetMenu, setAssetMenu] = useState<{ anchor: HTMLElement; asset: AssetRow } | null>(null);
  const [packMenu, setPackMenu] = useState<{ anchor: HTMLElement; pack: PackRow } | null>(null);

  const packs = useQuery({ queryKey: ['search-packs', lib, version, q], queryFn: () => call('browse:packs', query, 'name', 0, SHOWN), enabled: !!lib && !!q }).data;
  const assets = useQuery({ queryKey: ['search-assets', lib, version, q], queryFn: () => call('browse:assets', query, 'relevance', 0, SHOWN), enabled: !!lib && !!q }).data;
  const facets = useQuery({ queryKey: ['search-facets', lib, version, q], queryFn: () => call('browse:facets', query, 'assets'), enabled: !!lib && !!q }).data;
  const collections = (useCollections().data ?? []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const projects = (useProjects().data ?? []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  const tags = (facets?.tag ?? []).filter((t) => t.value.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  const types = (facets?.type ?? []).slice(0, 8);

  /** Take the search into Browse, where it can be filtered and sorted. */
  const inBrowse = (mode: 'assets' | 'packs') => {
    const s = useBrowse.getState();
    s.setMode(mode);
    s.clearFilters();
    s.setText(q);
    go({ to: 'browse' });
  };

  const nothing = !packs?.total && !assets?.total && !collections.length && !projects.length && !tags.length;

  return (
    <Page title={q ? `“${q}”` : 'Search'} subtitle="Everything that matches, across the library" width={1240}>
      {nothing ? (
        <EmptyState
          icon={SearchOffOutlined}
          title={q ? 'Nothing matches' : 'Type to search'}
          body={q ? 'No pack, asset, tag, collection or game goes by that. Try fewer words, or a part of a name.' : 'Packs and assets, the kinds and tags they are filed under, collections and games: all of it is searched at once.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, paddingTop: 4 }}>
          {(types.length > 0 || tags.length > 0) && (
            <section>
              <Heading title="Filed under" count={types.length + tags.length} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {types.map((t) => (
                  <Chip
                    key={t.value}
                    label={`${TYPE_LABELS[t.value as AssetType]} · ${formatCount(t.count)}`}
                    onClick={() => {
                      const s = useBrowse.getState();
                      s.setMode('assets');
                      s.clearFilters();
                      s.setText(q);
                      s.setFilter('type', [t.value]);
                      go({ to: 'browse' });
                    }}
                  />
                ))}
                {tags.map((t) => (
                  <Chip
                    key={t.value}
                    variant="outlined"
                    label={`${t.value} · ${formatCount(t.count)}`}
                    onClick={() => {
                      const s = useBrowse.getState();
                      s.setMode('assets');
                      s.clearFilters();
                      s.setText('');
                      s.setFilter('tag', [t.value]);
                      go({ to: 'browse' });
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {!!packs?.total && (
            <section>
              <Heading title="Packs" count={packs.total} onAll={() => inBrowse('packs')} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {packs.rows.map((p) => (
                  <div key={p.id} style={{ width: 200 }}>
                    <PackCard
                      pack={p}
                      width={200}
                      selected={false}
                      onClick={(_, x) => go({ to: 'pack', id: x.id })}
                      onOpen={(x) => go({ to: 'pack', id: x.id })}
                      onMenu={(anchor, x) => setPackMenu({ anchor, pack: x })}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {!!assets?.total && (
            <section>
              <Heading title="Assets" count={assets.total} onAll={() => inBrowse('assets')} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {assets.rows.map((a) => (
                  <div key={a.id} style={{ width: 132 }}>
                    <AssetTile
                      asset={a}
                      width={132}
                      selected={false}
                      onClick={() => go({ to: 'pack', id: a.packId })}
                      onOpen={() => go({ to: 'pack', id: a.packId })}
                      onMenu={(anchor, x) => setAssetMenu({ anchor, asset: x })}
                      dragItems={(x) => [{ packId: x.packId, ref: x.ref }]}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {collections.length > 0 && (
            <section>
              <Heading title="Collections" count={collections.length} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {collections.map((c) => (
                  <Chip key={c.id} icon={<CollectionIcon />} label={`${c.name} · ${formatCount(c.assets)}`} onClick={() => go({ to: 'collection', id: c.id })} sx={{ borderRadius: `${SHAPE.sm}px` }} />
                ))}
              </div>
            </section>
          )}

          {projects.length > 0 && (
            <section>
              <Heading title="Games" count={projects.length} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {projects.map((p) => (
                  <Chip key={p.id} icon={<ProjectIcon />} label={`${p.name} · ${formatCount(p.assets)}`} onClick={() => go({ to: 'project', id: p.id })} sx={{ borderRadius: `${SHAPE.sm}px` }} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      {assetMenu && <AssetMenu anchor={assetMenu.anchor} asset={assetMenu.asset} onClose={() => setAssetMenu(null)} onOpen={() => go({ to: 'pack', id: assetMenu.asset.packId })} />}
      {packMenu && <PackMenu anchor={packMenu.anchor} pack={packMenu.pack} onClose={() => setPackMenu(null)} onOpen={() => go({ to: 'pack', id: packMenu.pack.id })} />}
    </Page>
  );
}
