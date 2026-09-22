import BookmarkAddOutlined from '@mui/icons-material/BookmarkAddOutlined';
import DriveFileMoveOutlined from '@mui/icons-material/DriveFileMoveOutlined';
import Close from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { call } from '../../api';
import { useBrowse } from '../../state/browse';
import { copyToProject, useActiveProject } from '../../state/projects';
import { md, mdAlpha, SHAPE } from '../../theme';
import { CollectionMenu } from '../collections/CollectionMenu';

/** Floating bar for what's selected in the grid: add it to a collection, or clear it. */
export function SelectionBar() {
  const selection = useBrowse((s) => s.selection);
  const select = useBrowse((s) => s.select);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const project = useActiveProject();
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
        {selection.size} selected
      </Typography>
      <Button startIcon={<BookmarkAddOutlined />} onClick={(e) => setAnchor(e.currentTarget)} sx={{ color: md('inversePrimary') }}>
        Add to collection
      </Button>
      <Button startIcon={<DriveFileMoveOutlined />} onClick={async () => copyToProject(project, await refs())} sx={{ color: md('inversePrimary') }}>
        {project ? `Copy to ${project.name}` : 'Copy to project'}
      </Button>
      <IconButton aria-label="Clear selection" onClick={() => select([], null)} sx={{ color: md('inverseOnSurface') }}>
        <Close fontSize="small" />
      </IconButton>
      <CollectionMenu anchor={anchor} onClose={() => setAnchor(null)} items={refs} />
    </div>
  );
}
