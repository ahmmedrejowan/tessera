import GraphicEqRounded from '@mui/icons-material/GraphicEqRounded';
import ImageRounded from '@mui/icons-material/ImageRounded';
import MusicNoteRounded from '@mui/icons-material/MusicNoteRounded';
import PaletteRounded from '@mui/icons-material/PaletteRounded';
import PanoramaRounded from '@mui/icons-material/PanoramaRounded';
import TextureRounded from '@mui/icons-material/TextureRounded';
import ViewInArRounded from '@mui/icons-material/ViewInArRounded';
import WidgetsRounded from '@mui/icons-material/WidgetsRounded';
import type { ComponentType } from 'react';
import { md, mdAlpha, type Role } from '../theme/m3';

interface Tile {
  /** Grid placement: column / row start and span. */
  col: string;
  row: string;
  bg: Role;
  fg: Role;
  icon?: ComponentType<{ sx?: object }>;
  text?: string;
  size?: number;
}

/**
 * The mosaic the app is named after: tiles in the theme's colours, some carrying the kinds of
 * asset Tessera holds. Each tile drifts a little on its own rhythm; with reduced motion they stay put.
 */
const TILES: Tile[] = [
  { col: '1 / span 2', row: '1 / span 2', bg: 'primary', fg: 'onPrimary', icon: ViewInArRounded, size: 72 },
  { col: '3', row: '1', bg: 'secondaryContainer', fg: 'onSecondaryContainer', icon: ImageRounded },
  { col: '4', row: '1 / span 2', bg: 'tertiaryContainer', fg: 'onTertiaryContainer', icon: GraphicEqRounded, size: 44 },
  { col: '3', row: '2', bg: 'surfaceBright', fg: 'primary', text: 'Aa' },
  { col: '1', row: '3', bg: 'surfaceBright', fg: 'tertiary', icon: MusicNoteRounded },
  { col: '2 / span 2', row: '3', bg: 'secondary', fg: 'onSecondary', icon: WidgetsRounded },
  { col: '4', row: '3 / span 2', bg: 'primaryContainer', fg: 'onPrimaryContainer', icon: PanoramaRounded, size: 44 },
  { col: '1 / span 2', row: '4', bg: 'tertiary', fg: 'onTertiary', icon: TextureRounded },
  { col: '3', row: '4', bg: 'surfaceBright', fg: 'secondary', icon: PaletteRounded },
];

export function MosaicHero() {
  return (
    <div
      aria-hidden
      style={{
        height: '100%',
        borderRadius: 40,
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        background: `radial-gradient(120% 90% at 15% 10%, ${mdAlpha('primaryContainer', 0.95)} 0%, transparent 60%), radial-gradient(100% 80% at 90% 95%, ${mdAlpha('tertiaryContainer', 0.9)} 0%, transparent 55%), ${md('secondaryContainer')}`,
      }}
    >
      <style>{`
        @keyframes tessera-drift { 0%, 100% { transform: translate(0, 0) rotate(0deg); } 50% { transform: translate(0, -8px) rotate(-1.2deg); } }
        @keyframes tessera-in { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: none; } }
        .tessera-tile { animation: tessera-in 600ms cubic-bezier(.2,.8,.2,1) both, tessera-drift 7s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .tessera-tile { animation: none; } }
      `}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 96px))', gridAutoRows: 'minmax(0, 96px)', gap: 14, width: 'min(84%, 426px)' }}>
        {TILES.map((t, i) => {
          const Icon = t.icon;
          return (
            <div
              key={i}
              className="tessera-tile"
              style={{
                gridColumn: t.col,
                gridRow: t.row,
                borderRadius: 26,
                background: md(t.bg),
                color: md(t.fg),
                display: 'grid',
                placeItems: 'center',
                boxShadow: `0 1px 2px ${mdAlpha('shadow', 0.12)}, 0 8px 24px ${mdAlpha('shadow', 0.08)}`,
                animationDelay: `${i * 70}ms, ${i * -0.9}s`,
                animationDuration: `600ms, ${6 + (i % 4)}s`,
              }}
            >
              {Icon && <Icon sx={{ fontSize: t.size ?? 36 }} />}
              {t.text && <span style={{ font: `600 34px/1 "Roboto Flex Variable", sans-serif`, letterSpacing: '-0.5px' }}>{t.text}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
