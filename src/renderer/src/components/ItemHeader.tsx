import ArrowBack from '@mui/icons-material/ArrowBack';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { ComponentType, ReactNode } from 'react';
import { md, SHAPE, STATE } from '../theme';
import { CollectionIcon, ProjectIcon } from './icons';
import { Scrolling } from './Scrolling';

/** The height of the whole header: the actions decide it, the preview matches it. */
export const HEADER_SIZE = 152;

export interface ItemAction {
  label: string;
  icon: ComponentType<{ sx?: object; fontSize?: 'small' | 'inherit' }>;
  onClick: (anchor: HTMLElement) => void;
  /** The one thing this header is for, drawn as a filled button at the top. */
  primary?: boolean;
  danger?: boolean;
  hidden?: boolean;
}

/** Names first, then how many more there are: "Bunny Dash, Toy Town +2 games". */
function Belongs({ icon: Icon, names, total, word, empty, onOpen }: { icon: ComponentType<{ sx?: object }>; names: string[]; total: number; word: string; empty: string; onOpen: () => void }) {
  const shown = names.slice(0, 2);
  const more = total - shown.length;
  if (!total) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <Icon sx={{ fontSize: 16, color: md('outline') }} />
        <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), opacity: 0.8 }}>
          {empty}
        </Typography>
      </div>
    );
  }
  // The names are the door; the counter only appears when there are more than it can show.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <Icon sx={{ fontSize: 16, color: md('onSurfaceVariant') }} />
      <ButtonBase onClick={onOpen} sx={{ minWidth: 0, flexShrink: 1, borderRadius: `${SHAPE.sm}px`, px: 0.5, justifyContent: 'flex-start' }}>
        <Scrolling title={names.join(', ')} style={{ minWidth: 0 }}>
          <Typography variant="bodySmall" component="span" sx={{ color: md('onSurfaceVariant') }}>
            {shown.join(', ')}
          </Typography>
        </Scrolling>
      </ButtonBase>
      {more > 0 && (
        <ButtonBase onClick={onOpen} sx={{ flexShrink: 0, borderRadius: `${SHAPE.sm}px`, px: 0.5 }}>
          <Typography variant="bodySmall" sx={{ color: md('primary') }}>
            +{more} more {word}
            {more === 1 ? '' : 's'}
          </Typography>
        </ButtonBase>
      )}
      <span style={{ flex: 1 }} />
    </div>
  );
}

/**
 * The head of a pack or an asset: what it looks like, what it is, what it belongs to, and the
 * handful of things to do with it. The actions on the right set the height and the preview on the
 * left matches it, so every item's header is the same size whether it knows everything about
 * itself or nothing.
 */
export function ItemHeader({
  onBack,
  preview,
  star,
  name,
  facts,
  licence,
  games,
  collections,
  actions,
}: {
  /** Where you came from, when there is one. */
  onBack?: () => void;
  preview: ReactNode;
  /** The star, drawn above the preview's top-left corner. */
  star?: ReactNode;
  name: string;
  /** What it is made of: files, kinds, size. */
  facts: ReactNode;
  /** Its licence, creator and where it came from. */
  licence: ReactNode;
  games: { names: string[]; total: number; onOpen: () => void };
  collections: { names: string[]; total: number; onOpen: () => void };
  actions: ItemAction[];
}) {
  return (
    <header style={{ display: 'flex', gap: 16, padding: '16px 32px 12px', alignItems: 'flex-start' }}>
      {onBack && (
        <Tooltip title="Back">
          <IconButton onClick={onBack} aria-label="Back" sx={{ ml: -2, mt: -0.5 }}>
            <ArrowBack />
          </IconButton>
        </Tooltip>
      )}
      <div style={{ position: 'relative', width: HEADER_SIZE, height: HEADER_SIZE, flexShrink: 0 }}>
        {preview}
        {star && <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 1 }}>{star}</div>}
      </div>

      <div style={{ flex: 1, minWidth: 0, height: HEADER_SIZE, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2 }}>
        <Scrolling title={name}>
          <Typography variant="headlineSmall" component="h1" sx={{ color: md('onSurface') }}>
            {name}
          </Typography>
        </Scrolling>
        <Scrolling>{facts}</Scrolling>
        <div style={{ minWidth: 0 }}>{licence}</div>
        <Belongs icon={ProjectIcon} names={games.names} total={games.total} word="game" empty="In no game yet" onOpen={games.onOpen} />
        <Belongs icon={CollectionIcon} names={collections.names} total={collections.total} word="collection" empty="In no collection" onOpen={collections.onOpen} />
      </div>

      <div style={{ width: 190, flexShrink: 0, borderLeft: `1px solid ${md('outlineVariant')}`, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {actions
          .filter((a) => !a.hidden)
          .map((a) => {
            const Icon = a.icon;
            return (
              <ButtonBase
                key={a.label}
                onClick={(e) => a.onClick(e.currentTarget)}
                sx={{
                  justifyContent: a.primary ? 'center' : 'flex-start',
                  gap: 1.25,
                  height: a.primary ? 36 : 28,
                  px: a.primary ? 1.5 : 1,
                  mb: a.primary ? 0.5 : 0,
                  borderRadius: `${SHAPE.sm}px`,
                  backgroundColor: a.primary ? md('primary') : 'transparent',
                  color: a.primary ? md('onPrimary') : a.danger ? md('error') : md('onSurfaceVariant'),
                  '&:hover': { backgroundColor: a.primary ? md('primary') : md('surfaceContainerHigh') },
                  '&:hover .over': { opacity: a.primary ? STATE.hover : 0 },
                }}
              >
                {a.primary ? null : <Icon sx={{ fontSize: 18 }} />}
                <Typography variant="labelLarge" noWrap sx={{ fontWeight: a.primary ? 600 : 500 }}>
                  {a.label}
                </Typography>
                <span className="over" style={{ position: 'absolute', inset: 0, background: md('onPrimary'), opacity: 0, borderRadius: SHAPE.sm }} />
              </ButtonBase>
            );
          })}
      </div>
    </header>
  );
}
