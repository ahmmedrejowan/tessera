import AddLinkOutlined from '@mui/icons-material/AddLinkOutlined';
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import Check from '@mui/icons-material/Check';
import DriveFileMoveOutlined from '@mui/icons-material/DriveFileMoveOutlined';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import { ENGINE_LABELS } from '@shared/project';
import { useNav } from '../../state/nav';
import { copyToProject, useActiveProject, useProjects } from '../../state/projects';
import { useUpdateSettings } from '../../state/queries';
import { useLinkProject } from './ProjectsPage';

type Items = { packId: string; ref: string }[];

/**
 * "Copy to Bunny Dash ▾": copies to the project last copied to; the arrow copies to another one
 * (which it then remembers) or links a new one. Projects are shared by every library.
 */
export function CopyButton({ items, variant = 'contained', size = 'small', color, sx }: { items: () => Promise<Items> | Items; variant?: 'contained' | 'text'; size?: 'small' | 'medium'; color?: string; sx?: object }) {
  const projects = useProjects().data ?? [];
  const active = useActiveProject();
  const update = useUpdateSettings();
  const go = useNav((s) => s.go);
  const link = useLinkProject();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const tone = color ? { color, borderColor: `${color} !important` } : {};
  const copyTo = async (p: { id: string; name: string }) => {
    setAnchor(null);
    if (active?.id !== p.id) update.mutate({ activeProjectId: p.id });
    await copyToProject(p, await items());
  };
  return (
    <>
      <ButtonGroup variant={variant} size={size} disableElevation sx={sx} aria-label="Copy to a project">
        <Button startIcon={<DriveFileMoveOutlined />} sx={{ ...tone, maxWidth: 260 }} onClick={async (e) => (active ? void copyTo(active) : setAnchor(e.currentTarget.parentElement))}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active ? `Copy to ${active.name}` : 'Copy to project…'}</span>
        </Button>
        <Button aria-label="Choose the project" onClick={(e) => setAnchor(e.currentTarget.parentElement)} sx={{ ...tone, px: 0, minWidth: 32 }}>
          <ArrowDropDown />
        </Button>
      </ButtonGroup>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { minWidth: 280 } } }}>
        {projects.map((p) => (
          <MenuItem key={p.id} disabled={!p.exists} onClick={() => void copyTo(p)}>
            <ListItemIcon>{active?.id === p.id ? <Check /> : null}</ListItemIcon>
            <ListItemText primary={`Copy to ${p.name}`} secondary={p.exists ? ENGINE_LABELS[p.engine] : 'Can’t find its folder'} />
          </MenuItem>
        ))}
        {projects.length > 0 && <Divider />}
        <MenuItem
          onClick={() => {
            setAnchor(null);
            void link.start();
          }}
        >
          <ListItemIcon>
            <AddLinkOutlined />
          </ListItemIcon>
          <ListItemText primary="Link a project…" />
        </MenuItem>
        {projects.length > 0 && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              go({ to: 'projects' });
            }}
          >
            <ListItemIcon />
            <ListItemText primary="Manage projects" />
          </MenuItem>
        )}
      </Menu>
      {link.dialog}
    </>
  );
}
