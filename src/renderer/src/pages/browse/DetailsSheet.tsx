import Close from '@mui/icons-material/Close';
import BookmarkAddOutlined from '@mui/icons-material/BookmarkAddOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { CollectionMenu } from '../collections/CollectionMenu';
import { CopyButton } from '../projects/CopyButton';
import { TYPE_LABELS } from '@shared/assets';
import { sourceInfo } from '@shared/sources';
import { call } from '../../api';
import { AssetThumb } from '../../components/AssetThumb';
import { formatBytes, formatCount, sourceName, typeSummary } from '../../components/labels';
import { LicenceChip, licenceSummary } from '../../components/LicenceChip';
import { useBrowse, type Selected } from '../../state/browse';
import { useIndexVersion, useLibraryId } from '../../state/library';
import { useNav } from '../../state/nav';
import { md, SHAPE } from '../../theme';
import { coverHeight, PackCard } from './PackCard';

export const SHEET_WIDTH = 340;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '92px 1fr', gap: 12, alignItems: 'baseline', padding: '6px 0' }}>
      <Typography variant="labelMedium" sx={{ color: md('onSurfaceVariant') }}>
        {label}
      </Typography>
      <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurface'), wordBreak: 'break-word', userSelect: 'text' }}>
        {children}
      </Typography>
    </div>
  );
}

function usePack(id: string | null) {
  const lib = useLibraryId();
  const v = useIndexVersion();
  return useQuery({ queryKey: ['pack', lib, v, id], queryFn: () => call('pack:get', id!), enabled: !!id && !!lib, placeholderData: (p) => p });
}

function PackSection({ packId }: { packId: string }) {
  const pack = usePack(packId).data;
  if (!pack) return null;
  const site = sourceInfo(pack.meta.source.site);
  return (
    <>
      <Row label="Source">{sourceName(pack.source) ?? 'Not recorded'}</Row>
      {pack.creator && <Row label="Creator">{pack.creator}</Row>}
      <Row label="Licence">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <LicenceChip id={pack.licence} />
          <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
            {licenceSummary(pack.licence)}
          </Typography>
          {pack.meta.licence.attribution && (
            <Typography variant="bodySmall" sx={{ color: md('onSurface'), fontStyle: 'italic' }}>
              “{pack.meta.licence.attribution}”
            </Typography>
          )}
        </div>
      </Row>
      {(pack.meta.source.url || site) && (
        <Row label="Link">
          <a href={pack.meta.source.url ?? site!.url} target="_blank" rel="noreferrer" style={{ color: md('primary') }}>
            {(pack.meta.source.url ?? site!.url).replace(/^https?:\/\/(www\.)?/, '')}
          </a>
        </Row>
      )}
    </>
  );
}

/** The files an asset comes as: each format and size, with where it sits in the pack. */
function Variants({ id }: { id: number }) {
  const lib = useLibraryId();
  const v = useIndexVersion();
  const files = useQuery({ queryKey: ['variants', lib, v, id], queryFn: () => call('asset:variants', id), enabled: !!lib }).data ?? [];
  if (files.length < 2) return null;
  return (
    <div>
      <Typography variant="titleSmall" sx={{ color: md('onSurfaceVariant'), mb: 0.5 }}>
        Comes as
      </Typography>
      {files.map((f) => (
        <div key={f.id} className="tile" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 8px', borderRadius: SHAPE.sm }}>
          <Typography variant="labelMedium" sx={{ width: 44, color: md('onSurface') }}>
            {f.ext.toUpperCase()}
          </Typography>
          <Typography variant="bodySmall" noWrap title={f.dir} sx={{ flex: 1, minWidth: 0, color: md('onSurfaceVariant') }}>
            {f.dir.split('/').slice(-2).join('/') || 'Top level'}
          </Typography>
          <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
            {formatBytes(f.size)}
          </Typography>
        </div>
      ))}
    </div>
  );
}

function AssetDetails({ id }: { id: number }) {
  const lib = useLibraryId();
  const v = useIndexVersion();
  const go = useNav((s) => s.go);
  const asset = useQuery({ queryKey: ['asset', lib, v, id], queryFn: () => call('asset:get', id), enabled: !!lib, placeholderData: (p) => p }).data;
  const [collectAnchor, setCollectAnchor] = useState<HTMLElement | null>(null);
  if (!asset) return null;
  return (
    <>
      <div style={{ padding: 16, background: md('surfaceContainerLow'), borderRadius: SHAPE.lg }}>
        <AssetThumb asset={asset} size={SHEET_WIDTH - 64} />
      </div>
      <div>
        <Typography variant="titleMedium" sx={{ color: md('onSurface'), wordBreak: 'break-word', userSelect: 'text' }}>
          {asset.name}
        </Typography>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          {TYPE_LABELS[asset.type]} · {asset.formats.map((f) => f.toUpperCase()).join(', ')} · {formatBytes(asset.size)}
        </Typography>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <CopyButton items={() => [{ packId: asset.packId, ref: asset.ref }]} />
        <Button variant="outlined" size="small" startIcon={<OpenInNew />} onClick={() => go({ to: 'pack', id: asset.packId })}>
          Open pack
        </Button>
        <Button variant="text" size="small" startIcon={<BookmarkAddOutlined />} onClick={(e) => setCollectAnchor(e.currentTarget)}>
          Collect
        </Button>
        <Button variant="text" size="small" startIcon={<FolderOpenOutlined />} onClick={() => void call('pack:reveal', asset.packId, asset.ref)}>
          Show file
        </Button>
        <CollectionMenu anchor={collectAnchor} onClose={() => setCollectAnchor(null)} items={async () => [{ packId: asset.packId, ref: asset.ref }]} />
      </div>
      <Variants id={asset.id} />
      <div>
        <Row label="Pack">{asset.packName}</Row>
        {asset.dir && <Row label="Folder">{asset.dir}</Row>}
        <PackSection packId={asset.packId} />
      </div>
    </>
  );
}

function PackDetails({ id }: { id: string }) {
  const pack = usePack(id).data;
  const go = useNav((s) => s.go);
  if (!pack) return null;
  const terms = [...pack.genres, ...pack.styles, ...pack.tags];
  return (
    <>
      <div style={{ pointerEvents: 'none', height: coverHeight(SHEET_WIDTH - 32) + 12 }}>
        <div style={{ height: coverHeight(SHEET_WIDTH - 32) + 12, overflow: 'hidden' }}>
          <PackCard pack={pack} width={SHEET_WIDTH - 32} selected={false} onClick={() => undefined} onOpen={() => undefined} />
        </div>
      </div>
      <div>
        <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
          {pack.name}
        </Typography>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          {typeSummary(pack.types, 4)}
        </Typography>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="contained" size="small" startIcon={<OpenInNew />} onClick={() => go({ to: 'pack', id })}>
          Open pack
        </Button>
        <Button variant="text" size="small" startIcon={<FolderOpenOutlined />} onClick={() => void call('pack:reveal', id)}>
          Show folder
        </Button>
      </div>
      <div>
        <PackSection packId={id} />
        <Row label="Files">
          {formatCount(pack.fileCount)} files · {formatBytes(pack.size)}
        </Row>
        <Row label="Added">{new Date(pack.addedAt).toLocaleDateString()}</Row>
      </div>
      {terms.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {terms.map((t) => (
            <Typography key={t} variant="labelMedium" sx={{ px: 1, py: '3px', borderRadius: `${SHAPE.sm}px`, border: `1px solid ${md('outlineVariant')}`, color: md('onSurfaceVariant') }}>
              {t}
            </Typography>
          ))}
        </div>
      )}
      {pack.meta.description && (
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), whiteSpace: 'pre-wrap', userSelect: 'text' }}>
          {pack.meta.description}
        </Typography>
      )}
    </>
  );
}

/** The side sheet describing the selected asset or pack. */
export function DetailsSheet({ item }: { item: Selected }) {
  const focus = useBrowse((s) => s.focus);
  return (
    <aside
      aria-label="Details"
      style={{ width: SHEET_WIDTH, flexShrink: 0, borderLeft: `1px solid ${md('outlineVariant')}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 8px 4px 16px' }}>
        <Typography variant="titleSmall" sx={{ color: md('onSurfaceVariant') }}>
          {item.kind === 'asset' ? 'Asset' : 'Pack'}
        </Typography>
        <IconButton size="small" aria-label="Close details" onClick={() => focus(null)}>
          <Close fontSize="small" />
        </IconButton>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {item.kind === 'asset' ? <AssetDetails id={item.id} /> : <PackDetails id={item.id} />}
      </div>
    </aside>
  );
}
