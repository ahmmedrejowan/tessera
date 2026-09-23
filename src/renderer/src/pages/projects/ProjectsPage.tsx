import AddLinkOutlined from '@mui/icons-material/AddLinkOutlined';
import CheckCircle from '@mui/icons-material/CheckCircle';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { ENGINE_LABELS, type ProjectProbe, type ProjectSummary } from '@shared/project';
import { call } from '../../api';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import Tooltip from '@mui/material/Tooltip';
import { ask } from '../../notices/dialogs';
import { FolderIcon } from '../../components/icons';
import { EmptyState } from '../../components/EmptyState';
import { SortButton } from '../../components/SortButton';
import { failed, notify } from '../../notices/store';
import { useLibraryId } from '../../state/library';
import { useNav } from '../../state/nav';
import { useActiveProject, useProjects } from '../../state/projects';
import { md, SHAPE } from '../../theme';
import { Page } from '../Placeholder';
import { EngineBadge } from './EngineBadge';
import { LinkProjectDialog } from './LinkProjectDialog';

/** Pick a project folder and confirm it. */
export function useLinkProject() {
  const [probe, setProbe] = useState<ProjectProbe | null>(null);
  const go = useNav((s) => s.go);
  const start = async () => {
    try {
      setProbe(await call('projects:choose'));
    } catch (e) {
      failed(e);
    }
  };
  const dialog = (
    <LinkProjectDialog
      probe={probe}
      onClose={() => setProbe(null)}
      onLink={async (p) => {
        setProbe(null);
        try {
          const project = await call('projects:add', p);
          notify.success(`Linked ${project.name}.`);
          go({ to: 'project', id: project.id });
        } catch (e) {
          failed(e);
        }
      }}
    />
  );
  return { start, dialog };
}

/** Which libraries a project's assets came from, and how many from each. */
export function SourceChips({ sources }: { sources: ProjectSummary['sources'] }) {
  const openId = useLibraryId();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, minHeight: 22 }}>
      {sources.map((s) => (
        <span key={s.libraryId} title={s.libraryId === openId ? 'The open library' : 'Another library'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 10px 0 8px', borderRadius: SHAPE.full, fontSize: 12, background: s.libraryId === openId ? md('secondaryContainer') : md('surfaceContainerHighest'), color: s.libraryId === openId ? md('onSecondaryContainer') : md('onSurfaceVariant') }}>
          <AutoStoriesOutlined sx={{ fontSize: 14 }} />
          {s.libraryName} · {s.assets}
        </span>
      ))}
    </div>
  );
}

function ProjectCard({ p, active }: { p: ProjectSummary; active: boolean }) {
  const go = useNav((s) => s.go);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  return (
    <div className="tile" onClick={() => go({ to: 'project', id: p.id })} style={{ display: 'flex', gap: 16, padding: 16, borderRadius: SHAPE.lg, background: md('surfaceContainerLow'), cursor: 'default', alignItems: 'center' }}>
      <EngineBadge engine={p.engine} size={52} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleMedium" noWrap sx={{ color: md('onSurface'), display: 'flex', alignItems: 'center', gap: 1 }}>
          {p.name}
          {active && <CheckCircle titleAccess="Copy target" sx={{ fontSize: 18, color: md('primary') }} />}
        </Typography>
        <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant') }}>
          {ENGINE_LABELS[p.engine]}
          {p.engineVersion ? ` ${p.engineVersion}` : ''} · {p.assets} asset{p.assets === 1 ? '' : 's'} from {p.packs} pack{p.packs === 1 ? '' : 's'}
        </Typography>
        <Typography variant="bodySmall" noWrap sx={{ color: p.exists ? md('onSurfaceVariant') : md('error'), display: 'flex', alignItems: 'center', gap: 0.5 }} title={p.path}>
          {!p.exists && <WarningAmberOutlined sx={{ fontSize: 14 }} />}
          {p.exists ? p.path : `Can’t find ${p.path}`}
        </Typography>
        <SourceChips sources={p.sources} />
      </div>
      <Tooltip title="More">
        <IconButton
          aria-label={`More for ${p.name}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenu(e.currentTarget);
          }}
          sx={{ opacity: 0, '.tile:hover &': { opacity: 1 }, '&:focus-visible': { opacity: 1 } }}
        >
          <MoreVertRounded />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} onClick={(e) => e.stopPropagation()}>
        <MenuItem
          onClick={() => {
            setMenu(null);
            go({ to: 'project', id: p.id });
          }}
        >
          <ListItemIcon>
            <OpenInFullRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Open" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenu(null);
            void call('projects:reveal', p.id);
          }}
        >
          <ListItemIcon>
            <FolderIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Show its folder" />
        </MenuItem>
        <MenuItem
          onClick={async () => {
            setMenu(null);
            if (
              await ask<boolean>({
                tone: 'warning',
                title: `Forget ${p.name}?`,
                body: 'Tessera stops tracking what it linked there. The game and its files stay exactly as they are.',
                actions: [
                  { label: 'Keep it', value: false, kind: 'text' },
                  { label: 'Forget it', value: true, kind: 'danger' },
                ],
              })
            ) {
              await call('projects:unlink', p.id);
              notify.success(`Forgot ${p.name}.`);
            }
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'error.main' }}>
            <LinkOffOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Forget this game" />
        </MenuItem>
      </Menu>
    </div>
  );
}

/** The game projects assets are copied into. */
type ProjectSort = 'name' | 'used' | 'assets';

const byProject: Record<ProjectSort, (a: ProjectSummary, b: ProjectSummary) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  used: (a, b) => (b.lastCopy ?? '').localeCompare(a.lastCopy ?? ''),
  assets: (a, b) => b.assets - a.assets,
};

export function ProjectsPage() {
  const projects = useProjects().data;
  const active = useActiveProject();
  const link = useLinkProject();
  const [sort, setSort] = useState<ProjectSort>('name');
  return (
    <Page
      flush
      title="Projects"
      subtitle="Games this library links assets into: linking copies the files, with their licences, into the game's own folder"
      aside={
        <SortButton
          value={sort}
          options={[
            { value: 'name' as const, label: 'Name' },
            { value: 'used' as const, label: 'Recently linked to' },
            { value: 'assets' as const, label: 'Most assets' },
          ]}
          onChange={setSort}
          width={198}
        />
      }
      actions={
        <Button variant="contained" startIcon={<AddLinkOutlined />} onClick={() => void link.start()}>
          Add a game
        </Button>
      }
    >
      {projects && !projects.length ? (
        <EmptyState
          icon={SportsEsportsOutlined}
          title="No projects linked"
          body="Add a Unity, Godot or Unreal project, or any folder. Linking an asset to a game copies its files into that folder, with their textures, licences and credits."
          actions={
            <Button variant="contained" startIcon={<AddLinkOutlined />} onClick={() => void link.start()}>
              Link a project
            </Button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12, padding: '8px 32px 32px' }}>
          {[...(projects ?? [])].sort(byProject[sort]).map((p) => <ProjectCard key={p.id} p={p} active={active?.id === p.id} />)}
        </div>
      )}
      {link.dialog}
    </Page>
  );
}
