import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import GraphicEqOutlined from '@mui/icons-material/GraphicEqOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import MusicNoteOutlined from '@mui/icons-material/MusicNoteOutlined';
import PanoramaOutlined from '@mui/icons-material/PanoramaOutlined';
import TextFieldsOutlined from '@mui/icons-material/TextFieldsOutlined';
import TextureOutlined from '@mui/icons-material/TextureOutlined';
import ViewInArOutlined from '@mui/icons-material/ViewInArOutlined';
import WidgetsOutlined from '@mui/icons-material/WidgetsOutlined';
import type { SvgIconComponent } from '@mui/icons-material';
import { TYPE_LABELS, type AssetType } from '@shared/assets';
import { licenceInfo } from '@shared/licences';
import type { Facet } from '@shared/query';
import { sourceInfo } from '@shared/sources';

export const TYPE_ICONS: Record<AssetType, SvgIconComponent> = {
  model: ViewInArOutlined,
  texture: TextureOutlined,
  sprite: ImageOutlined,
  ui: WidgetsOutlined,
  hdri: PanoramaOutlined,
  sfx: GraphicEqOutlined,
  music: MusicNoteOutlined,
  font: TextFieldsOutlined,
  other: InsertDriveFileOutlined,
};
export const DocIcon = DescriptionOutlined;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How a facet value is shown: "model" → "3D models", "CC0-1.0" → "CC0", "kenney" → "Kenney". */
export function facetLabel(facet: Facet, value: string): string {
  switch (facet) {
    case 'type':
      return TYPE_LABELS[value as AssetType] ?? value;
    case 'format':
      return value ? value.toUpperCase() : 'No extension';
    case 'source':
      return sourceInfo(value)?.name ?? value;
    case 'licence':
      return licenceInfo(value)?.short ?? value;
    default:
      return capital(value);
  }
}

export const sourceName = (source: string | null) => (source ? (sourceInfo(source)?.name ?? source) : null);
export const licenceShort = (id: string | null) => (id ? (licenceInfo(id)?.short ?? id) : null);

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export const formatCount = (n: number) => n.toLocaleString();

/** "1 model", "140 models": singular type names for summaries. */
const SINGULAR: Record<AssetType, [string, string]> = {
  model: ['model', 'models'],
  texture: ['texture', 'textures'],
  sprite: ['sprite', 'sprites'],
  ui: ['UI element', 'UI elements'],
  hdri: ['HDRI', 'HDRIs'],
  sfx: ['sound', 'sounds'],
  music: ['track', 'tracks'],
  font: ['font', 'fonts'],
  other: ['file', 'files'],
};
export const countOf = (type: AssetType, n: number) => `${formatCount(n)} ${SINGULAR[type][n === 1 ? 0 : 1]}`;

/** A pack's contents in a few words: "140 models · 12 textures". Largest first, at most `max` kinds. */
export function typeSummary(types: Partial<Record<AssetType, number>>, max = 2): string {
  const entries = (Object.entries(types) as [AssetType, number][]).filter(([t]) => t !== 'other').sort((a, b) => b[1] - a[1]);
  const shown = entries.slice(0, max).map(([t, n]) => countOf(t, n));
  if (entries.length > max) shown.push('more');
  return shown.join(' · ') || (types.other ? countOf('other', types.other) : 'Empty');
}

/** Image formats the window can draw straight from the file. */
export const DIRECT_IMAGE = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif']);

/**
 * A file name as people read it: no extension (formats are shown separately) and no random id
 * that some sites append ("dead-tree-16MPvqwl" → "dead-tree").
 */
export function displayName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  let stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const m = /^(.+?)[-_]([A-Za-z0-9]{8})$/.exec(stem);
  // Only mixed-case or letter+digit suffixes look like ids; "tree-branches" keeps its last word.
  if (m && /[A-Z]/.test(m[2]!) && /[a-z0-9]/.test(m[2]!)) stem = m[1]!;
  return stem;
}

/** "GLB", or "GLB +2" when the asset also comes in other formats. */
export function formatsLabel(ext: string, formats: string[]): string {
  const others = formats.filter((f) => f !== ext).length;
  return others ? `${ext.toUpperCase()} +${others}` : ext.toUpperCase();
}

/** "just now", "5 min ago", "3 hours ago", or the date. */
export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}
