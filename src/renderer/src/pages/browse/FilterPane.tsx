import ArchiveOutlined from '@mui/icons-material/ArchiveOutlined';
import ExpandLess from '@mui/icons-material/ExpandLess';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import FilterListOutlined from '@mui/icons-material/FilterListOutlined';
import KeyboardDoubleArrowLeftRounded from '@mui/icons-material/KeyboardDoubleArrowLeftRounded';
import ExpandMore from '@mui/icons-material/ExpandMore';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import Badge from '@mui/material/Badge';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Checkbox from '@mui/material/Checkbox';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
import type { AssetType } from '@shared/assets';
import { FACET_LABELS, FACETS, type Facet, type FacetCounts } from '@shared/query';
import { facetLabel, formatCount, TYPE_ICONS } from '../../components/labels';
import { activeFilterCount, useBrowse } from '../../state/browse';
import { md, SHAPE } from '../../theme';

const SHOWN = 8;
const COLLAPSED_KEY = 'tessera.filters.collapsed';

function loadCollapsed(): Set<Facet> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '["format","creator"]') as Facet[]);
  } catch {
    return new Set();
  }
}

function FacetSection({ facet, values, collapsed, onToggle }: { facet: Facet; values: FacetCounts[Facet]; collapsed: boolean; onToggle: () => void }) {
  const selected = useBrowse((s) => s.filters[facet]) ?? [];
  const toggle = useBrowse((s) => s.toggleFilter);
  const setFilter = useBrowse((s) => s.setFilter);
  const [all, setAll] = useState(false);
  const [find, setFind] = useState('');

  // Selected values stay listed even when the other filters leave them with no results.
  const merged = [...values];
  for (const v of selected) if (!merged.some((m) => m.value === v)) merged.push({ value: v, count: 0 });
  const needle = find.trim().toLowerCase();
  const matching = needle ? merged.filter((v) => facetLabel(facet, v.value).toLowerCase().includes(needle)) : merged;
  const visible = all || needle ? matching : matching.slice(0, SHOWN);

  return (
    <section style={{ padding: '10px 0 12px', borderTop: `1px solid ${md('outlineVariant')}` }}>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={!collapsed}
        sx={{ width: '100%', justifyContent: 'space-between', px: 1, py: 0.5, borderRadius: `${SHAPE.sm}px`, '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
      >
        <Typography variant="labelLarge" sx={{ color: selected.length ? md('primary') : md('onSurfaceVariant'), textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11 }}>
          {FACET_LABELS[facet]}
          {selected.length > 0 && (
            <Typography component="span" variant="labelSmall" sx={{ ml: 0.75, px: 0.75, py: '1px', borderRadius: `${SHAPE.full}px`, background: md('primary'), color: md('onPrimary') }}>
              {selected.length}
            </Typography>
          )}
        </Typography>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: md('onSurfaceVariant') }}>
          {selected.length > 0 && (
            <Typography
              variant="labelMedium"
              component="span"
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                setFilter(facet, []);
              }}
              sx={{ color: md('primary'), px: 0.5, '&:hover': { textDecoration: 'underline' } }}
            >
              Clear
            </Typography>
          )}
          {collapsed ? <ExpandMore fontSize="small" /> : <ExpandLess fontSize="small" />}
        </span>
      </ButtonBase>
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {merged.length > 12 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 8px 4px', padding: '4px 10px', borderRadius: SHAPE.full, background: md('surfaceContainerHigh'), color: md('onSurfaceVariant') }}>
              <SearchOutlined sx={{ fontSize: 16 }} />
              <InputBase value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Find ${FACET_LABELS[facet].toLowerCase()}`} sx={{ flex: 1, typography: 'bodySmall' }} />
            </label>
          )}
          {visible.map(({ value, count }) => {
            const on = selected.includes(value);
            const Icon = facet === 'type' ? TYPE_ICONS[value as AssetType] : null;
            return (
              <ButtonBase
                key={value}
                onClick={() => toggle(facet, value)}
                role="checkbox"
                aria-checked={on}
                sx={{
                  justifyContent: 'flex-start',
                  gap: 1,
                  pl: 0.5,
                  pr: 1.5,
                  minHeight: 34,
                  borderRadius: `${SHAPE.sm}px`,
                  backgroundColor: on ? md('secondaryContainer') : 'transparent',
                  '&:hover': { backgroundColor: on ? md('secondaryContainer') : md('surfaceContainerHigh') },
                }}
              >
                <Checkbox checked={on} size="small" tabIndex={-1} disableRipple sx={{ p: 0.5 }} />
                {Icon && <Icon sx={{ fontSize: 18, color: on ? md('onSecondaryContainer') : md('onSurfaceVariant') }} />}
                <Typography variant="bodyMedium" noWrap sx={{ flex: 1, textAlign: 'left', color: on ? md('onSecondaryContainer') : count ? md('onSurface') : md('onSurfaceVariant') }}>
                  {facetLabel(facet, value)}
                </Typography>
                <Typography variant="labelSmall" sx={{ color: on ? md('onSecondaryContainer') : md('onSurfaceVariant'), fontVariantNumeric: 'tabular-nums' }}>
                  {formatCount(count)}
                </Typography>
              </ButtonBase>
            );
          })}
          {!needle && matching.length > SHOWN && (
            <ButtonBase onClick={() => setAll(!all)} sx={{ justifyContent: 'flex-start', px: 1.5, py: 0.75, borderRadius: `${SHAPE.sm}px`, color: md('primary') }}>
              <Typography variant="labelLarge">{all ? 'Show fewer' : `Show all ${matching.length}`}</Typography>
            </ButtonBase>
          )}
        </div>
      )}
    </section>
  );
}

/** Facet filters for the results, each with how many results a value would give. */
/** The strip left behind when the filters are put away: the way to bring them back. */
export function FilterRail() {
  const setOpen = useBrowse((s) => s.setFiltersOpen);
  const count = activeFilterCount(useBrowse((s) => s.filters));
  return (
    <aside style={{ width: 52, flexShrink: 0, paddingTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', borderRight: `1px solid ${md('outlineVariant')}` }}>
      <Tooltip title="Show filters" placement="right">
        <IconButton onClick={() => setOpen(true)} aria-label="Show filters" aria-expanded={false}>
          <Badge badgeContent={count} color="primary" invisible={!count}>
            <FilterListOutlined />
          </Badge>
        </IconButton>
      </Tooltip>
    </aside>
  );
}

/** The library, or what was put away. Two rows, like a facet, because that is what it is. */
function Where() {
  const archived = useBrowse((s) => s.archived);
  const setArchived = useBrowse((s) => s.setArchived);
  const row = (on: boolean, label: string, icon: ReactNode) => (
    <ButtonBase
      onClick={() => setArchived(on)}
      aria-pressed={archived === on}
      sx={{
        width: '100%',
        justifyContent: 'flex-start',
        gap: 1,
        px: 1,
        py: 0.75,
        borderRadius: `${SHAPE.sm}px`,
        color: archived === on ? md('onSecondaryContainer') : md('onSurfaceVariant'),
        backgroundColor: archived === on ? md('secondaryContainer') : 'transparent',
        '&:hover': { backgroundColor: archived === on ? md('secondaryContainer') : md('surfaceContainerHigh') },
      }}
    >
      {icon}
      <Typography variant="bodyMedium" noWrap>
        {label}
      </Typography>
    </ButtonBase>
  );
  return (
    <section style={{ padding: '10px 0 12px', borderTop: `1px solid ${md('outlineVariant')}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {row(false, 'The library', <Inventory2Outlined sx={{ fontSize: 18 }} />)}
      {row(true, 'Put away', <ArchiveOutlined sx={{ fontSize: 18 }} />)}
    </section>
  );
}

export function FilterPane({ facets }: { facets: FacetCounts | undefined }) {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const filters = useBrowse((s) => s.filters);
  const setOpen = useBrowse((s) => s.setFiltersOpen);
  const clearFilters = useBrowse((s) => s.clearFilters);
  const count = activeFilterCount(filters);
  const toggle = (f: Facet) => {
    const next = new Set(collapsed);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      // not remembered
    }
  };
  return (
    // The gutter is kept whether or not a scrollbar is there, so opening a group never shifts the rows.
    <aside aria-label="Filters" style={{ width: 272, flexShrink: 0, overflowY: 'auto', scrollbarGutter: 'stable', padding: '4px 8px 24px 16px', borderRight: `1px solid ${md('outlineVariant')}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0 10px 8px' }}>
        <Typography variant="titleSmall" sx={{ flex: 1, color: md('onSurface') }}>
          Filters
          {count > 0 && (
            <Typography component="span" variant="labelSmall" sx={{ ml: 1, px: 0.75, py: '2px', borderRadius: `${SHAPE.full}px`, background: md('primary'), color: md('onPrimary') }}>
              {count}
            </Typography>
          )}
        </Typography>
        {count > 0 && (
          <Button size="small" onClick={clearFilters}>
            Clear
          </Button>
        )}
        <Tooltip title="Hide filters">
          <IconButton size="small" onClick={() => setOpen(false)} aria-label="Hide filters" aria-expanded>
            <KeyboardDoubleArrowLeftRounded />
          </IconButton>
        </Tooltip>
      </div>
      {/* What the grid is showing at all: the library, or the packs put away. */}
      <Where />
      {facets &&
        FACETS.filter((f) => facets[f].length > 0 || (filters[f]?.length ?? 0) > 0).map((f) => (
          <FacetSection key={f} facet={f} values={facets[f]} collapsed={collapsed.has(f)} onToggle={() => toggle(f)} />
        ))}
    </aside>
  );
}
