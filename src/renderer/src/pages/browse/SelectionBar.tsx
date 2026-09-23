import BookmarkAddOutlined from '@mui/icons-material/BookmarkAddOutlined';
import Close from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { call } from '../../api';
import { useNotices } from '../../notices/store';
import { useBrowse } from '../../state/browse';
import { CopyButton } from '../projects/CopyButton';
import { md, mdAlpha, SHAPE } from '../../theme';
import { CollectionMenu } from '../collections/CollectionMenu';

/** Floating bar for what's picked out in the grid: what can be done with it, and a way out. */
export function SelectionBar({ packs }: { packs?: boolean } = {}) {
  const selection = useBrowse((s) => s.selection);
  const select = useBrowse((s) => s.select);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // Toasts rise above the bar while it's showing.
  useEffect(() => {
    useNotices.getState().setLift(68);
    return () => useNotices.getState().setLift(0);
  }, []);
  const refs = () => call('assets:refs', [...selection].map(Number));
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 6px 6px 20px',
        borderRadius: SHAPE.full,
        background: md('inverseSurface'),
        color: md('inverseOnSurface'),
        boxShadow: `0 4px 16px ${mdAlpha('shadow', 0.25)}`,
      }}
    >
      <Typography variant="labelLarge" sx={{ mr: 1 }}>
        {selection.size} picked
      </Typography>
      {!packs && (
        <>
          <Button startIcon={<BookmarkAddOutlined />} onClick={(e) => setAnchor(e.currentTarget)} sx={{ color: md('inversePrimary') }}>
            Add to collection
          </Button>
          <CopyButton items={refs} variant="text" size="medium" color={md('inversePrimary')} />
        </>
      )}
      <IconButton aria-label="Clear selection" onClick={() => select([], null)} sx={{ color: md('inverseOnSurface') }}>
        <Close fontSize="small" />
      </IconButton>
      {!packs && <CollectionMenu anchor={anchor} onClose={() => setAnchor(null)} items={refs} />}
    </div>
  );
}
