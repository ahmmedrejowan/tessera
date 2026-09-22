import AddOutlined from '@mui/icons-material/AddOutlined';
import LinkRounded from '@mui/icons-material/LinkRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { LICENCES } from '@shared/licences';
import type { PackRow } from '@shared/query';
import { sourceFromUrl } from '@shared/sources';
import { call } from '../api';
import { EmptyState } from '../components/EmptyState';
import { typeSummary } from '../components/labels';
import { failed, notify } from '../notices/store';
import { useAdding } from '../state/adding';
import { useImport } from '../state/importer';
import { useIndexVersion, useLibraryId } from '../state/library';
import { useNav } from '../state/nav';
import { md, SHAPE } from '../theme';
import { coverHeight, PackCard } from './browse/PackCard';
import { PAGE, Page } from './Placeholder';

const COLS = '112px minmax(0, 1fr) 260px 300px 110px';
const ago = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days < 1 ? 'added today' : days === 1 ? 'added yesterday' : `added ${days} days ago`;
};

/**
 * One pack waiting for its details, with the two that matter filled in right here. Once both
 * are there it moves into the library by itself.
 */
function ReviewRow({ pack }: { pack: PackRow }) {
  const go = useNav((s) => s.go);
  const meta = useQuery({ queryKey: ['review-pack', pack.id, pack.licence, pack.source], queryFn: () => call('pack:get', pack.id) }).data?.meta;
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(meta?.source.url ?? ''), [meta?.source.url]);
  const hasSource = !!(meta?.source.site || meta?.source.url || meta?.source.name);
  const licence = LICENCES.find((l) => l.id === meta?.licence.id) ?? null;

  /** Save, and move it into the library once it has both. */
  const save = async (edit: { licence?: string | null; url?: string }) => {
    if (!meta) return;
    try {
      const nextUrl = edit.url !== undefined ? edit.url.trim() || null : meta.source.url;
      const found = nextUrl ? sourceFromUrl(nextUrl) : null;
      const site = edit.url !== undefined ? (found?.id ?? meta.source.site) : meta.source.site;
      const nextLicence = edit.licence !== undefined ? edit.licence : meta.licence.id;
      await call('pack:edit', pack.id, {
        licence: { ...meta.licence, id: nextLicence },
        source: { ...meta.source, url: nextUrl, site, ...(found?.creator && !meta.source.creator ? { creator: found.creator } : {}) },
      });
      if (nextLicence && (nextUrl || site || meta.source.name)) {
        await call('pack:status', pack.id, 'library');
        notify.success(`“${meta.name}” is in the library.`);
      }
    } catch (e) {
      failed(e);
    }
  };

  const outline = (need: boolean): SxProps<Theme> => (need ? { '& .MuiOutlinedInput-notchedOutline': { borderColor: md('tertiary'), borderStyle: 'dashed' } } : {});
  return (
    <div style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', gap: 16, padding: '10px 16px 10px 10px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
      <div style={{ width: 112, height: coverHeight(112) + 8, overflow: 'hidden', pointerEvents: 'none' }}>
        <PackCard pack={pack} width={112} selected={false} onClick={() => undefined} onOpen={() => undefined} />
      </div>
      <div style={{ minWidth: 0 }}>
        <Typography variant="titleMedium" noWrap sx={{ color: md('onSurface') }}>
          {pack.name}
        </Typography>
        <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }}>
          {typeSummary(pack.types)}
          {meta ? ` · ${ago(meta.addedAt)}` : ''}
        </Typography>
      </div>
      <Autocomplete
        size="small"
        options={LICENCES}
        value={licence}
        onChange={(_, v) => void save({ licence: v?.id ?? null })}
        getOptionLabel={(l) => l.short}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(p) => <TextField {...p} placeholder="Choose a licence" sx={outline(!licence)} />}
      />
      <TextField
        size="small"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => url !== (meta?.source.url ?? '') && void save({ url })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder={meta?.source.name ?? (hasSource ? 'Known source' : 'Paste the page link')}
        sx={outline(!hasSource)}
        slotProps={{ input: { startAdornment: <LinkRounded sx={{ color: md('onSurfaceVariant'), mr: 1, fontSize: 18 }} /> } }}
      />
      <Button startIcon={<OpenInFullRounded />} onClick={() => go({ to: 'pack', id: pack.id })} sx={{ justifySelf: 'end' }}>
        More
      </Button>
    </div>
  );
}

/**
 * Review: packs added with "finish later", waiting for a licence and a source — the check that
 * keeps assets with unknown terms out of your games. Filled in here, they move into the library.
 */
export function InboxPage() {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const choose = useImport((s) => s.choose);
  // Packs still open on the add page aren't waiting yet.
  const adding = new Set(useAdding((s) => s.drafts).map((d) => d.packId));
  const query = { scope: 'inbox' as const, text: '', filters: {} };
  const packs = useQuery({ queryKey: ['inbox', lib, version], queryFn: () => call('browse:packs', query, 'added', 0, 1000), enabled: !!lib, placeholderData: (p) => p }).data;
  const rows = (packs?.rows ?? []).filter((p) => !adding.has(p.id));

  return (
    <Page title="Review" subtitle="Packs waiting for a licence and a source" flush>
      {packs && !rows.length ? (
        <EmptyState
          icon={RateReviewOutlined}
          title="Nothing to review"
          body="Packs added with “Finish later” wait here until they have a licence and a source, so nothing with unknown terms slips into your games."
          actions={
            <Button variant="contained" startIcon={<AddOutlined />} onClick={() => void choose('files')}>
              Add packs
            </Button>
          }
        />
      ) : (
        <div style={{ padding: PAGE.body, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 1240 }}>
          <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), mb: 1 }}>
            Fill in the licence and where each came from. Complete ones move into the library by themselves.
          </Typography>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, padding: '0 16px 0 10px' }}>
            <span />
            <Typography variant="labelMedium" sx={{ color: md('onSurfaceVariant') }}>
              Pack
            </Typography>
            <Typography variant="labelMedium" sx={{ color: md('onSurfaceVariant') }}>
              Licence
            </Typography>
            <Typography variant="labelMedium" sx={{ color: md('onSurfaceVariant') }}>
              Where it came from
            </Typography>
            <span />
          </div>
          {rows.map((p) => (
            <ReviewRow key={p.id} pack={p} />
          ))}
        </div>
      )}
    </Page>
  );
}
