import AddLinkOutlined from '@mui/icons-material/AddLinkOutlined';
import Check from '@mui/icons-material/Check';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { ENGINE_LABELS } from '@shared/project';
import { copyToProject, useActiveProject, useProjects } from '../../state/projects';
import { useUpdateSettings } from '../../state/queries';
import { useLinkProject } from './ProjectsPage';

type Items = { packId: string; ref: string }[];

/**
 * "Link to a game": the games you have added, the one last linked to ticked, and a way to add
 * another. `items` is asked for once a project is chosen, so a big pile is only resolved if
 * it's going somewhere.
 */
export function ProjectMenu({ anchor, onClose, items }: { anchor: HTMLElement | null; onClose: () => void; items: () => Promise<Items> }) {
  const projects = useProjects().data ?? [];
  const active = useActiveProject();
  const update = useUpdateSettings();
  const link = useLinkProject();
  return (
    <>
      <Menu anchorEl={anchor} open={!!anchor} onClose={onClose} slotProps={{ paper: { sx: { minWidth: 280, maxHeight: 420 } } }}>
        {projects.map((p) => (
          <MenuItem
            key={p.id}
            disabled={!p.exists}
            onClick={async () => {
              onClose();
              if (active?.id !== p.id) update.mutate({ activeProjectId: p.id });
              await copyToProject(p, await items());
            }}
          >
            <ListItemIcon>{active?.id === p.id ? <Check fontSize="small" /> : null}</ListItemIcon>
            <ListItemText primary={p.name} secondary={p.exists ? ENGINE_LABELS[p.engine] : 'Can’t find its folder'} />
          </MenuItem>
        ))}
        {projects.length > 0 && <Divider />}
        <MenuItem
          onClick={() => {
            onClose();
            void link.start();
          }}
        >
          <ListItemIcon>
            <AddLinkOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Add a game…" />
        </MenuItem>
      </Menu>
      {link.dialog}
    </>
  );
}
