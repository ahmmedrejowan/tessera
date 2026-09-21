import { useState } from 'react';
import type { AssetRow } from '@shared/query';
import { fileUrl } from '../state/library';
import { md } from '../theme';
import { DIRECT_IMAGE, TYPE_ICONS } from './labels';

/** A soft checkerboard behind images, so transparent sprites read as transparent. */
export const checker = (cell = 8) => ({
  backgroundColor: md('surfaceContainer'),
  backgroundImage: `conic-gradient(${md('surfaceContainerHigh')} 25%, transparent 0 50%, ${md('surfaceContainerHigh')} 0 75%, transparent 0)`,
  backgroundSize: `${cell * 2}px ${cell * 2}px`,
});

/**
 * The picture for an asset: the image itself for formats the window can draw, otherwise an icon
 * for its type. Small images (pixel art) are scaled up with hard edges instead of blurred.
 */
export function AssetThumb({ asset, size, rounded = 8 }: { asset: Pick<AssetRow, 'packId' | 'ref' | 'ext' | 'type' | 'kind'>; size: number; rounded?: number }) {
  const [pixelated, setPixelated] = useState(false);
  const [failed, setFailed] = useState(false);
  const image = asset.kind === 'image' && DIRECT_IMAGE.has(asset.ext) && !failed;
  const Icon = TYPE_ICONS[asset.type];
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1',
        borderRadius: rounded,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        ...(image ? checker(Math.max(4, Math.round(size / 24))) : { background: md('surfaceContainerHigh') }),
      }}
    >
      {image ? (
        <img
          src={fileUrl(asset.packId, asset.ref)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(e) => setPixelated(e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalWidth * 2.5 <= size)}
          onError={() => setFailed(true)}
          style={{ width: '88%', height: '88%', objectFit: 'contain', imageRendering: pixelated ? 'pixelated' : 'auto' }}
        />
      ) : (
        <Icon sx={{ fontSize: Math.max(28, size * 0.3), color: md('onSurfaceVariant'), opacity: 0.7 }} />
      )}
    </div>
  );
}
