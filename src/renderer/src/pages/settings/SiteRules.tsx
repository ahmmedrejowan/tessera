import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import LanguageRounded from '@mui/icons-material/LanguageRounded';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { LICENCES, licenceInfo } from '@shared/licences';
import { hostOf } from '@shared/siteRules';
import { SOURCES } from '@shared/sources';
import type { SiteRule } from '@shared/types';
import { notify } from '../../notices/store';
import { useSettings, useUpdateSettings } from '../../state/queries';
import { md, SHAPE } from '../../theme';

const KNOWN = SOURCES.filter((s) => s.licence)
  .slice(0, 4)
  .map((s) => s.name)
  .join(', ');

/**
 * Sites the user has settled: "everything on this one is CC0". A pack from such a site arrives
 * with its licence and creator already filled in, and doesn't have to wait in Review.
 */
export function SiteRules() {
  const rules = useSettings().data?.siteRules ?? [];
  const update = useUpdateSettings();
  const [host, setHost] = useState('');
  const [licence, setLicence] = useState<(typeof LICENCES)[number] | null>(null);
  const [creator, setCreator] = useState('');

  const save = (next: SiteRule[]) => update.mutate({ siteRules: next.sort((a, b) => a.host.localeCompare(b.host)) });
  const patch = (h: string, change: Partial<SiteRule>) => save(rules.map((r) => (r.host === h ? { ...r, ...change } : r)));

  const add = () => {
    const h = hostOf(host);
    if (!h) {
      notify.info('That doesn’t look like a site address. Try “polyhaven.com”.');
      return;
    }
    if (rules.some((r) => r.host === h)) {
      notify.info(`${h} is already here.`);
      return;
    }
    save([...rules, { host: h, licence: licence?.id ?? null, creator: creator.trim() || null, addedAt: new Date().toISOString() }]);
    setHost('');
    setLicence(null);
    setCreator('');
  };

  return (
    <div style={{ padding: '4px 0 16px' }}>
      <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
        Tell Tessera what a site’s packs carry and it fills them in from then on. Anything the pack’s own files say still wins.
      </Typography>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0' }}>
        {rules.map((r) => (
          <div key={r.host} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px 200px 40px', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: SHAPE.lg, background: md('surfaceContainerLowest') }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <LanguageRounded sx={{ fontSize: 20, color: md('onSurfaceVariant') }} />
              <Typography variant="bodyLarge" noWrap sx={{ color: md('onSurface') }}>
                {r.host}
              </Typography>
            </div>
            <Autocomplete
              size="small"
              options={LICENCES}
              value={licenceInfo(r.licence) ?? null}
              onChange={(_, v) => patch(r.host, { licence: v?.id ?? null })}
              getOptionLabel={(l) => l.short}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(p) => <TextField {...p} placeholder="Licence" />}
            />
            <TextField size="small" defaultValue={r.creator ?? ''} onBlur={(e) => e.target.value.trim() !== (r.creator ?? '') && patch(r.host, { creator: e.target.value.trim() || null })} placeholder="Creator (optional)" />
            <Tooltip title={`Forget ${r.host}`}>
              <IconButton aria-label="Forget this site" onClick={() => save(rules.filter((x) => x.host !== r.host))}>
                <DeleteOutlineRounded />
              </IconButton>
            </Tooltip>
          </div>
        ))}
        {!rules.length && (
          <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
            No sites yet. When you fill in a pack’s licence, Tessera offers to remember the site it came from.
          </Typography>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px 200px auto', alignItems: 'center', gap: 12 }}>
        <TextField size="small" value={host} onChange={(e) => setHost(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="polyhaven.com" />
        <Autocomplete
          size="small"
          options={LICENCES}
          value={licence}
          onChange={(_, v) => setLicence(v)}
          getOptionLabel={(l) => l.short}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(p) => <TextField {...p} placeholder="Licence" />}
        />
        <TextField size="small" value={creator} onChange={(e) => setCreator(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Creator (optional)" />
        <Button startIcon={<AddRounded />} onClick={add} disabled={!host.trim()}>
          Add
        </Button>
      </div>

      <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 2 }}>
        Tessera already knows {KNOWN} and others. Your rules come first.
      </Typography>
    </div>
  );
}
