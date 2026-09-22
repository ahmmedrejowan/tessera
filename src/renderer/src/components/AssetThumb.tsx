import { useState } from 'react';
import type { AssetRow } from '@shared/query';
import { assetKey } from '@shared/urls';
import { fileUrl } from '../state/library';
import { useThumb } from '../state/thumbs';
import { md } from '../theme';
import { TYPE_ICONS } from './labels';

/** A soft checkerboard behind images, so transparent sprites read as transparent. */
export const checker = (cell = 8) => ({
  backgroundColor: md('surfaceContainer'),
  backgroundImage: `conic-gradient(${md('surfaceContainerHigh')} 25%, transparent 0 50%, ${md('surfaceContainerHigh')} 0 75%, transparent 0)`,
  backgroundSize: `${cell * 2}px ${cell * 2}px`,
});

type ThumbAsset = Pick<AssetRow, 'packId' | 'ref' | 'ext' | 'type' | 'kind'>;

/**
 * The picture for an asset: a rendered thumbnail, the image itself for small web images, or an
 * icon for its type while there's nothing better. Waveforms and font samples are masks tinted with
 * the theme. Small images (pixel art) are scaled up with hard edges instead of blurred.
 */
export function AssetThumb({ asset, size, rounded = 8 }: { asset: ThumbAsset; size: number; rounded?: number }) {
  const state = useThumb(assetKey(asset.packId, asset.ref));
  const [pixelated, setPixelated] = useState(false);
  const [failed, setFailed] = useState(false);
  const Icon = TYPE_ICONS[asset.type];
  const src = state === 'direct' ? fileUrl(asset.packId, asset.ref) : state && state.startsWith('tessera:') ? state : null;
  const mask = !!src && state !== 'direct' && (asset.kind === 'audio' || asset.kind === 'font');
  const picture = !!src && !mask && !failed;
  const box = {
    width: '100%',
    aspectRatio: '1',
    borderRadius: rounded,
    overflow: 'hidden',
    display: 'grid',
    placeItems: 'center',
    ...(picture && asset.kind === 'image' ? checker(Math.max(4, Math.round(size / 24))) : { background: md('surfaceContainerHigh') }),
  } as const;

  if (mask) {
    const tint = asset.kind === 'font' ? md('onSurface') : md('primary');
    return (
      <div style={box}>
        <div style={{ width: '78%', height: '78%', background: tint, maskImage: `url("${src}")`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center' }} />
      </div>
    );
  }
  return (
    <div style={box}>
      {picture ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(e) => setPixelated(asset.kind === 'image' && e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalWidth * 2.5 <= size)}
          onError={() => setFailed(true)}
          style={{ width: asset.kind === 'model' ? '100%' : '88%', height: asset.kind === 'model' ? '100%' : '88%', objectFit: 'contain', imageRendering: pixelated ? 'pixelated' : 'auto' }}
        />
      ) : (
        <Icon sx={{ fontSize: Math.max(28, size * 0.3), color: md('onSurfaceVariant'), opacity: state === 'pending' ? 0.35 : 0.7, transition: 'opacity 200ms' }} />
      )}
    </div>
  );
}
