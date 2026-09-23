import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { memo, useState, type MouseEvent } from 'react';
import type { PackRow } from '@shared/query';
import { AssetThumb, checker } from '../../components/AssetThumb';
import { licenceShort, sourceName, typeSummary } from '../../components/labels';
import { fileUrl } from '../../state/library';
import { md, mdAlpha, SHAPE } from '../../theme';
import { starPack, StarButton } from './StarButton';
import { useHold } from './useHold';

export const PACK_LABEL_HEIGHT = 76;
/** Covers are 4:3. */
export const coverHeight = (width: number) => Math.round((width - 12) * 0.75);

/** A pack's picture: what it ships as a preview, or a mosaic of what is inside it. */
export function Cover({ pack, width, height }: { pack: PackRow; width: number; height?: number }) {
  const [failed, setFailed] = useState(false);
  const h = height ?? coverHeight(width);
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
  /** Press and hold, or right-click: pick it out rather than open it. */
  onHold?: (pack: PackRow) => void;
  /** The quick menu behind the card's three dots. */
  onMenu?: (anchor: HTMLElement, pack: PackRow) => void;
}

export const PackCard = memo(function PackCard({ pack, width, selected, onClick, onOpen, onHold, onMenu }: Props) {
  const hold = useHold(() => pack && onHold?.(pack));
  const height = coverHeight(width) + PACK_LABEL_HEIGHT + 12;
  if (!pack) return <div style={{ height, borderRadius: SHAPE.md, background: md('surfaceContainerLow') }} />;
  const meta = [sourceName(pack.source), licenceShort(pack.licence)].filter(Boolean).join(' · ');
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      className="tile"
      onClick={(e) => !hold.wasHeld() && onClick(e, pack)}
      onDoubleClick={() => onOpen(pack)}
      {...(onHold ? hold.handlers : {})}
      style={{
        height,
        padding: 6,
        borderRadius: SHAPE.md,
        position: 'relative',
        background: selected ? md('secondaryContainer') : md('surfaceContainerLow'),
        outline: selected ? `2px solid ${md('primary')}` : 'none',
        outlineOffset: -2,
        cursor: 'default',
      }}
    >
      {onMenu && (
        <Tooltip title="More">
          <IconButton
            size="small"
            aria-label={`More for ${pack.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onMenu(e.currentTarget, pack);
            }}
            sx={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: 1,
              opacity: selected ? 1 : 0,
              backgroundColor: mdAlpha('surface', 0.86),
              '&:hover': { backgroundColor: md('surface') },
              '.tile:hover &': { opacity: 1 },
              '&:focus-visible': { opacity: 1 },
            }}
          >
            <MoreVertRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Cover pack={pack} width={width} />
      <StarButton on={pack.fav} name={pack.name} selected={selected} onToggle={(on) => starPack(pack.id, on)} />
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
