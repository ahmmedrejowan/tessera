import Typography from '@mui/material/Typography';
import { memo, type MouseEvent } from 'react';
import type { AssetRow } from '@shared/query';
import { AssetThumb } from '../../components/AssetThumb';
import { displayName, formatsLabel } from '../../components/labels';
import { dragOutProps } from '../../state/dragOut';
import { md, SHAPE } from '../../theme';

export const TILE_LABEL_HEIGHT = 52;

interface Props {
  asset: AssetRow | undefined;
  width: number;
  selected: boolean;
  onClick: (e: MouseEvent, asset: AssetRow) => void;
  onOpen: (asset: AssetRow) => void;
  /** Makes the tile draggable out of the app; gives what to drag. */
  dragItems?: (asset: AssetRow) => { packId: string; ref: string }[] | Promise<{ packId: string; ref: string }[]>;
}

/** One asset in the grid: its picture, file name and pack. A placeholder while its page loads. */
export const AssetTile = memo(function AssetTile({ asset, width, selected, onClick, onOpen, dragItems }: Props) {
  if (!asset) {
    return <div style={{ height: width + TILE_LABEL_HEIGHT, borderRadius: SHAPE.md, background: md('surfaceContainerLow') }} />;
  }
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      title={`${asset.name}\n${asset.packName}${asset.dir ? ` › ${asset.dir}` : ''}`}
      onClick={(e) => onClick(e, asset)}
      onDoubleClick={() => onOpen(asset)}
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
