import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { memo, type MouseEvent } from 'react';
import type { AssetRow } from '@shared/query';
import { AssetThumb } from '../../components/AssetThumb';
import { displayName, formatsLabel } from '../../components/labels';
import { dragOutProps } from '../../state/dragOut';
import { md, mdAlpha, SHAPE } from '../../theme';
import { starAsset, StarButton } from './StarButton';
import { useHold } from './useHold';

export const TILE_LABEL_HEIGHT = 52;

interface Props {
  asset: AssetRow | undefined;
  width: number;
  selected: boolean;
  onClick: (e: MouseEvent, asset: AssetRow) => void;
  onOpen: (asset: AssetRow) => void;
  /** Press and hold, or right-click: pick it out rather than open it. */
  onHold?: (asset: AssetRow) => void;
  /** The quick menu behind the tile's three dots. */
  onMenu?: (anchor: HTMLElement, asset: AssetRow) => void;
  /** Makes the tile draggable out of the app; gives what to drag. */
  dragItems?: (asset: AssetRow) => { packId: string; ref: string }[] | Promise<{ packId: string; ref: string }[]>;
}

/** One asset in the grid: its picture, file name and pack. A placeholder while its page loads. */
export const AssetTile = memo(function AssetTile({ asset, width, selected, onClick, onOpen, onHold, onMenu, dragItems }: Props) {
  const hold = useHold(() => asset && onHold?.(asset));
  if (!asset) {
    return <div style={{ height: width + TILE_LABEL_HEIGHT, borderRadius: SHAPE.md, background: md('surfaceContainerLow') }} />;
  }
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      title={`${asset.name}\n${asset.packName}${asset.dir ? ` › ${asset.dir}` : ''}`}
      onClick={(e) => !hold.wasHeld() && onClick(e, asset)}
      onDoubleClick={() => onOpen(asset)}
      {...(onHold ? hold.handlers : {})}
      {...(dragItems ? dragOutProps(() => dragItems(asset)) : {})}
      style={{
        height: width + TILE_LABEL_HEIGHT,
        borderRadius: SHAPE.md,
        padding: 6,
        cursor: 'default',
        position: 'relative',
        background: selected ? md('secondaryContainer') : 'transparent',
        outline: selected ? `2px solid ${md('primary')}` : 'none',
        outlineOffset: -2,
        transition: 'background-color 120ms',
      }}
      className="tile"
    >
      <AssetThumb asset={asset} size={width - 12} />
      <StarButton on={asset.fav} name={asset.name} selected={selected} onToggle={(on) => starAsset(asset.packId, asset.ref, on)} />
      {onMenu && (
      <Tooltip title="More">
        <IconButton
          size="small"
          className="tile-menu"
          aria-label={`More for ${asset.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onMenu(e.currentTarget, asset);
          }}
          sx={{
            position: 'absolute',
            top: 10,
            right: 10,
            opacity: selected ? 1 : 0,
            zIndex: 1,
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
      <div style={{ padding: '6px 4px 0', minWidth: 0 }}>
        <Typography variant="labelLarge" noWrap component="div" sx={{ color: selected ? md('onSecondaryContainer') : md('onSurface') }}>
          {displayName(asset.name)}
        </Typography>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
          <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant'), flex: 1, minWidth: 0 }}>
            {asset.packName}
          </Typography>
          <Typography variant="labelSmall" component="div" title={`Comes as ${asset.formats.map((f) => f.toUpperCase()).join(', ')}`} sx={{ color: md('onSurfaceVariant'), flexShrink: 0 }}>
            {formatsLabel(asset.ext, asset.formats)}
          </Typography>
        </div>
      </div>
    </div>
  );
});
