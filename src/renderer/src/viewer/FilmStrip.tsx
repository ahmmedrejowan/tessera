import Typography from '@mui/material/Typography';
import { useEffect, useRef } from 'react';
import type { AssetRow } from '@shared/query';
import { AssetThumb } from '../components/AssetThumb';
import { formatCount } from '../components/labels';
import { md, SHAPE } from '../theme';

const TILE = 44;

/**
 * The rest of what you are looking through, under the preview: where you are in it, and a way to
 * step sideways without closing. It follows the file you are on, so the strip always shows it.
 */
export function FilmStrip({ items, index, total, onPick, onNeed }: { items: (AssetRow | undefined)[]; index: number; total: number; onPick: (index: number) => void; onNeed?: (start: number, end: number) => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const here = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    here.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index]);

  // Only what is on screen needs its picture; the rest are asked for as they come into view.
  useEffect(() => {
    const el = strip.current;
    if (!el || !onNeed) return;
    const tell = () => {
      const first = Math.max(0, Math.floor(el.scrollLeft / (TILE + 8)) - 4);
      onNeed(first, Math.min(total - 1, first + Math.ceil(el.clientWidth / (TILE + 8)) + 8));
    };
    tell();
    el.addEventListener('scroll', tell, { passive: true });
    return () => el.removeEventListener('scroll', tell);
  }, [onNeed, total, index]);

  return (
    <div style={{ borderTop: `1px solid ${md('outlineVariant')}`, background: md('surfaceContainerLow'), padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <Typography variant="labelLarge" noWrap sx={{ color: md('onSurfaceVariant'), flexShrink: 0, width: 108 }}>
        {formatCount(index + 1)} of {formatCount(total)}
      </Typography>
      <div ref={strip} style={{ display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', flex: 1, scrollbarWidth: 'thin', paddingBottom: 2 }}>
        {items.map((a, i) => (
          <button
            key={a ? a.id : `gap-${i}`}
            ref={i === index ? here : undefined}
            type="button"
            onClick={() => onPick(i)}
            aria-label={a ? a.name : `Asset ${i + 1}`}
            aria-current={i === index ? 'true' : undefined}
            title={a?.name}
            style={{
              width: TILE,
              height: TILE,
              flexShrink: 0,
              padding: 2,
              cursor: 'default',
              border: i === index ? `2px solid ${md('primary')}` : '2px solid transparent',
              borderRadius: SHAPE.sm,
              background: i === index ? md('secondaryContainer') : 'transparent',
            }}
          >
            {a ? <AssetThumb asset={a} size={TILE - 8} rounded={4} /> : <span style={{ display: 'block', width: TILE - 8, height: TILE - 8, borderRadius: 4, background: md('surfaceContainerHigh') }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
