import AddOutlined from '@mui/icons-material/AddOutlined';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { LICENCES, OWN_WORK } from '@shared/licences';
import type { PackRow } from '@shared/query';
import { sourceFromUrl } from '@shared/sources';
import { call } from '../api';
import { EmptyState } from '../components/EmptyState';
import { typeSummary } from '../components/labels';
import { failed, notify } from '../notices/store';
import { I_DONT_KNOW, I_MADE_IT, useAdding } from '../state/adding';
import { useImport } from '../state/importer';
import { useIndexVersion, useLibraryId } from '../state/library';
import { useNav } from '../state/nav';
import { md, SHAPE } from '../theme';
import { coverHeight, PackCard } from './browse/PackCard';
import { PAGE, Page } from './Placeholder';

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days < 1 ? 'added today' : days === 1 ? 'added yesterday' : `added ${days} days ago`;
};

/** The dashed outline that says a field still wants filling in. */
const needSx = (need: boolean): SxProps<Theme> => (need ? { '& .MuiOutlinedInput-notchedOutline': { borderColor: md('tertiary'), borderStyle: 'dashed' } } : {});

/**
 * One pack waiting for its details, with room to fill them in: the two fields that matter, the
 * shortcuts for work of your own or a download you cannot place, and what is still missing.
 */
function ReviewCard({ pack }: { pack: PackRow }) {
  const go = useNav((s) => s.go);
  const meta = useQuery({ queryKey: ['review-pack', pack.id, pack.licence, pack.source], queryFn: () => call('pack:get', pack.id) }).data?.meta;
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(meta?.source.url ?? ''), [meta?.source.url]);

  const licence = LICENCES.find((l) => l.id === meta?.licence.id) ?? null;
  const named = meta?.source.name ?? null;
  const hasSource = !!(meta?.source.site || meta?.source.url || named);
  const mine = named === I_MADE_IT;

  /** Save, and move it into the library once it has both. */
  const save = async (edit: { licence?: string | null; url?: string; name?: string | null }) => {
    if (!meta) return;
    try {
      const nextUrl = edit.url !== undefined ? edit.url.trim() || null : meta.source.url;
      const found = nextUrl ? sourceFromUrl(nextUrl) : null;
      const site = edit.url !== undefined ? (found?.id ?? meta.source.site) : meta.source.site;
      const name = edit.name !== undefined ? edit.name : meta.source.name;
      const nextLicence = edit.licence !== undefined ? edit.licence : meta.licence.id;
      await call('pack:edit', pack.id, {
        licence: { ...meta.licence, id: nextLicence },
        source: { ...meta.source, url: nextUrl, site, name, ...(found?.creator && !meta.source.creator ? { creator: found.creator } : {}) },
      });
      if (nextLicence && (nextUrl || site || name)) {
        await call('pack:status', pack.id, 'library');
        notify.success(`“${meta.name}” is in the library.`);
      }
    } catch (e) {
      failed(e);
    }
  };

  /** "I made it" or "I don't know": both stand in for a link, and the first sets its own licence. */
  const pick = (value: string) => {
    const off = named === value;
    const own = !off && value === I_MADE_IT;
    setUrl('');
    void save({
      name: off ? null : value,
      url: '',
      ...(own ? { licence: meta?.licence.id ?? OWN_WORK } : {}),
      ...(off && meta?.licence.id === OWN_WORK ? { licence: null } : {}),
    });
  };

  const missing = [!meta?.licence.id && 'a licence', !hasSource && 'where it came from'].filter(Boolean) as string[];

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20, borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ width: 96, height: coverHeight(96) + 8, overflow: 'hidden', pointerEvents: 'none', flexShrink: 0 }}>
          <PackCard pack={pack} width={96} selected={false} onClick={() => undefined} onOpen={() => undefined} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Typography variant="titleMedium" noWrap sx={{ color: md('onSurface') }}>
            {pack.name}
          </Typography>
          <Typography variant="bodySmall" component="div" noWrap sx={{ color: md('onSurfaceVariant') }}>
            {typeSummary(pack.types)}
            {meta ? ` · ${ago(meta.addedAt)}` : ''}
          </Typography>
        </div>
        <Tooltip title="Open the pack">
          <IconButton onClick={() => go({ to: 'pack', id: pack.id })} aria-label={`Open ${pack.name}`}>
            <OpenInFullRounded />
          </IconButton>
        </Tooltip>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Typography variant="labelMedium" sx={{ color: md('onSurfaceVariant') }}>
          Licence
        </Typography>
        <Autocomplete
          size="small"
          options={LICENCES}
          value={licence}
          onChange={(_, v) => void save({ licence: v?.id ?? null })}
          getOptionLabel={(l) => l.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(p) => <TextField {...p} placeholder="Choose a licence" sx={needSx(!licence)} />}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Typography variant="labelMedium" sx={{ color: md('onSurfaceVariant') }}>
          Where it came from
        </Typography>
        <TextField
          size="small"
          value={url}
          disabled={!!named}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => url !== (meta?.source.url ?? '') && void save({ url })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder={named ?? 'Paste the page link'}
          sx={needSx(!hasSource)}
          slotProps={{ input: { startAdornment: <LinkRounded sx={{ color: md('onSurfaceVariant'), mr: 1, fontSize: 18 }} /> } }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <Chip size="small" icon={<PersonOutlineRounded />} label="I made it" variant={mine ? 'filled' : 'outlined'} color={mine ? 'primary' : 'default'} onClick={() => pick(I_MADE_IT)} />
          <Chip size="small" icon={<HelpOutlineRounded />} label="I don’t know" variant={named === I_DONT_KNOW ? 'filled' : 'outlined'} color={named === I_DONT_KNOW ? 'primary' : 'default'} onClick={() => pick(I_DONT_KNOW)} />
        </div>
      </div>

      <Typography variant="bodySmall" component="div" sx={{ color: missing.length ? md('onSurfaceVariant') : md('primary'), display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {missing.length ? (
          `Still needs ${missing.join(' and ')}.`
        ) : (
          <>
            <CheckCircleRounded sx={{ fontSize: 15 }} /> Ready for the library.
          </>
        )}
      </Typography>
    </section>
  );
}

/**
 * Review: packs whose licence or source was not clear. Each has room to fill in the two fields
 * that matter, and moves into the library by itself once it has both.
 */
export function InboxPage() {
  const go = useNav((s) => s.go);
  const lib = useLibraryId();
  const version = useIndexVersion();
  const choose = useImport((s) => s.choose);
  // Packs still open on the add page aren't waiting yet.
  const adding = new Set(useAdding((s) => s.drafts).map((d) => d.packId));
  const query = { scope: 'inbox' as const, text: '', filters: {} };
  const packs = useQuery({ queryKey: ['inbox', lib, version], queryFn: () => call('browse:packs', query, 'added', 0, 1000), enabled: !!lib, placeholderData: (p) => p }).data;
  const rows = (packs?.rows ?? []).filter((p) => !adding.has(p.id));

  return (
    <Page title="Review" subtitle={rows.length ? `${rows.length} pack${rows.length === 1 ? '' : 's'} waiting for a licence and a source` : 'Packs waiting for a licence and a source'} flush>
      {packs && !rows.length ? (
        <EmptyState
          icon={RateReviewOutlined}
          title="Nothing to review"
          body="Packs whose licence or source isn’t clear wait here, so nothing with unknown terms reaches your games."
          actions={
            <>
              <Button variant="contained" startIcon={<AddOutlined />} onClick={() => void choose('files')}>
                Add packs
              </Button>
              <Button variant="outlined" startIcon={<DownloadOutlined />} onClick={() => go({ to: 'downloads' })}>
                Download from a link
              </Button>
            </>
          }
        />
      ) : (
        <div style={{ padding: PAGE.body }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16, alignItems: 'start' }}>
            {rows.map((p) => (
              <ReviewCard key={p.id} pack={p} />
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
