import CheckCircle from '@mui/icons-material/CheckCircle';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import FindInPageOutlined from '@mui/icons-material/FindInPageOutlined';
import ViewInArOutlined from '@mui/icons-material/ViewInArOutlined';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { extOf, kindOf, type AssetType } from '@shared/assets';
import { ENGINE_LABELS, type ManifestEntry, type ProjectSummary } from '@shared/project';
import { call } from '../../api';
import { AssetThumb } from '../../components/AssetThumb';
import { EmptyState } from '../../components/EmptyState';
import { HEADER_SIZE, ItemHeader, type ItemAction } from '../../components/ItemHeader';
import { Markdown } from '../../components/Markdown';
import { Page } from '../Placeholder';
import { displayName, formatCount } from '../../components/labels';
import { LicenseChip } from '../../components/LicenseChip';
import { ask } from '../../notices/dialogs';
import { failed, notify } from '../../notices/store';
import { useLibraryId } from '../../state/library';
import { useNav } from '../../state/nav';
import { copyToProject, useActiveProject, useProjects } from '../../state/projects';
import { useUpdateSettings } from '../../state/queries';
import { md, SHAPE } from '../../theme';
import { AlreadyHere } from './AlreadyHere';
import { EngineBadge } from './EngineBadge';

type TabId = 'assets' | 'credits' | 'settings';

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

/**
 * The credits file two ways at once: what is written on the left, what it comes out as on the
 * right.
 *
 * Both, because both matter. The markdown is the file that ships with the game and gets pasted
 * into a store page or an itch description, and the preview is what the player will read. Seeing
 * them side by side is how you notice that a credit line is missing before anybody else does.
 */
function Credits({ project }: { project: ProjectSummary }) {
  const credits = useQuery({
    queryKey: ['projects', 'credits', project.id, project.assets, project.lastCopy, project.creditsFile],
    queryFn: () => call('projects:credits', project.id),
    enabled: project.exists,
  });
  const text = credits.data?.text ?? '';
  const onDisk = credits.data?.onDisk ?? false;
  // A game whose folder has gone has no credits to read and none to work out: the page says so
  // rather than showing two empty columns and letting somebody wonder.
  if (!project.exists) {
    return (
      <div style={{ padding: '24px 32px' }}>
        <Typography variant="bodyMedium" sx={{ color: md('error') }}>
          Tessera can’t find {project.path}, so it can’t read this game’s credits.
        </Typography>
      </div>
    );
  }
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 32px' }}>
        <DescriptionOutlined sx={{ fontSize: 20, color: md('onSurfaceVariant') }} />
        <Typography variant="bodyMedium" component="div" sx={{ flex: 1, minWidth: 0, color: md('onSurfaceVariant') }}>
          {project.creditsFile ? (
            onDisk ? (
              <>Written at <code>{project.creditsFile}</code>, and kept up to date every time this game takes an asset or gives one back.</>
            ) : (
              <>It will be at <code>{project.creditsFile}</code>. This is what goes in it; it is written the next time this game takes an asset.</>
            )
          ) : (
            'No credits file is kept for this game. This is what one would say.'
          )}
        </Typography>
        {project.creditsFile && onDisk && (
          <Button size="small" startIcon={<FolderOpenOutlined />} onClick={() => void call('projects:reveal', project.id, project.creditsFile!)}>
            Show
          </Button>
        )}
        <Button size="small" onClick={() => void navigator.clipboard.writeText(text)} disabled={!text}>
          Copy text
        </Button>
      </div>
      {/* Two columns while there is room for two, one underneath the other when there is not. */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 1, background: md('outlineVariant'), borderTop: `1px solid ${md('outlineVariant')}` }}>
        <div style={{ background: md('surface'), padding: '16px 24px', minWidth: 0 }}>
          <Typography variant="labelMedium" component="div" sx={{ color: md('onSurfaceVariant'), mb: 1 }}>
            Markdown
          </Typography>
          <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: md('onSurface') }}>{text}</pre>
        </div>
        <div style={{ background: md('surface'), padding: '16px 24px', minWidth: 0 }}>
          <Typography variant="labelMedium" component="div" sx={{ color: md('onSurfaceVariant'), mb: 1 }}>
            Preview
          </Typography>
          <Markdown text={text} />
        </div>
      </div>
    </div>
  );
}

/** One linked project: where assets go, its credits, and what's been copied into it. */
/** How many of a pack's files a game's page draws before offering the rest. */
const PER_PACK = 24;
/** And how many packs, for a game that has taken from a hundred of them. */
const PACKS_SHOWN = 10;

export function ProjectPage({ id }: { id: string }) {
  const { goBack, back, go } = useNav();
  const projects = useProjects();
  const project = projects.data?.find((p) => p.id === id);
  const active = useActiveProject();
  const updateSettings = useUpdateSettings();
  const entries = useQuery({ queryKey: ['projects', 'entries', id, project?.assets, project?.lastCopy], queryFn: () => call('projects:entries', id), enabled: !!project?.exists }).data ?? [];
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [finding, setFinding] = useState(false);
  /** Packs whose every file is being shown, rather than the first screenful. */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<TabId>('assets');

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

  if (!project) {
    // A game that has been forgotten, or an old link to one: say so rather than showing nothing.
    if (!projects.data) return <Page title="">{null}</Page>;
    return (
      <Page title="Game" onBack={() => go({ to: 'projects' })}>
        <EmptyState
          icon={SportsEsportsOutlined}
          title="That game isn’t here"
          body="It may have been forgotten. Games lists the ones Tessera knows about, and you can set one up again at any time."
          actions={
            <Button variant="contained" onClick={() => go({ to: 'projects' })}>
              See the games
            </Button>
          }
        />
      </Page>
    );
  }
  const isActive = active?.id === id;
  const remove = async (items: ManifestEntry[]) => {
    // This deletes files out of somebody else's project, and there is no bin for a game. The
    // sidecars go with them, and a Unity .meta holds the asset's GUID, so every prefab and scene
    // that referenced it breaks. Every other destructive action in Tessera asks first; this one
    // did not, and it is the one that reaches furthest outside the library.
    const count = items.length;
    const adopted = items.filter((e) => e.adopted).length;
    const what = count === 1 ? `“${items[0]!.packName}”` : `${count.toLocaleString()} assets`;
    const yes = await ask<boolean>({
      tone: 'warning',
      title: count === 1 ? 'Take this out of the game?' : `Take ${count.toLocaleString()} assets out of the game?`,
      body:
        `The files are deleted from ${project.name}, along with the sidecars the engine keeps beside them. There is no bin for a game, so this cannot be undone from here.` +
        (adopted ? ` ${adopted === count ? 'These were' : `${adopted.toLocaleString()} of them were`} already in the game before Tessera saw them, so ${adopted === count ? 'they stay' : 'those stay'} where they are and only the record goes.` : '') +
        ' Anything in your library is untouched.',
      actions: [
        { label: 'Cancel', value: false, kind: 'text' },
        { label: count === 1 ? 'Take it out' : 'Take them out', value: true, kind: 'danger' },
      ],
    });
    if (!yes) return;
    try {
      const n = await call('projects:remove', id, items.map((e) => ({ packId: e.packId, ref: e.ref, ...(e.libraryId ? { libraryId: e.libraryId } : {}) })));
      notify.success(`Took ${n} asset${n === 1 ? '' : 's'} out of ${project.name}.`, { body: what === `${count.toLocaleString()} assets` ? undefined : what });
    } catch (e) {
      // It used to say nothing at all when this failed.
      failed(e);
    }
  };

  // The same header an asset and a pack get: what it is on the left, what it is made of in the
  // middle, and the handful of things to do with it on the right, all at the same size wherever
  // you are in the app.
  const actions: ItemAction[] = [
    { label: 'Pick assets', icon: ViewInArOutlined, primary: true, onClick: () => go({ to: 'browse' }) },
    { label: 'Find assets here', icon: FindInPageOutlined, hidden: !project.exists, onClick: () => setFinding(true) },
    { label: 'Send copies here', icon: CheckCircle, hidden: isActive, onClick: () => updateSettings.mutate({ activeProjectId: id }) },
    { label: 'Open folder', icon: FolderOpenOutlined, manage: true, onClick: () => void call('projects:reveal', id) },
    { label: 'Settings', icon: TuneOutlined, manage: true, onClick: () => setTab('settings') },
    { label: 'Unlink', icon: LinkOffOutlined, manage: true, danger: true, onClick: () => setUnlinking(true) },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <ItemHeader
        {...(back.length > 0 ? { onBack: goBack } : {})}
        preview={<EngineBadge engine={project.engine} size={HEADER_SIZE} />}
        name={project.name}
        facts={
          <Typography variant="bodyMedium" component="span" sx={{ color: md('onSurfaceVariant') }}>
            {ENGINE_LABELS[project.engine]}
            {project.engineVersion ? ` ${project.engineVersion}` : ''} · {formatCount(entries.length)} asset{entries.length === 1 ? '' : 's'} from {formatCount(project.packs)} pack{project.packs === 1 ? '' : 's'} · into <code>{project.target}/</code>
          </Typography>
        }
        license={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
            {isActive && <Chip size="small" icon={<CheckCircle />} label="Copies go here" sx={{ flexShrink: 0 }} />}
            <Typography variant="bodySmall" noWrap sx={{ color: project.exists ? md('onSurfaceVariant') : md('error'), minWidth: 0 }} title={project.path}>
              {project.exists ? project.path : `Can’t find ${project.path}`}
            </Typography>
          </div>
        }
        belongs={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <DescriptionOutlined sx={{ fontSize: 16, color: md(project.creditsFile ? 'onSurfaceVariant' : 'outline') }} />
            <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant'), opacity: project.creditsFile ? 1 : 0.8 }}>
              {project.creditsFile ? `Credits written at ${project.creditsFile}` : 'No credits file kept'}
            </Typography>
          </div>
        }
        actions={actions}
      />

      <Tabs value={tab} onChange={(_, v: TabId) => setTab(v)} sx={{ px: 3, borderBottom: `1px solid ${md('outlineVariant')}`, minHeight: 44, '& .MuiTab-root': { minHeight: 44, textTransform: 'none', typography: 'titleSmall' } }}>
        <Tab value="assets" label={`Assets · ${formatCount(entries.length)}`} />
        <Tab value="credits" label={project.creditsFile?.split('/').pop() ?? 'CREDITS.md'} />
        <Tab value="settings" label="Settings" />
      </Tabs>

      <div style={{ flex: 1, minHeight: 0, overflow: tab === 'credits' ? 'hidden' : 'auto' }}>
      {tab === 'credits' && <Credits project={project} />}
      {tab === 'settings' && (
      <div style={{ padding: '16px 32px 32px', maxWidth: 1000 }}>
        <Setting title="Assets go into" body={<code>{project.target}/</code>}>
          <Button startIcon={<EditOutlined />} onClick={() => setEditingTarget(project.target)}>
            Change
          </Button>
        </Setting>
        <Setting
          title="Credits file"
          body={project.creditsFile ? <>Kept up to date at <code>{project.creditsFile}</code>, with every pack you use and the credit its license asks for.</> : 'Off. Turn it on to have the credits written for you.'}
        >
          {project.creditsFile && (
            <Button onClick={() => void call('projects:reveal', id, project.creditsFile!)} startIcon={<FolderOpenOutlined />}>
              Show
            </Button>
          )}
          <Switch checked={!!project.creditsFile} onChange={(_, on) => void call('projects:update', id, { creditsFile: on ? 'CREDITS.md' : null })} />
        </Setting>
      </div>
      )}
      {tab === 'assets' && (
      <div style={{ padding: '16px 32px 32px' }}>
        {!entries.length ? (
          <EmptyState
            icon={SportsEsportsOutlined}
            title="Nothing copied here yet"
            body={`Pick assets in Browse and copy them to ${project.name}: they land in ${project.target}/ with their textures, licenses and credits. If this game is not new, it may already have assets your library knows, and those can be recorded where they are instead.`}
            actions={
              <>
                <Button variant="contained" onClick={() => go({ to: 'browse' })}>
                  Pick assets
                </Button>
                {/* The other way round, for somebody who linked the game before adding anything. */}
                <Button startIcon={<FindInPageOutlined />} disabled={!project.exists} onClick={() => setFinding(true)}>
                  Find assets already here
                </Button>
              </>
            }
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
              {(open.has(lib.id) ? lib.packs : lib.packs.slice(0, PACKS_SHOWN)).map((list) => {
            const first = list[0]!;
            const key = `${first.libraryId ?? ''}:${first.packId}`;
            const here = (first.libraryId ?? '') === openId;
            return (
              <section key={first.packId} style={{ marginBottom: 16, padding: 12, borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <Typography variant="titleSmall" sx={{ color: md('onSurface'), flex: 1, cursor: here ? 'pointer' : 'default' }} onClick={() => here && go({ to: 'pack', id: first.packId })}>
                    {first.packName}
                  </Typography>
                  <LicenseChip id={first.license} />
                  {/* Said, not drawn. A circling arrow and a bin beside a pack name are a guess
                      at best, and one of them takes files out of somebody's game. */}
                  <Button
                    size="small"
                    startIcon={<RefreshOutlined fontSize="small" />}
                    disabled={!here}
                    sx={{ visibility: here ? 'visible' : 'hidden' }}
                    onClick={() => void copyToProject(project, list.map((e) => ({ packId: e.packId, ref: e.ref })))}
                  >
                    Copy again
                  </Button>
                  <Button size="small" color="error" startIcon={<DeleteOutlined fontSize="small" />} onClick={() => void remove(list)}>
                    Take out
                  </Button>
                </div>
                {first.attribution && (
                  <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), mb: 1, fontStyle: 'italic' }}>
                    {first.attribution}
                  </Typography>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  {(open.has(key) ? list : list.slice(0, PER_PACK)).map((e) => {
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
                {/* A pack can have thousands of files in a game; they are shown when asked for. */}
                {list.length > PER_PACK && (
                  <Button
                    size="small"
                    sx={{ mt: 1 }}
                    onClick={() => setOpen((was) => { const next = new Set(was); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
                  >
                    {open.has(key) ? 'Show fewer' : `Show all ${formatCount(list.length)}`}
                  </Button>
                )}
              </section>
            );
              })}
            </div>
          ))
        )}
      </div>
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
      <AlreadyHere project={project} open={finding} onClose={() => setFinding(false)} />
      <Dialog open={unlinking} onClose={() => setUnlinking(false)}>
        <DialogTitle>Unlink {project.name}?</DialogTitle>
        <DialogContent>
          <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
            Tessera forgets the project. Nothing in its folder changes: copied assets, license files and credits stay.
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
