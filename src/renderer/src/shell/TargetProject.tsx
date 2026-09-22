import AddLinkOutlined from '@mui/icons-material/AddLinkOutlined';
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import Check from '@mui/icons-material/Check';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { ENGINE_LABELS } from '@shared/project';
import { EngineBadge } from '../pages/projects/EngineBadge';
import { useLinkProject } from '../pages/projects/ProjectsPage';
import { useNav } from '../state/nav';
import { useActiveProject, useProjects } from '../state/projects';
import { useUpdateSettings } from '../state/queries';
import { md, SHAPE } from '../theme';

/** "Copying to: Bunny Dash ▾" — which project Copy sends assets to. */
export function TargetProject() {
  const projects = useProjects().data ?? [];
  const active = useActiveProject();
  const update = useUpdateSettings();
  const go = useNav((s) => s.go);
  const link = useLinkProject();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Project to copy into"
        sx={{ gap: 1, pl: 0.75, pr: 0.5, height: 40, borderRadius: `${SHAPE.full}px`, border: `1px solid ${md('outlineVariant')}`, '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
      >
        {active ? <EngineBadge engine={active.engine} size={28} /> : <AddLinkOutlined sx={{ fontSize: 20, color: md('onSurfaceVariant'), ml: 0.5 }} />}
        <div style={{ textAlign: 'left', lineHeight: 1 }}>
          <Typography variant="labelSmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
            {active ? 'Copying to' : 'No project'}
          </Typography>
          <Typography variant="labelLarge" component="div" noWrap sx={{ color: md('onSurface'), maxWidth: 160 }}>
            {active?.name ?? 'Link one'}
          </Typography>
        </div>
        <ArrowDropDown sx={{ color: md('onSurfaceVariant') }} />
      </ButtonBase>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} slotProps={{ paper: { sx: { minWidth: 280 } } }}>
        {projects.map((p) => (
          <MenuItem
            key={p.id}
            onClick={() => {
              update.mutate({ activeProjectId: p.id });
              setAnchor(null);
            }}
          >
            <ListItemIcon>{active?.id === p.id ? <Check /> : null}</ListItemIcon>
            <ListItemText primary={p.name} secondary={ENGINE_LABELS[p.engine]} />
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
