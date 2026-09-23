import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import ArrowBack from '@mui/icons-material/ArrowBack';
import UnarchiveOutlined from '@mui/icons-material/UnarchiveOutlined';
import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import HighlightOffOutlined from '@mui/icons-material/HighlightOffOutlined';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import { TYPE_LABELS, type AssetType } from '@shared/assets';
import { licenceInfo } from '@shared/licences';
import { missingForLibrary } from '@shared/pack';
import type { AssetRow } from '@shared/query';
import { sourceInfo } from '@shared/sources';
import { call } from '../../api';
import { EmptyState } from '../../components/EmptyState';
import { failed, notify } from '../../notices/store';
import { formatBytes, formatCount, sourceName, typeSummary } from '../../components/labels';
import { LicenceChip, licenceSummary } from '../../components/LicenceChip';
import { VirtualGrid } from '../../components/VirtualGrid';
import { useIndexVersion, useLibraryId } from '../../state/library';
import { useNav } from '../../state/nav';
import { md, SHAPE } from '../../theme';
import { AssetTile, TILE_LABEL_HEIGHT } from '../browse/AssetTile';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { HEADER_SIZE, ItemHeader } from '../../components/ItemHeader';
import { Scrolling } from '../../components/Scrolling';
import { CollectionMenu } from '../collections/CollectionMenu';
import { ProjectMenu } from '../projects/ProjectMenu';
import { useActiveProject } from '../../state/projects';
import { CollectionIcon, LinkToGameIcon } from '../../components/icons';
import { Cover } from '../browse/PackCard';
import { starPack, StarButton } from '../browse/StarButton';
import { archivePack } from '../browse/archiving';
import { removePacks } from '../browse/deleting';
import { PackParts } from './PackParts';
import { AssetMenu } from '../browse/TileMenu';
import { useBrowse } from '../../state/browse';
import { coverHeight, PackCard } from '../browse/PackCard';
import { FileTree } from './FileTree';
import { PackEditor } from './PackEditor';

const Viewer = lazy(() => import('../../viewer/Viewer').then((m) => ({ default: m.Viewer })));

type TabId = 'assets' | 'files' | 'licence' | 'about';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 16, padding: '8px 0', borderBottom: `1px solid ${md('outlineVariant')}` }}>
      <Typography variant="labelLarge" sx={{ color: md('onSurfaceVariant') }}>
        {label}
      </Typography>
      <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurface'), userSelect: 'text', wordBreak: 'break-word' }}>
        {children}
      </Typography>
    </div>
  );
}

function Yes({ ok, children }: { ok: boolean; children: ReactNode }) {
  const Icon = ok ? CheckCircleOutlined : HighlightOffOutlined;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <Icon sx={{ fontSize: 20, color: ok ? md('primary') : md('error') }} />
      <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
        {children}
      </Typography>
    </div>
  );
}

/** A line in one of the header's lists: what it is, and what can be done about it. */
function Row({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', borderBottom: `1px solid ${md('outlineVariant')}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="bodyMedium" noWrap sx={{ color: md('onSurface') }}>
          {label}
        </Typography>
        {note && (
          <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant') }}>
            {note}
          </Typography>
        )}
      </div>
      {children}
    </div>
  );
}

/** One pack: its assets, all its files, its licence and what's known about it. */
export function PackPage({ id, edit = false }: { id: string; edit?: boolean }) {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const { goBack, back, go } = useNav();
  const tileSize = useBrowse((s) => s.tileSize);
  const [tab, setTab] = useState<TabId>('assets');
  const [editing, setEditing] = useState(edit);
  const [type, setType] = useState<AssetType | null>(null);
  const [find, setFind] = useState('');
  const [viewing, setViewing] = useState<{ list: AssetRow[]; index: number } | null>(null);

  const pack = useQuery({ queryKey: ['pack', lib, version, id], queryFn: () => call('pack:get', id), enabled: !!lib, placeholderData: (p) => p }).data;
  const files = useQuery({ queryKey: ['pack-files', lib, version, id], queryFn: () => call('pack:files', id), enabled: !!lib }).data ?? [];
  const proof = useQuery({ queryKey: ['proof', lib, version, id], queryFn: () => call('pack:proof', id), enabled: !!lib && tab === 'licence' }).data ?? [];

  const assets = useMemo(() => {
    const needle = find.trim().toLowerCase();
    return files.filter((f) => f.role === 'main' && (!type || f.type === type) && (!needle || f.name.toLowerCase().includes(needle) || f.dir.toLowerCase().includes(needle)));
  }, [files, type, find]);
  const types = useMemo(() => {
    const m = new Map<AssetType, number>();
    for (const f of files) if (f.role === 'main') m.set(f.type, (m.get(f.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [files]);

  const [menu, setMenu] = useState<{ anchor: HTMLElement; asset: AssetRow; index: number } | null>(null);
  const [showing, setShowing] = useState<'games' | 'collections' | 'types' | null>(null);
  const [copying, setCopying] = useState<HTMLElement | null>(null);
  const [collecting, setCollecting] = useState<HTMLElement | null>(null);
  const active = useActiveProject();
  const usage = useQuery({ queryKey: ['usage', lib, version, id], queryFn: () => call('projects:usage', [id]), enabled: !!lib }).data ?? [];
  const holding = useQuery({ queryKey: ['holding', lib, version, id], queryFn: () => call('collections:holding', id), enabled: !!lib }).data ?? [];

  const render = useCallback(
    (i: number, width: number) => {
      const a = assets[i];
      return (
        <AssetTile
          asset={a}
          width={width}
          selected={false}
          onClick={() => a && setViewing({ list: assets, index: i })}
          onOpen={() => a && setViewing({ list: assets, index: i })}
          onMenu={(anchor, x) => setMenu({ anchor, asset: x, index: i })}
          dragItems={(x) => [{ packId: x.packId, ref: x.ref }]}
        />
      );
    },
    [assets, setMenu],
  );

  if (!pack) return null;
  const kinds = Object.entries(pack.types).sort((a, b) => b[1] - a[1]);
  const copyLabel = active ? `Link to ${active.name}` : 'Link to a game';
  // The creator and the site are often the same name; say it once.
  const where = [...new Set([pack.creator, sourceName(pack.source), pack.meta.version].filter(Boolean))].join(' · ') || 'No creator recorded';
  const missing = missingForLibrary(pack.meta);
  const info = licenceInfo(pack.licence);
  const site = sourceInfo(pack.meta.source.site);
  const link = pack.meta.source.url ?? site?.url ?? null;

  const moveToLibrary = async () => {
    try {
      await call('pack:status', id, 'library');
    } catch (e) {
      failed(e);
    }
  };

  const viewed = viewing ? viewing.list[viewing.index] : undefined;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <ItemHeader
        {...(back.length > 0 ? { onBack: goBack } : {})}
        preview={
          <div aria-hidden style={{ width: HEADER_SIZE, height: HEADER_SIZE, borderRadius: SHAPE.md, overflow: 'hidden', background: md('surfaceContainerHigh') }}>
            <Cover pack={pack} width={HEADER_SIZE + 12} height={HEADER_SIZE} />
          </div>
        }
        star={<StarButton on={pack.fav} name={pack.name} selected onToggle={(on) => starPack(id, on)} />}
        name={pack.name}
        facts={
          <Typography variant="bodyMedium" component="span" sx={{ color: md('onSurfaceVariant') }}>
            <ButtonBase onClick={() => setTab('files')} sx={{ borderRadius: `${SHAPE.sm}px`, px: 0.25 }}>
              <Typography variant="bodyMedium" sx={{ color: md('primary') }}>
                {formatCount(pack.fileCount)} files
              </Typography>
            </ButtonBase>
            {' · '}
            {typeSummary(pack.types, 3)}
            {kinds.length > 3 && (
              <ButtonBase onClick={() => setShowing('types')} sx={{ borderRadius: `${SHAPE.sm}px`, px: 0.25 }}>
                <Typography variant="bodyMedium" sx={{ color: md('primary') }}>
                  +{kinds.length - 3}
                </Typography>
              </ButtonBase>
            )}
            {' · '}
            {formatBytes(pack.size)}
          </Typography>
        }
        licence={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
            <LicenceChip id={pack.licence} />
            {pack.meta.licences.length > 0 && (
              <Chip size="small" variant="outlined" label={`${pack.meta.licences.length} part${pack.meta.licences.length === 1 ? '' : 's'} differ`} onClick={() => setTab('licence')} />
            )}
            {pack.status === 'inbox' && <Chip size="small" icon={<InboxOutlined />} label="In Review" sx={{ backgroundColor: md('tertiaryContainer'), color: md('onTertiaryContainer') }} />}
            {pack.meta.archived && <Chip size="small" icon={<ArchiveOutlined />} label="Archived" sx={{ backgroundColor: md('surfaceContainerHighest'), color: md('onSurfaceVariant') }} />}
            <Scrolling title={where} style={{ flexShrink: 1, minWidth: 0 }}>
              <Typography variant="bodySmall" component="span" sx={{ color: md('onSurfaceVariant') }}>
                {where}
              </Typography>
            </Scrolling>
          </div>
        }
        games={{ names: usage.map((u) => u.name), total: usage.length, onOpen: () => setShowing('games') }}
        collections={{ names: holding.map((c) => c.name), total: holding.length, onOpen: () => setShowing('collections') }}
        actions={[
          { label: copyLabel, icon: LinkToGameIcon, primary: true, onClick: (anchor) => setCopying(anchor) },
          { label: 'Add to collection', icon: CollectionIcon, onClick: (anchor) => setCollecting(anchor) },
          { label: 'Edit details', icon: EditOutlined, onClick: () => setEditing(true) },
          { label: pack.meta.archived ? 'Bring it back' : 'Archive', icon: pack.meta.archived ? UnarchiveOutlined : ArchiveOutlined, onClick: () => void archivePack(id, !pack.meta.archived) },
          {
            label: 'Delete',
            icon: DeleteOutlined,
            danger: true,
            onClick: async () => {
              if (await removePacks([id], pack.name)) go({ to: 'browse' });
            },
          },
        ]}
      />

      {pack.status === 'inbox' && (
        <Alert
          severity={missing.length ? 'warning' : 'info'}
          icon={<InboxOutlined />}
          sx={{ mx: 4, mb: 1 }}
          action={
            <Button color="inherit" size="small" disabled={missing.length > 0} onClick={() => void moveToLibrary()}>
              Move to library
            </Button>
          }
        >
          {missing.length ? `This pack is waiting in Review. Add its ${missing.join(' and ')} to move it into the library.` : 'Everything needed is recorded. Move it into the library when you’re ready.'}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, v: TabId) => setTab(v)} sx={{ px: 3, borderBottom: `1px solid ${md('outlineVariant')}`, minHeight: 44, '& .MuiTab-root': { minHeight: 44, textTransform: 'none', typography: 'titleSmall' } }}>
        <Tab value="assets" label={`Assets · ${formatCount(pack.assetCount)}`} />
        <Tab value="files" label={`Files · ${formatCount(pack.fileCount)}`} />
        <Tab value="licence" label="Licence" />
        <Tab value="about" label="About" />
      </Tabs>

      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'assets' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 24px 0', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: SHAPE.full, background: md('surfaceContainerHigh'), color: md('onSurfaceVariant'), width: 240 }}>
                <SearchOutlined sx={{ fontSize: 18 }} />
                <InputBase value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find in this pack" sx={{ flex: 1, typography: 'bodyMedium' }} />
              </label>
              {types.length > 1 &&
                types.map(([t, n]) => (
                  <Chip
                    key={t}
                    label={`${TYPE_LABELS[t]} · ${formatCount(n)}`}
                    variant={type === t ? 'filled' : 'outlined'}
                    onClick={() => setType(type === t ? null : t)}
                    sx={type === t ? { backgroundColor: md('secondaryContainer'), color: md('onSecondaryContainer') } : {}}
                  />
                ))}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {assets.length ? (
                <VirtualGrid label="Assets in this pack" count={assets.length} minItemWidth={tileSize} itemHeight={(w) => w + TILE_LABEL_HEIGHT} gap={8} render={render} />
              ) : (
                <EmptyState
                  icon={SearchOutlined}
                  title={find ? 'Nothing matches' : 'No assets Tessera can show'}
                  body={find ? `Nothing in this pack matches “${find}”.` : 'Its files are all there: they’re just not of a kind Tessera previews.'}
                  actions={
                    find ? (
                      <Button variant="contained" onClick={() => setFind('')}>
                        Clear the search
                      </Button>
                    ) : (
                      <Button variant="contained" onClick={() => setTab('files')}>
                        See the files
                      </Button>
                    )
                  }
                />
              )}
            </div>
          </div>
        )}
        {tab === 'files' && <FileTree files={files} onOpen={(f) => setViewing({ list: [f], index: 0 })} />}
        {tab === 'licence' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '16px 32px 32px' }}>
            <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <LicenceChip id={pack.licence} />
                <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
                  {info?.name ?? (pack.licence ? pack.licence : 'No licence recorded')}
                </Typography>
                {info?.url && (
                  <a href={info.url} target="_blank" rel="noreferrer" style={{ color: md('primary') }}>
                    Read it
                  </a>
                )}
              </div>
              {info ? (
                <div>
                  <Yes ok={info.commercial}>{info.commercial ? 'Can be used in commercial games' : 'Not for commercial games'}</Yes>
                  <Yes ok={!info.attribution}>{info.attribution ? 'The author must be credited' : 'No credit required'}</Yes>
                  <Yes ok={info.modify}>{info.modify ? 'Can be modified' : 'Must not be modified'}</Yes>
                  {info.shareAlike && <Yes ok={false}>Changed versions must be shared under the same licence</Yes>}
                </div>
              ) : (
                <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
                  {licenceSummary(pack.licence)}
                </Typography>
              )}
              {pack.meta.licence.attribution && (
                <div style={{ padding: 16, borderRadius: SHAPE.md, background: md('surfaceContainerLow'), display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <Typography variant="bodyMedium" sx={{ flex: 1, color: md('onSurface'), userSelect: 'text' }}>
                    {pack.meta.licence.attribution}
                  </Typography>
                  <Tooltip title="Copy credit line">
                    <IconButton size="small" onClick={() => void navigator.clipboard.writeText(pack.meta.licence.attribution ?? '')}>
                      <ContentCopyOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </div>
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
                    Proof
                  </Typography>
                  <Button size="small" startIcon={<AttachFileOutlined />} onClick={() => void call('pack:addProof', id)}>
                    Add files
                  </Button>
                </div>
                {proof.length ? (
                  proof.map((p) => (
                    <div key={p.name} className="tile" onClick={() => void call('pack:openProof', id, p.name)} style={{ display: 'flex', gap: 12, padding: '8px 12px', borderRadius: SHAPE.sm, cursor: 'default' }}>
                      <AttachFileOutlined sx={{ fontSize: 18, color: md('onSurfaceVariant') }} />
                      <Typography variant="bodyMedium" sx={{ flex: 1, color: md('onSurface') }}>
                        {p.name}
                      </Typography>
                      <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                        {formatBytes(p.size)}
                      </Typography>
                    </div>
                  ))
                ) : (
                  <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
                    Keep the licence text, a receipt or a screenshot of the download page here. It’s your evidence if anyone ever asks.
                  </Typography>
                )}
              </div>
              <PackParts id={id} meta={pack.meta} files={files} />
              {pack.meta.licence.notes && <Fact label="Notes">{pack.meta.licence.notes}</Fact>}
            </div>
          </div>
        )}
        {tab === 'about' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '16px 32px 32px' }}>
            <div style={{ maxWidth: 760 }}>
              {pack.meta.description && (
                <Typography variant="bodyLarge" sx={{ color: md('onSurface'), whiteSpace: 'pre-wrap', mb: 2, userSelect: 'text' }}>
                  {pack.meta.description}
                </Typography>
              )}
              <Fact label="Source">{sourceName(pack.source) ?? 'Not recorded'}</Fact>
              {link && (
                <Fact label="Link">
                  <a href={link} target="_blank" rel="noreferrer" style={{ color: md('primary') }}>
                    {link}
                  </a>
                </Fact>
              )}
              <Fact label="Creator">
                {pack.meta.source.creatorUrl ? (
                  <a href={pack.meta.source.creatorUrl} target="_blank" rel="noreferrer" style={{ color: md('primary') }}>
                    {pack.creator ?? pack.meta.source.creatorUrl}
                  </a>
                ) : (
                  (pack.creator ?? 'Not recorded')
                )}
              </Fact>
              {pack.meta.version && <Fact label="Version">{pack.meta.version}</Fact>}
              <Fact label="Genre">{pack.genres.join(', ') || 'None'}</Fact>
              <Fact label="Style">{pack.styles.join(', ') || 'None'}</Fact>
              <Fact label="Tags">{pack.tags.join(', ') || 'None'}</Fact>
              <Fact label="Added">{new Date(pack.addedAt).toLocaleString()}</Fact>
              <Fact label="Folder">{pack.folder}</Fact>
              {pack.meta.notes && <Fact label="Notes">{pack.meta.notes}</Fact>}
              {pack.problems.length > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {pack.problems.join(' · ')}
                </Alert>
              )}
            </div>
          </div>
        )}
      </div>

      <ProjectMenu anchor={copying} onClose={() => setCopying(null)} items={async () => (await call('pack:files', id)).map((f) => ({ packId: f.packId, ref: f.ref }))} />
      <CollectionMenu anchor={collecting} onClose={() => setCollecting(null)} packs={() => Promise.resolve([id])} />

      <Dialog open={showing !== null} onClose={() => setShowing(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          {showing === 'games' ? 'Games using this pack' : showing === 'collections' ? 'Collections holding this pack' : "What's in this pack"}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {showing === 'games' &&
            (usage.length ? (
              usage.map((u) => (
                <Row key={u.projectId} label={u.name} note={`${formatCount(u.files)} file${u.files === 1 ? '' : 's'} copied`}>
                  <Button size="small" onClick={() => (setShowing(null), go({ to: 'project', id: u.projectId }))}>
                    Open
                  </Button>
                </Row>
              ))
            ) : (
              <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
                None of your games use it yet.
              </Typography>
            ))}
          {showing === 'collections' &&
            (holding.length ? (
              holding.map((c) => (
                <Row key={c.id} label={c.name}>
                  <Button size="small" onClick={() => (setShowing(null), go({ to: 'collection', id: c.id }))}>
                    Open
                  </Button>
                  <Button size="small" color="error" onClick={() => void call('collections:change', c.id, { removePacks: [id] })}>
                    Take it out
                  </Button>
                </Row>
              ))
            ) : (
              <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
                It is in no collection yet.
              </Typography>
            ))}
          {showing === 'types' &&
            kinds.map(([type, n]) => (
              <Row key={type} label={TYPE_LABELS[type as AssetType]} note={`${formatCount(n)} file${n === 1 ? '' : 's'}`}>
                <Button size="small" onClick={() => (setShowing(null), setType(type as AssetType), setTab('assets'))}>
                  Show
                </Button>
              </Row>
            ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowing(null)}>Close</Button>
        </DialogActions>
      </Dialog>
      <PackEditor packId={id} meta={pack.meta} open={editing} onClose={() => setEditing(false)} />
      {menu && (
        <AssetMenu
          anchor={menu.anchor}
          asset={menu.asset}
          onClose={() => setMenu(null)}
          onOpen={() => setViewing({ list: assets, index: menu.index })}
        />
      )}
      {viewing && viewed && (
        <Suspense fallback={null}>
          <Viewer
            asset={viewed}
            position={{ index: viewing.index, total: viewing.list.length }}
            {...(viewing.index > 0 ? { onPrev: () => setViewing({ ...viewing, index: viewing.index - 1 }) } : {})}
            {...(viewing.index < viewing.list.length - 1 ? { onNext: () => setViewing({ ...viewing, index: viewing.index + 1 }) } : {})}
            onClose={() => setViewing(null)}
            strip={{ items: viewing.list, onPick: (i) => setViewing({ ...viewing, index: i }) }}
          />
        </Suspense>
      )}
    </div>
  );
}
