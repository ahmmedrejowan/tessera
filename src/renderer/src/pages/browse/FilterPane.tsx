import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { AssetType } from '@shared/assets';
import { FACET_LABELS, FACETS, type Facet, type FacetCounts } from '@shared/query';
import { facetLabel, formatCount, TYPE_ICONS } from '../../components/labels';
import { useBrowse } from '../../state/browse';
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
    <section style={{ paddingBlock: 4 }}>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={!collapsed}
        sx={{ width: '100%', justifyContent: 'space-between', px: 1.5, py: 1, borderRadius: `${SHAPE.sm}px`, '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
      >
        <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
          {FACET_LABELS[facet]}
          {selected.length > 0 && (
            <Typography component="span" variant="labelMedium" sx={{ ml: 1, px: 0.75, py: '1px', borderRadius: `${SHAPE.full}px`, background: md('primary'), color: md('onPrimary') }}>
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
                sx={{ justifyContent: 'flex-start', gap: 1, pl: 0.5, pr: 1.5, minHeight: 34, borderRadius: `${SHAPE.sm}px`, '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
              >
                <Checkbox checked={on} size="small" tabIndex={-1} disableRipple sx={{ p: 0.5 }} />
                {Icon && <Icon sx={{ fontSize: 18, color: md('onSurfaceVariant') }} />}
                <Typography variant="bodyMedium" noWrap sx={{ flex: 1, textAlign: 'left', color: count || on ? md('onSurface') : md('onSurfaceVariant') }}>
                  {facetLabel(facet, value)}
                </Typography>
                <Typography variant="labelSmall" sx={{ color: md('onSurfaceVariant') }}>
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
export function FilterPane({ facets }: { facets: FacetCounts | undefined }) {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const filters = useBrowse((s) => s.filters);
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
    <aside aria-label="Filters" style={{ width: 272, flexShrink: 0, overflowY: 'auto', padding: '8px 8px 24px 16px', borderRight: `1px solid ${md('outlineVariant')}` }}>
      {facets &&
        FACETS.filter((f) => facets[f].length > 0 || (filters[f]?.length ?? 0) > 0).map((f) => (
          <FacetSection key={f} facet={f} values={facets[f]} collapsed={collapsed.has(f)} onToggle={() => toggle(f)} />
        ))}
    </aside>
  );
}
