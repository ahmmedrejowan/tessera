import ArrowBack from '@mui/icons-material/ArrowBack';
import CheckCircle from '@mui/icons-material/CheckCircle';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { extOf, kindOf, type AssetType } from '@shared/assets';
import { ENGINE_LABELS, type ManifestEntry } from '@shared/project';
import { call } from '../../api';
import { AssetThumb } from '../../components/AssetThumb';
import { EmptyState } from '../../components/EmptyState';
import { displayName } from '../../components/labels';
import { LicenceChip } from '../../components/LicenceChip';
import { failed, notify } from '../../notices/store';
import { useLibraryId } from '../../state/library';
import { useNav } from '../../state/nav';
import { copyToProject, useActiveProject, useProjects } from '../../state/projects';
import { useUpdateSettings } from '../../state/queries';
import { md, SHAPE } from '../../theme';
import { EngineBadge } from './EngineBadge';

const TYPE_OF: Record<string, AssetType> = { model: 'model', image: 'sprite', audio: 'sfx', font: 'font' };

function Setting({ title, body, children }: { title: string; body: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: `1px solid ${md('outlineVariant')}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
          {body}
        </Typography>
      </div>
      {children}
    </div>
  );
}

/** One linked project: where assets go, its credits, and what's been copied into it. */
export function ProjectPage({ id }: { id: string }) {
  const { goBack, back, go } = useNav();
  const project = useProjects().data?.find((p) => p.id === id);
  const active = useActiveProject();
  const updateSettings = useUpdateSettings();
  const entries = useQuery({ queryKey: ['projects', 'entries', id, project?.assets, project?.lastCopy], queryFn: () => call('projects:entries', id), enabled: !!project?.exists }).data ?? [];
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const openId = useLibraryId();
  // By library (the open one first), then by pack.
  const byLibrary = useMemo(() => {
    const libs = new Map<string, { id: string; name: string; packs: Map<string, ManifestEntry[]> }>();
    for (const e of entries) {
      const id = e.libraryId ?? '';
      const lib = libs.get(id) ?? { id, name: e.libraryName ?? 'Another library', packs: new Map() };
      lib.packs.set(e.packId, [...(lib.packs.get(e.packId) ?? []), e]);
      libs.set(id, lib);
    }
    return [...libs.values()]
      .sort((a, b) => Number(b.id === openId) - Number(a.id === openId) || a.name.localeCompare(b.name))
      .map((l) => ({ ...l, packs: [...l.packs.values()].sort((a, b) => a[0]!.packName.localeCompare(b[0]!.packName)) }));
  }, [entries, openId]);

  if (!project) return null;
  const isActive = active?.id === id;
  const remove = async (items: ManifestEntry[]) => {
    const n = await call('projects:remove', id, items.map((e) => ({ packId: e.packId, ref: e.ref, ...(e.libraryId ? { libraryId: e.libraryId } : {}) })));
    notify.success(`Removed ${n} asset${n === 1 ? '' : 's'} from ${project.name}.`);
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 32px 8px' }}>
        {back.length > 0 && (
          <IconButton onClick={goBack} aria-label="Back" sx={{ ml: -1.5 }}>
            <ArrowBack />
          </IconButton>
        )}
        <EngineBadge engine={project.engine} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography variant="headlineSmall" component="h1" sx={{ color: md('onSurface') }}>
            {project.name}
          </Typography>
          <Typography variant="bodyMedium" noWrap sx={{ color: project.exists ? md('onSurfaceVariant') : md('error') }} title={project.path}>
            {ENGINE_LABELS[project.engine]}
            {project.engineVersion ? ` ${project.engineVersion}` : ''} · {project.exists ? project.path : `Can’t find ${project.path}`}
          </Typography>
        </div>
        {isActive ? (
          <Button startIcon={<CheckCircle />} disabled sx={{ '&.Mui-disabled': { color: md('primary') } }}>
            Copy target
          </Button>
        ) : (
          <Button variant="outlined" onClick={() => updateSettings.mutate({ activeProjectId: id })}>
            Copy to this project
          </Button>
        )}
        <Tooltip title="Open the project folder">
          <IconButton onClick={() => void call('projects:reveal', id)} aria-label="Open folder">
            <FolderOpenOutlined />
          </IconButton>
        </Tooltip>
        <Tooltip title="Unlink">
          <IconButton onClick={() => setUnlinking(true)} aria-label="Unlink">
            <LinkOffOutlined />
          </IconButton>
        </Tooltip>
      </header>

      <div style={{ padding: '0 32px 32px', maxWidth: 1000 }}>
        <Setting title="Assets go into" body={<code>{project.target}/</code>}>
          <Button startIcon={<EditOutlined />} onClick={() => setEditingTarget(project.target)}>
            Change
          </Button>
        </Setting>
        <Setting
          title="Credits file"
          body={project.creditsFile ? <>Kept up to date at <code>{project.creditsFile}</code>, with every pack you use and the credit its licence asks for.</> : 'Off. Turn it on to have the credits written for you.'}
        >
          {project.creditsFile && (
            <Button onClick={() => void call('projects:reveal', id, project.creditsFile!)} startIcon={<FolderOpenOutlined />}>
              Show
            </Button>
          )}
          <Switch checked={!!project.creditsFile} onChange={(_, on) => void call('projects:update', id, { creditsFile: on ? 'CREDITS.md' : null })} />
        </Setting>

        <Typography variant="titleMedium" sx={{ color: md('onSurface'), mt: 4, mb: 1 }}>
          Copied into this project · {entries.length}
        </Typography>
        {!entries.length ? (
          <EmptyState
            icon={SportsEsportsOutlined}
            title="Nothing copied yet"
            body={`Select assets in Browse and choose “Copy to ${project.name}”. They arrive in ${project.target}/ with their textures and a licence file.`}
            actions={<Button onClick={() => go({ to: 'browse' })}>Go to Browse</Button>}
          />
        ) : (
          byLibrary.map((lib) => (
            <div key={lib.id}>
              {(byLibrary.length > 1 || lib.id !== openId) && (
                <Typography variant="labelLarge" component="div" sx={{ color: md('onSurfaceVariant'), mt: 2, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  From “{lib.name}”
                  {lib.id !== openId && <span style={{ fontWeight: 400 }}>· open that library to preview or copy these again</span>}
                </Typography>
              )}
              {lib.packs.map((list) => {
            const first = list[0]!;
            const here = (first.libraryId ?? '') === openId;
            return (
              <section key={first.packId} style={{ marginBottom: 16, padding: 12, borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <Typography variant="titleSmall" sx={{ color: md('onSurface'), flex: 1, cursor: here ? 'pointer' : 'default' }} onClick={() => here && go({ to: 'pack', id: first.packId })}>
                    {first.packName}
                  </Typography>
                  <LicenceChip id={first.licence} />
                  <Tooltip title={here ? 'Copy again, picking up changes' : ''}>
                    <IconButton size="small" disabled={!here} sx={{ visibility: here ? 'visible' : 'hidden' }} onClick={() => void copyToProject(project, list.map((e) => ({ packId: e.packId, ref: e.ref })))}>
                      <RefreshOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove this pack’s assets from the project">
                    <IconButton size="small" onClick={() => void remove(list)}>
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </div>
                {first.attribution && (
                  <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), mb: 1, fontStyle: 'italic' }}>
                    {first.attribution}
                  </Typography>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  {list.map((e) => {
                    const kind = kindOf(e.copiedRef);
                    return (
                      <div key={e.ref} className="tile" style={{ padding: 6, borderRadius: SHAPE.md }} title={e.files.join('\n')} onDoubleClick={() => void call('projects:reveal', id, e.files[0]!)}>
                        {here ? (
                          <AssetThumb asset={{ packId: e.packId, ref: e.ref, ext: extOf(e.ref), kind, type: TYPE_OF[kind] ?? 'other' }} size={108} />
                        ) : (
                          <div style={{ height: 108, borderRadius: SHAPE.sm, display: 'grid', placeItems: 'center', background: md('surfaceContainerHighest'), color: md('onSurfaceVariant') }}>
                            <InsertDriveFileOutlined />
                          </div>
                        )}
                        <Typography variant="labelMedium" noWrap component="div" sx={{ mt: 0.5, color: md('onSurface') }}>
                          {displayName(e.copiedRef.split(/[/!]/).pop()!)}
                        </Typography>
                        <Typography variant="labelSmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }}>
                          {extOf(e.copiedRef).toUpperCase()}
                          {e.files.length > 1 ? ` + ${e.files.length - 1} file${e.files.length > 2 ? 's' : ''}` : ''}
                        </Typography>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
              })}
            </div>
          ))
        )}
      </div>

      <Dialog open={editingTarget !== null} onClose={() => setEditingTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Where assets go</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Folder inside the project" value={editingTarget ?? ''} onChange={(e) => setEditingTarget(e.target.value)} sx={{ mt: 1 }} helperText="Assets already copied stay where they are." />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              try {
                await call('projects:update', id, { target: editingTarget ?? '' });
                setEditingTarget(null);
              } catch (e) {
                failed(e);
              }
            }}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={unlinking} onClose={() => setUnlinking(false)}>
        <DialogTitle>Unlink {project.name}?</DialogTitle>
        <DialogContent>
          <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
            Tessera forgets the project. Nothing in its folder changes: copied assets, licence files and credits stay.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnlinking(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={async () => {
              setUnlinking(false);
              await call('projects:unlink', id);
              go({ to: 'projects' });
            }}
          >
            Unlink
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
