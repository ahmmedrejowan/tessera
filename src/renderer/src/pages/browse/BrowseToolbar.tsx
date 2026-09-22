import Close from '@mui/icons-material/Close';
import FilterListOutlined from '@mui/icons-material/FilterListOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import ViewModuleOutlined from '@mui/icons-material/ViewModuleOutlined';
import SortOutlined from '@mui/icons-material/SortOutlined';
import Badge from '@mui/material/Badge';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { AssetSort, Facet, PackSort } from '@shared/query';
import { facetLabel, formatCount } from '../../components/labels';
import { SegmentedButton } from '../../components/SegmentedButton';
import { activeFilterCount, browseQuery, TILE_MAX, TILE_MIN, useBrowse } from '../../state/browse';
import { useStats } from '../../state/library';
import { SaveSearchDialog } from '../collections/CollectionMenu';
import { md } from '../../theme';

const ASSET_SORTS: { value: AssetSort; label: string }[] = [
  { value: 'relevance', label: 'Best match' },
  { value: 'name', label: 'Name' },
  { value: 'added', label: 'Recently added' },
  { value: 'pack', label: 'Pack' },
  { value: 'type', label: 'Type' },
  { value: 'size', label: 'Largest' },
];
const PACK_SORTS: { value: PackSort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'added', label: 'Recently added' },
  { value: 'count', label: 'Most assets' },
  { value: 'size', label: 'Largest' },
];

const chipsLabels = (filters: Partial<Record<Facet, string[]>>) =>
  (Object.entries(filters) as [Facet, string[]][]).flatMap(([f, vs]) => (vs ?? []).map((v) => facetLabel(f, v)));

export function BrowseToolbar({ total, stale }: { total: number; stale: boolean }) {
  const s = useBrowse();
  const [sortEl, setSortEl] = useState<HTMLElement | null>(null);
  const [viewEl, setViewEl] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const q = browseQuery(s);
  const suggested = [q.text, ...chipsLabels(s.filters)].filter(Boolean).join(' · ') || 'Saved search';
  const sorts = s.mode === 'assets' ? ASSET_SORTS : PACK_SORTS;
  const sort = s.mode === 'assets' ? s.assetSort : s.packSort;
  const filterCount = activeFilterCount(s.filters);
  // Nothing to filter in an empty library; the button keeps its place.
  const nothingYet = useStats().data?.assets === 0 && !filterCount;
  const chips = (Object.entries(s.filters) as [Facet, string[]][]).flatMap(([facet, values]) => (values ?? []).map((value) => ({ facet, value })));

  return (
    <div style={{ padding: '0 32px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Tooltip title={s.filtersOpen ? 'Hide filters' : 'Show filters'}>
          <IconButton onClick={() => s.setFiltersOpen(!s.filtersOpen)} aria-label="Filters" aria-pressed={s.filtersOpen} disabled={nothingYet} sx={{ visibility: nothingYet ? 'hidden' : 'visible' }}>
            <Badge badgeContent={filterCount} color="primary" invisible={s.filtersOpen || !filterCount}>
              <FilterListOutlined />
            </Badge>
          </IconButton>
        </Tooltip>
        <SegmentedButton
          label="Show"
          value={s.mode}
          onChange={s.setMode}
          options={[
            { value: 'assets', label: 'Assets' },
            { value: 'packs', label: 'Packs' },
          ]}
        />
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), opacity: stale ? 0.5 : 1, transition: 'opacity 150ms' }}>
          {formatCount(total)} {s.mode === 'assets' ? (total === 1 ? 'asset' : 'assets') : total === 1 ? 'pack' : 'packs'}
        </Typography>
        <div style={{ flex: 1 }} />
        <Button startIcon={<SortOutlined />} onClick={(e) => setSortEl(e.currentTarget)} sx={{ color: md('onSurfaceVariant'), px: 1.5 }}>
          {sorts.find((o) => o.value === sort)?.label}
        </Button>
        <Menu anchorEl={sortEl} open={!!sortEl} onClose={() => setSortEl(null)}>
          {sorts.map((o) => (
            <MenuItem
              key={o.value}
              selected={o.value === sort}
              onClick={() => {
                if (s.mode === 'assets') s.setAssetSort(o.value as AssetSort);
                else s.setPackSort(o.value as PackSort);
                setSortEl(null);
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </Menu>
        <Tooltip title="View options">
          <IconButton onClick={(e) => setViewEl(e.currentTarget)} aria-label="View options">
            <ViewModuleOutlined />
          </IconButton>
        </Tooltip>
        <Menu anchorEl={viewEl} open={!!viewEl} onClose={() => setViewEl(null)} slotProps={{ paper: { sx: { width: 340, p: 1 } } }}>
          <div style={{ padding: '8px 12px' }}>
            <Typography variant="labelLarge" sx={{ color: md('onSurface') }}>
              Tile size
            </Typography>
            <Slider min={TILE_MIN} max={TILE_MAX} value={s.tileSize} onChange={(_, v) => s.setTileSize(v as number)} aria-label="Tile size" />
          </div>
          <div style={{ padding: '4px 12px 12px' }}>
            <Typography variant="labelLarge" sx={{ color: md('onSurface'), display: 'block', mb: 1 }}>
              Behind transparent images
            </Typography>
            <SegmentedButton
              label="Background"
              value={s.tileBackground}
              onChange={s.setTileBackground}
              options={[
                { value: 'checker', label: 'Checker' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </div>
          {s.mode === 'assets' && (
            <MenuItem onClick={() => s.setIncludeSupport(!s.includeSupport)} sx={{ alignItems: 'flex-start', gap: 1, whiteSpace: 'normal' }}>
              <div style={{ flex: 1 }}>
                <Typography variant="labelLarge" sx={{ color: md('onSurface') }}>
                  Supporting files
                </Typography>
                <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                  Textures of models, material files, pack previews and other files that serve the assets.
                </Typography>
              </div>
              <Switch size="small" checked={s.includeSupport} tabIndex={-1} />
            </MenuItem>
          )}
        </Menu>
      </div>
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {chips.map(({ facet, value }) => (
            <Chip
              key={`${facet}:${value}`}
              label={facetLabel(facet, value)}
              onDelete={() => s.toggleFilter(facet, value)}
              deleteIcon={<Close />}
              sx={{ backgroundColor: md('secondaryContainer'), color: md('onSecondaryContainer'), '& .MuiChip-deleteIcon': { color: md('onSecondaryContainer'), fontSize: 18 } }}
            />
          ))}
          <Button size="small" onClick={s.clearFilters}>
            Clear all
          </Button>
        </div>
      )}
      {(q.text || filterCount > 0) && s.mode === 'assets' && (
        <div>
          <Button size="small" startIcon={<AutoAwesomeOutlined />} onClick={() => setSaving(true)}>
            Save as smart collection
          </Button>
        </div>
      )}
      <SaveSearchDialog open={saving} onClose={() => setSaving(false)} query={{ text: q.text, filters: q.filters as Record<string, string[]>, includeSupport: !!q.includeSupport }} suggested={suggested} />
    </div>
  );
}
