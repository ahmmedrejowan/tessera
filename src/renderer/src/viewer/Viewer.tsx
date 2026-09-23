import Button from '@mui/material/Button';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import Close from '@mui/icons-material/Close';
import FitScreenOutlined from '@mui/icons-material/FitScreenOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import OpenInNew from '@mui/icons-material/OpenInNew';
import StarOutlineRounded from '@mui/icons-material/StarOutlineRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { assetPath, TYPE_LABELS } from '@shared/assets';
import { licenceForPath } from '@shared/pack';
import type { AssetRow } from '@shared/query';
import { call } from '../api';
import { displayName, formatBytes, formatCount, sourceName } from '../components/labels';
import { LicenceChip, licenceSummary } from '../components/LicenceChip';
import { CollectionIcon } from '../components/icons';
import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import ButtonBase from '@mui/material/ButtonBase';
import { hostLabel } from '@shared/links';
import { sourceInfo } from '@shared/sources';
import { EditIcon } from '../components/icons';
import { starAsset } from '../pages/browse/StarButton';
import { FileLicence } from './FileLicence';
import { FilmStrip } from './FilmStrip';
import { fileUrl, useIndexVersion, useLibraryId } from '../state/library';
import { useNav } from '../state/nav';
import { useThumb } from '../state/thumbs';
import { CopyButton } from '../pages/projects/CopyButton';
import { assetKey } from '@shared/urls';
import { md, mdAlpha, SHAPE } from '../theme';
import { useIsDark } from '../theme/AppThemeProvider';
import { AudioView, type AudioInfo } from './AudioView';
import type { FontInfo } from './FontView';
import { FontView } from './FontView';
import { ImageView, type ImageInfo } from './ImageView';
import { ModelView, type ModelStats } from './ModelView';
import { PanoramaView } from './PanoramaView';
import { TextView } from './TextView';
import { fitSvg } from '../svg';
import { CollectionMenu } from '../pages/collections/CollectionMenu';

const MODEL = new Set(['glb', 'gltf', 'fbx', 'obj', 'dae', 'stl', 'ply', '3ds', 'usdz', 'vox']);
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif']);
const HDR = new Set(['hdr', 'exr']);
const AUDIO = new Set(['ogg', 'wav', 'mp3', 'flac', 'm4a', 'opus', 'aif', 'aiff']);
const FONT = new Set(['ttf', 'otf', 'woff', 'woff2']);
const TEXT = new Set(['txt', 'md', 'json', 'jsonl', 'xml', 'csv', 'yaml', 'yml', 'mtl', 'gltf', 'tmx', 'tsx', 'fnt', 'atlas', 'html', 'htm', 'plist', 'gd', 'tres', 'tscn']);

type Stage = 'model' | 'image' | 'rendered' | 'hdr' | 'audio' | 'font' | 'text' | 'none';
function stageFor(ext: string, kind: string): Stage {
  if (MODEL.has(ext)) return 'model';
  if (HDR.has(ext)) return 'hdr';
  if (IMAGE.has(ext)) return 'image';
  if (kind === 'image') return 'rendered';
  if (AUDIO.has(ext)) return 'audio';
  if (FONT.has(ext)) return 'font';
  if (TEXT.has(ext) || kind === 'doc') return 'text';
  return 'none';
}

/** An SVG, measured and given a viewBox first (see fitSvg), then shown like any image. */
function SvgImage({ url, onInfo, command }: { url: string; onInfo: (i: ImageInfo | null) => void; command?: { kind: 'fit' | 'actual'; n: number } }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let cancelled = false;
    void fetch(url)
      .then((r) => r.text())
      .then((text) => {
        if (cancelled) return;
        made = URL.createObjectURL(new Blob([fitSvg(text).svg], { type: 'image/svg+xml' }));
        setSrc(made);
      })
      .catch(() => !cancelled && setSrc(url));
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [url]);
  return src ? <ImageView src={src} onInfo={onInfo} {...(command ? { command } : {})} /> : null;
}

/** A part of the about pane: a heading, something to do about it, and the facts under it. */
function Group({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ padding: '12px 20px', borderBottom: `1px solid ${md('outlineVariant')}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32 }}>
        <Typography variant="labelLarge" sx={{ flex: 1, color: md('onSurfaceVariant'), textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11 }}>
          {title}
        </Typography>
        {action}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, padding: '5px 0' }}>
      <Typography variant="labelMedium" sx={{ color: md('onSurfaceVariant') }}>
        {label}
      </Typography>
      <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurface'), wordBreak: 'break-word', userSelect: 'text' }}>
        {children}
      </Typography>
    </div>
  );
}

const dims = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));

interface Props {
  asset: AssetRow;
  /** Position in the results, for "12 of 904". */
  position?: { index: number; total: number };
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  /** The other files to move along: what is loaded of them, and a way to open one. */
  strip?: { items: (AssetRow | undefined)[]; onPick: (index: number) => void; onNeed?: (start: number, end: number) => void };
}

/**
 * A full-window look at one asset, with the right view for its kind. Arrow keys step through
 * the results; Space or Escape closes, like Quick Look.
 */
export function Viewer({ asset, position, onPrev, onNext, onClose, strip }: Props) {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const dark = useIsDark();
  const go = useNav((s) => s.go);
  const [infoOpen, setInfoOpen] = useState(() => localStorage.getItem('tessera.viewer.info') !== '0');
  const [fileId, setFileId] = useState(asset.id);
  const [command, setCommand] = useState<{ kind: 'fit' | 'actual'; n: number }>();
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [audioInfo, setAudioInfo] = useState<AudioInfo | null>(null);
  const [fontInfo, setFontInfo] = useState<FontInfo | null>(null);
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [collectAnchor, setCollectAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => setFileId(asset.id), [asset.id]);
  const thumb = useThumb(assetKey(asset.packId, asset.ref));

  const variants = useQuery({ queryKey: ['variants', lib, version, asset.id], queryFn: () => call('asset:variants', asset.id), enabled: !!lib }).data ?? [asset];
  const file = variants.find((v) => v.id === fileId) ?? asset;
  const pack = useQuery({ queryKey: ['pack', lib, version, asset.packId], queryFn: () => call('pack:get', asset.packId), enabled: !!lib }).data;
  const stage = stageFor(file.ext, file.kind);
  const textures = useQuery({ queryKey: ['textures', lib, version, asset.packId], queryFn: () => call('pack:textures', asset.packId), enabled: !!lib && stage === 'model' }).data;
  const url = fileUrl(file.packId, file.ref);
  // The licence covering this very file: a pack can hold parts with terms of their own.
  const part = pack ? licenceForPath(pack.meta, assetPath(file.ref)) : null;
  const [editingLicence, setEditingLicence] = useState(false);
  const proof = useQuery({ queryKey: ['proof', lib, version, asset.packId], queryFn: () => call('pack:proof', asset.packId), enabled: !!lib && infoOpen }).data ?? [];
  const shots = proof.filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f.name));
  const page = pack ? (pack.meta.source.url ?? sourceInfo(pack.meta.source.site)?.url ?? null) : null;
  // archive.org's copy is written into the licence notes when the page is kept.
  const archived = pack ? (/https?:\/\/web\.archive\.org\/\S+/.exec(pack.meta.licence.notes)?.[0] ?? null) : null;

  // What the last file reported doesn't describe the next one.
  useEffect(() => {
    setImageInfo(null);
    setAudioInfo(null);
    setFontInfo(null);
    setStats(null);
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft' && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        onNext();
      } else if (e.key.toLowerCase() === 's') {
        // Star what you are looking at: this is where you decide you like it.
        e.preventDefault();
        starAsset(asset.packId, asset.ref, !asset.fav);
      } else if (e.key.toLowerCase() === 'i') {
        setInfoOpen((v) => !v);
      } else if (e.key.toLowerCase() === 'f') {
        setCommand({ kind: 'fit', n: Date.now() });
      } else if (e.key === '1') {
        setCommand({ kind: 'actual', n: Date.now() });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, onPrev, onNext, asset]);

  useEffect(() => {
    try {
      localStorage.setItem('tessera.viewer.info', infoOpen ? '1' : '0');
    } catch {
      // not remembered
    }
  }, [infoOpen]);

  const view = useMemo(() => {
    switch (stage) {
      case 'model':
        // One 3D view for the whole session: stepping through models reuses its renderer.
        return textures ? <ModelView url={url} ext={file.ext} textures={textures} dark={dark} onStats={setStats} /> : null;
      case 'image':
        return file.ext === 'svg' ? <SvgImage key={url} url={url} onInfo={setImageInfo} {...(command ? { command } : {})} /> : <ImageView key={url} src={url} onInfo={setImageInfo} {...(command ? { command } : {})} />;
      case 'hdr':
        return <PanoramaView key={url} url={url} ext={file.ext} onInfo={setImageInfo} />;
      case 'audio':
        return <AudioView key={url} url={url} onInfo={setAudioInfo} />;
      case 'font':
        return <FontView key={url} url={url} onInfo={setFontInfo} />;
      case 'text':
        return <TextView key={url} url={url} />;
      case 'rendered':
        // Formats the window can't draw (TGA, PSD, TIFF): the rendered copy, at thumbnail size.
        return thumb?.startsWith('tessera:') ? <ImageView key={thumb} src={thumb} {...(command ? { command } : {})} /> : null;
      default:
        return (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
            <Typography variant="bodyLarge" sx={{ color: md('onSurfaceVariant') }}>
              .{file.ext} files can't be previewed. Use “Show file” to open it in another app.
            </Typography>
          </div>
        );
    }
  }, [stage, url, file.ext, textures, dark, command, thumb]);

  const side = (dir: 'left' | 'right', onClick?: () => void) =>
    onClick && (
      <IconButton
        onClick={onClick}
        aria-label={dir === 'left' ? 'Previous' : 'Next'}
        sx={{
          position: 'absolute',
          top: '50%',
          [dir]: 12,
          transform: 'translateY(-50%)',
          width: 44,
          height: 44,
          backgroundColor: mdAlpha('surfaceContainerHigh', 0.85),
          '&:hover': { backgroundColor: md('surfaceContainerHighest') },
          zIndex: 2,
        }}
      >
        {dir === 'left' ? <ChevronLeft /> : <ChevronRight />}
      </IconButton>
    );

  return (
    <div role="dialog" aria-label={`Preview of ${asset.name}`} style={{ position: 'fixed', inset: 0, zIndex: 1300, display: 'flex', flexDirection: 'column', background: md('surfaceContainerLowest'), animation: 'viewer-in 140ms ease-out' }}>
      <style>{'@keyframes viewer-in { from { opacity: 0; transform: scale(0.985); } to { opacity: 1; transform: none; } }'}</style>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `${window.tessera.platform === 'darwin' ? 36 : 10}px 16px 8px`, borderBottom: `1px solid ${md('outlineVariant')}` }}>
        <Tooltip title="Close (Esc)">
          <IconButton onClick={onClose} aria-label="Close">
            <Close />
          </IconButton>
        </Tooltip>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Typography variant="titleMedium" noWrap sx={{ color: md('onSurface') }}>
            {displayName(asset.name)}
          </Typography>
          <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant') }}>
            {asset.packName} · {TYPE_LABELS[asset.type]}
            {position && ` · ${formatCount(position.index + 1)} of ${formatCount(position.total)}`}
          </Typography>
        </div>
        {variants.length > 1 && (
          <Select size="small" value={String(file.id)} onChange={(e) => setFileId(Number(e.target.value))} sx={{ minWidth: 150, borderRadius: `${SHAPE.sm}px` }} aria-label="Format">
            {variants.map((v) => (
              <MenuItem key={v.id} value={String(v.id)}>
                {v.ext.toUpperCase()} · {formatBytes(v.size)}
              </MenuItem>
            ))}
          </Select>
        )}
        {stage === 'image' && (
          <Tooltip title="Fit (F) · Actual size (1)">
            <IconButton onClick={() => setCommand({ kind: 'fit', n: Date.now() })} aria-label="Fit">
              <FitScreenOutlined />
            </IconButton>
          </Tooltip>
        )}
        <CopyButton items={() => [{ packId: asset.packId, ref: asset.ref }]} sx={{ mr: 1 }} />
        <Tooltip title={asset.fav ? 'Take the star off (S)' : 'Star it (S)'}>
          <IconButton onClick={() => starAsset(asset.packId, asset.ref, !asset.fav)} aria-label={asset.fav ? 'Take the star off' : 'Star it'} sx={asset.fav ? { color: md('tertiary') } : {}}>
            {asset.fav ? <StarRounded /> : <StarOutlineRounded />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Add to collection">
          <IconButton onClick={(e) => setCollectAnchor(e.currentTarget)} aria-label="Add to collection">
            <CollectionIcon />
          </IconButton>
        </Tooltip>
        <CollectionMenu anchor={collectAnchor} onClose={() => setCollectAnchor(null)} items={async () => [{ packId: asset.packId, ref: asset.ref }]} />
        <Tooltip title="Show file">
          <IconButton onClick={() => void call('pack:reveal', file.packId, file.ref)} aria-label="Show file">
            <FolderOpenOutlined />
          </IconButton>
        </Tooltip>
        <Tooltip title="Open pack">
          <IconButton
            onClick={() => {
              onClose();
              go({ to: 'pack', id: asset.packId });
            }}
            aria-label="Open pack"
          >
            <OpenInNew />
          </IconButton>
        </Tooltip>
        <Tooltip title="Details (I)">
          <IconButton onClick={() => setInfoOpen(!infoOpen)} aria-pressed={infoOpen} aria-label="Details" sx={infoOpen ? { color: md('primary') } : {}}>
            <InfoOutlined />
          </IconButton>
        </Tooltip>
      </header>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {side('left', onPrev)}
          {view}
          {side('right', onNext)}
        </div>
        {infoOpen && (
          <aside style={{ width: 340, flexShrink: 0, overflowY: 'auto', padding: '4px 0 24px', borderLeft: `1px solid ${md('outlineVariant')}`, background: md('surfaceContainerLow'), scrollbarGutter: 'stable' }}>
            <Group title="This file">
              <InfoRow label="Name">{file.name}</InfoRow>
              <InfoRow label="Format">
                {file.ext.toUpperCase()} · {formatBytes(file.size)}
                {variants.length > 1 ? ` · also ${variants.filter((v) => v.id !== file.id).map((v) => v.ext.toUpperCase()).join(', ')}` : ''}
              </InfoRow>
              {imageInfo && (
                <InfoRow label="Pixels">
                  {imageInfo.width} × {imageInfo.height}
                </InfoRow>
              )}
              {audioInfo && (
                <>
                  <InfoRow label="Length">{audioInfo.duration.toFixed(2)} s</InfoRow>
                  <InfoRow label="Channels">{audioInfo.channels === 1 ? 'Mono' : audioInfo.channels === 2 ? 'Stereo' : audioInfo.channels}</InfoRow>
                  <InfoRow label="Sample rate">{(audioInfo.sampleRate / 1000).toFixed(1)} kHz</InfoRow>
                </>
              )}
              {fontInfo && fontInfo.axes.length > 0 && <InfoRow label="Variable">{fontInfo.axes.map((a) => a.name).join(', ')}</InfoRow>}
              {stats && (
                <>
                  <InfoRow label="Triangles">{formatCount(stats.triangles)}</InfoRow>
                  <InfoRow label="Vertices">{formatCount(stats.vertices)}</InfoRow>
                  <InfoRow label="Meshes">{formatCount(stats.meshes)}</InfoRow>
                  <InfoRow label="Materials">
                    {stats.materials} · {stats.textures} texture{stats.textures === 1 ? '' : 's'}
                  </InfoRow>
                  <InfoRow label="Size">{stats.size.map(dims).join(' × ')} units</InfoRow>
                  {stats.animations.length > 0 && <InfoRow label="Animations">{stats.animations.length}</InfoRow>}
                </>
              )}
              <InfoRow label="Folder">{file.dir || 'Top level'}</InfoRow>
            </Group>

            {pack && part && (
              <>
                <Group
                  title="Its licence"
                  action={
                    <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => setEditingLicence(true)}>
                      Change
                    </Button>
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 8px' }}>
                    <LicenceChip id={part.id} />
                    <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                      {licenceSummary(part.id)}
                    </Typography>
                  </div>
                  {part !== pack.meta.licence && (
                    <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), pb: 1 }}>
                      This comes from the rule covering the part of the pack this file is in, not from the pack itself.
                    </Typography>
                  )}
                  {part.attribution && (
                    <InfoRow label="Credit">
                      <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ flex: 1 }}>{part.attribution}</span>
                        <Tooltip title="Copy the credit line">
                          <IconButton size="small" onClick={() => void navigator.clipboard.writeText(part.attribution ?? '')}>
                            <ContentCopyOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </span>
                    </InfoRow>
                  )}
                  {pack.meta.licence.notes && <InfoRow label="Notes">{pack.meta.licence.notes}</InfoRow>}
                </Group>

                <Group title="Its pack" action={<Button size="small" onClick={() => (onClose(), go({ to: 'pack', id: pack.id }))}>Open</Button>}>
                  <InfoRow label="Pack">{pack.name}</InfoRow>
                  {pack.creator && <InfoRow label="Creator">{pack.creator}</InfoRow>}
                  {sourceName(pack.source) && sourceName(pack.source) !== pack.creator && <InfoRow label="Source">{sourceName(pack.source)}</InfoRow>}
                  {page && (
                    <InfoRow label="Page">
                      <a href={page} target="_blank" rel="noreferrer" style={{ color: md('primary') }}>
                        {hostLabel(page)}
                      </a>
                    </InfoRow>
                  )}
                  {pack.meta.version && <InfoRow label="Version">{pack.meta.version}</InfoRow>}
                  {pack.genres.length > 0 && <InfoRow label="Genre">{pack.genres.join(', ')}</InfoRow>}
                  {pack.styles.length > 0 && <InfoRow label="Style">{pack.styles.join(', ')}</InfoRow>}
                  {pack.tags.length > 0 && <InfoRow label="Tags">{pack.tags.join(', ')}</InfoRow>}
                  <InfoRow label="Added">{new Date(pack.addedAt).toLocaleDateString([], { dateStyle: 'medium' })}</InfoRow>
                  {pack.meta.description && <InfoRow label="About">{pack.meta.description}</InfoRow>}
                </Group>

                <Group title="What proves it">
                  {proof.length ? (
                    proof.map((f) => (
                      <ButtonBase
                        key={f.name}
                        onClick={() => void call('pack:openProof', pack.id, f.name)}
                        sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.25, px: 1, py: 0.75, borderRadius: `${SHAPE.sm}px`, '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
                      >
                        {/\.(png|jpe?g|webp|gif)$/i.test(f.name) ? <ImageOutlined sx={{ fontSize: 18, color: md('onSurfaceVariant') }} /> : <AttachFileOutlined sx={{ fontSize: 18, color: md('onSurfaceVariant') }} />}
                        <Typography variant="bodyMedium" noWrap sx={{ flex: 1, textAlign: 'left', color: md('onSurface') }}>
                          {f.name}
                        </Typography>
                        <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                          {formatBytes(f.size)}
                        </Typography>
                      </ButtonBase>
                    ))
                  ) : (
                    <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                      Nothing kept yet: the licence text, a receipt or a picture of the download page would go here.
                    </Typography>
                  )}
                  {archived && (
                    <InfoRow label="Archived">
                      <a href={archived} target="_blank" rel="noreferrer" style={{ color: md('primary') }}>
                        {hostLabel(archived)}
                      </a>
                    </InfoRow>
                  )}
                  {shots.map((f) => (
                    <img key={f.name} src={f.url} alt={f.name} style={{ width: '100%', borderRadius: SHAPE.sm, border: `1px solid ${md('outlineVariant')}`, marginTop: 8 }} />
                  ))}
                </Group>
              </>
            )}
          </aside>
        )}
      </div>
      {pack && <FileLicence open={editingLicence} asset={file} meta={pack.meta} onClose={() => setEditingLicence(false)} />}
      {strip && position && strip.items.length > 1 && (
        <FilmStrip items={strip.items} index={position.index} total={position.total} onPick={strip.onPick} {...(strip.onNeed ? { onNeed: strip.onNeed } : {})} />
      )}
    </div>
  );
}
