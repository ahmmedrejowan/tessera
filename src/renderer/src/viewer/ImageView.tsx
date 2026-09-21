import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { checker } from '../components/AssetThumb';
import { md } from '../theme';

export interface ImageInfo {
  width: number;
  height: number;
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

/**
 * An image you can inspect: scroll to zoom at the pointer, drag to pan, double-click to switch
 * between fitting the window and actual size. Past 1:1 pixels stay sharp, so pixel art reads.
 * `fit` / `actual` requests come from the viewer's toolbar.
 */
export function ImageView({ src, onInfo, command }: { src: string; onInfo?: (i: ImageInfo | null) => void; command?: { kind: 'fit' | 'actual'; n: number } }) {
  const box = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<ImageInfo | null>(null);
  const [t, setT] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const fit = useCallback(() => {
    const el = box.current;
    if (!el || !natural) return;
    const s = Math.min((el.clientWidth - 48) / natural.width, (el.clientHeight - 48) / natural.height);
    // Small images (icons, pixel art) are enlarged to a whole-number scale so their pixels stay square.
    const scale = s >= 1 ? Math.max(1, Math.floor(Math.min(s, 16))) : s;
    setT({ scale, x: (el.clientWidth - natural.width * scale) / 2, y: (el.clientHeight - natural.height * scale) / 2 });
  }, [natural]);

  const actual = useCallback(() => {
    const el = box.current;
    if (!el || !natural) return;
    setT({ scale: 1, x: (el.clientWidth - natural.width) / 2, y: (el.clientHeight - natural.height) / 2 });
  }, [natural]);

  useEffect(() => {
    setNatural(null);
    setFailed(false);
    onInfo?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  useEffect(() => fit(), [fit]);
  useEffect(() => {
    if (command?.kind === 'fit') fit();
    if (command?.kind === 'actual') actual();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.n]);

  const onWheel = (e: WheelEvent) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setT((cur) => {
      const scale = Math.min(64, Math.max(0.02, cur.scale * factor));
      const k = scale / cur.scale;
      return { scale, x: px - (px - cur.x) * k, y: py - (py - cur.y) * k };
    });
  };
  const onDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d) setT((cur) => ({ ...cur, x: d.tx + e.clientX - d.x, y: d.ty + e.clientY - d.y }));
  };

  return (
    <div
      ref={box}
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => (natural && Math.abs(t.scale - 1) < 0.01 ? fit() : actual())}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}
    >
      {failed ? (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <Typography variant="bodyLarge" sx={{ color: md('onSurfaceVariant') }}>
            This image can't be shown here.
          </Typography>
        </div>
      ) : (
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const info = { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight };
            setNatural(info);
            onInfo?.(info);
          }}
          onError={() => setFailed(true)}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transformOrigin: '0 0',
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
            imageRendering: t.scale >= 2 ? 'pixelated' : 'auto',
            visibility: natural ? 'visible' : 'hidden',
            maxWidth: 'none',
            ...checker(8 / Math.max(t.scale, 0.1)),
          }}
        />
      )}
    </div>
  );
}
