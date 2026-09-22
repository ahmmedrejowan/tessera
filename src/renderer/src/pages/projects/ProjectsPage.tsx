import AddLinkOutlined from '@mui/icons-material/AddLinkOutlined';
import CheckCircle from '@mui/icons-material/CheckCircle';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { ENGINE_LABELS, type ProjectProbe, type ProjectSummary } from '@shared/project';
import { call } from '../../api';
import { EmptyState } from '../../components/EmptyState';
import { failed, notify } from '../../notices/store';
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

function ProjectCard({ p, active }: { p: ProjectSummary; active: boolean }) {
  const go = useNav((s) => s.go);
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
      </div>
    </div>
  );
}

/** The game projects assets are copied into. */
export function ProjectsPage() {
  const projects = useProjects().data;
  const active = useActiveProject();
  const link = useLinkProject();
  return (
    <Page
      title="Projects"
      actions={
        <Button variant="contained" startIcon={<AddLinkOutlined />} onClick={() => void link.start()}>
          Link a project
        </Button>
      }
    >
      {projects && !projects.length ? (
        <EmptyState
          icon={SportsEsportsOutlined}
          title="No projects linked"
          body="Link a Unity, Godot or Unreal project, or any folder. Then “Copy to project” puts assets straight into it — with their textures, a licence file per pack, and a CREDITS.md kept up to date."
          actions={
            <Button variant="contained" startIcon={<AddLinkOutlined />} onClick={() => void link.start()}>
              Link a project
            </Button>
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12, padding: '8px 32px 32px' }}>
          {projects?.map((p) => <ProjectCard key={p.id} p={p} active={active?.id === p.id} />)}
        </div>
      )}
      {link.dialog}
    </Page>
  );
}
