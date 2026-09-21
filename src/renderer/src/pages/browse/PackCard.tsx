import Typography from '@mui/material/Typography';
import { memo, useState, type MouseEvent } from 'react';
import type { PackRow } from '@shared/query';
import { AssetThumb, checker } from '../../components/AssetThumb';
import { licenceShort, sourceName, typeSummary } from '../../components/labels';
import { fileUrl } from '../../state/library';
import { md, SHAPE } from '../../theme';

export const PACK_LABEL_HEIGHT = 76;
/** Covers are 4:3. */
export const coverHeight = (width: number) => Math.round((width - 12) * 0.75);

function Cover({ pack, width }: { pack: PackRow; width: number }) {
  const [failed, setFailed] = useState(false);
  const h = coverHeight(width);
  if (pack.coverRef && !failed) {
    return (
      <div style={{ height: h, borderRadius: SHAPE.sm, overflow: 'hidden', ...checker(6) }}>
        <img
          src={fileUrl(pack.id, pack.coverRef)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }
  // No preview shipped: a mosaic of the pack's first assets.
  const tiles = pack.samples.slice(0, 4);
  const cols = tiles.length > 1 ? 2 : 1;
  return (
    <div
      style={{
        height: h,
        borderRadius: SHAPE.sm,
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 2,
        background: md('surfaceContainerHigh'),
        alignContent: 'center',
      }}
    >
      {tiles.map((t) => (
        <div key={t.ref} style={{ overflow: 'hidden', display: 'grid', placeItems: 'center', height: tiles.length > 2 ? h / 2 - 1 : h }}>
          <div style={{ width: tiles.length > 2 ? h / 2 - 1 : h * 0.9 }}>
            <AssetThumb asset={{ ...t, packId: pack.id }} size={h / 2} rounded={0} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  pack: PackRow | undefined;
  width: number;
  selected: boolean;
  onClick: (e: MouseEvent, pack: PackRow) => void;
  onOpen: (pack: PackRow) => void;
}

export const PackCard = memo(function PackCard({ pack, width, selected, onClick, onOpen }: Props) {
  const height = coverHeight(width) + PACK_LABEL_HEIGHT + 12;
  if (!pack) return <div style={{ height, borderRadius: SHAPE.md, background: md('surfaceContainerLow') }} />;
  const meta = [sourceName(pack.source), licenceShort(pack.licence)].filter(Boolean).join(' · ');
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      className="tile"
      onClick={(e) => onClick(e, pack)}
      onDoubleClick={() => onOpen(pack)}
      style={{
        height,
        padding: 6,
        borderRadius: SHAPE.md,
        background: selected ? md('secondaryContainer') : md('surfaceContainerLow'),
        outline: selected ? `2px solid ${md('primary')}` : 'none',
        outlineOffset: -2,
        cursor: 'default',
      }}
    >
      <Cover pack={pack} width={width} />
      <div style={{ padding: '8px 6px 0', minWidth: 0 }}>
        <Typography variant="titleSmall" noWrap component="div" sx={{ color: selected ? md('onSecondaryContainer') : md('onSurface') }}>
          {pack.name}
        </Typography>
        <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }}>
          {typeSummary(pack.types)}
        </Typography>
        <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant'), opacity: 0.85 }}>
          {meta || 'Source unknown'}
        </Typography>
      </div>
    </div>
  );
});
