import StarOutlineRounded from '@mui/icons-material/StarOutlineRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import type { MouseEvent } from 'react';
import { call } from '../../api';
import { failed } from '../../notices/store';
import { md, mdAlpha } from '../../theme';

/** Star an asset, or take the star off. */
export const starAsset = (packId: string, ref: string, on: boolean) => void call('favourites:assets', [{ packId, ref }], on).catch(failed);

/** Star a whole pack, or take the star off. */
export const starPack = (id: string, on: boolean) => void call('favourites:pack', id, on).catch(failed);

/**
 * The star in a tile's corner. It stays showing once it is on, and appears on hover when it is
 * off, so a grid of unstarred things stays quiet.
 */
export function StarButton({ on, name, selected, onToggle }: { on: boolean; name: string; selected: boolean; onToggle: (on: boolean) => void }) {
  return (
    <Tooltip title={on ? 'Take the star off' : 'Star it'}>
      <IconButton
        size="small"
        aria-label={on ? `Take the star off ${name}` : `Star ${name}`}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          onToggle(!on);
        }}
        sx={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 1,
          opacity: on || selected ? 1 : 0,
          color: on ? md('tertiary') : md('onSurfaceVariant'),
          backgroundColor: mdAlpha('surface', 0.86),
          '&:hover': { backgroundColor: md('surface') },
          '.tile:hover &': { opacity: 1 },
          '&:focus-visible': { opacity: 1 },
        }}
      >
        {on ? <StarRounded fontSize="small" /> : <StarOutlineRounded fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
