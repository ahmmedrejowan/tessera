import InputBase from '@mui/material/InputBase';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { md, SHAPE } from '../theme';
import { readAxes, variationSettings, type FontAxis } from './fontAxes';

const SAMPLE_KEY = 'tessera.font.sample';
const SIZE_KEY = 'tessera.font.size';
const DEFAULT_SAMPLE = 'The quick brown fox jumps over the lazy dog';
const CHARSET = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789 !?&@#%$*()[]{}<>+-=/:;,.'];

const remembered = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not remembered
  }
};

export interface FontInfo {
  family: string;
  axes: FontAxis[];
}

/**
 * Try a font with your own words: type the sample, change the size, and move any variable axes
 * (weight, width…). The sample and size are remembered across fonts, so comparing is quick.
 */
export function FontView({ url, onInfo }: { url: string; onInfo?: (i: FontInfo | null) => void }) {
  const [family, setFamily] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [axes, setAxes] = useState<FontAxis[]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [sample, setSample] = useState(() => remembered(SAMPLE_KEY, DEFAULT_SAMPLE));
  const [size, setSize] = useState(() => Number(remembered(SIZE_KEY, '64')) || 64);

  useEffect(() => {
    let cancelled = false;
    let face: FontFace | null = null;
    setFamily(null);
    setFailed(false);
    onInfo?.(null);
    void (async () => {
      try {
        const bytes = await (await fetch(url)).arrayBuffer();
        const name = `preview-${Math.random().toString(36).slice(2)}`;
        face = new FontFace(name, bytes);
        await face.load();
        if (cancelled) return;
        document.fonts.add(face);
        const found = readAxes(bytes);
        setAxes(found);
        setValues(Object.fromEntries(found.map((a) => [a.tag, a.value])));
        setFamily(name);
        onInfo?.({ family: name, axes: found });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (face) document.fonts.delete(face);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (failed) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <Typography sx={{ color: md('onSurfaceVariant') }}>This font can't be loaded.</Typography>
      </div>
    );
  }
  const style = { fontFamily: family ? `"${family}"` : 'inherit', fontVariationSettings: variationSettings(values), color: md('onSurface') };
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 48px 48px', opacity: family ? 1 : 0, transition: 'opacity 150ms' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', padding: '12px 20px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
          <InputBase
            value={sample}
            onChange={(e) => {
              setSample(e.target.value);
              remember(SAMPLE_KEY, e.target.value);
            }}
            placeholder="Type to try the font"
            inputProps={{ 'aria-label': 'Sample text' }}
            sx={{ flex: 1, minWidth: 240, typography: 'bodyLarge' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 220 }}>
            <Typography variant="labelMedium" sx={{ color: md('onSurfaceVariant'), width: 40 }}>
              {size}px
            </Typography>
            <Slider
              size="small"
              min={12}
              max={200}
              value={size}
              onChange={(_, v) => {
                setSize(v as number);
                remember(SIZE_KEY, String(v));
              }}
              aria-label="Size"
            />
          </div>
        </div>
        {axes.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 32px' }}>
            {axes.map((a) => (
              <div key={a.tag}>
                <Typography variant="labelMedium" sx={{ color: md('onSurfaceVariant') }}>
                  {a.name} · {Math.round(values[a.tag] ?? a.value)}
                </Typography>
                <Slider size="small" min={a.min} max={a.max} step={(a.max - a.min) / 200 || 1} value={values[a.tag] ?? a.value} onChange={(_, v) => setValues({ ...values, [a.tag]: v as number })} />
              </div>
            ))}
          </div>
        )}
        <div style={{ ...style, fontSize: size, lineHeight: 1.2, wordBreak: 'break-word', userSelect: 'text' }}>{sample || DEFAULT_SAMPLE}</div>
        <div style={{ ...style, fontSize: Math.max(18, size * 0.45), lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 4, opacity: 0.9 }}>
          {CHARSET.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <div style={{ ...style, fontSize: 16, lineHeight: 1.6, maxWidth: 680 }}>
          Every pack you collect, in one place, with its licence and source on record — so when the game ships, the credits are already written.
        </div>
      </div>
    </div>
  );
}
