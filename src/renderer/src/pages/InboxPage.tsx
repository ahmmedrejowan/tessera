import AddOutlined from '@mui/icons-material/AddOutlined';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { LICENCES, licenceInfo, OWN_WORK } from '@shared/licences';
import { missingForLibrary } from '@shared/pack';
import type { PackRow } from '@shared/query';
import { sourceFromUrl } from '@shared/sources';
import { call } from '../api';
import { EmptyState } from '../components/EmptyState';
import { removePacks } from './browse/deleting';
import { typeSummary } from '../components/labels';
import { failed, notify } from '../notices/store';
import { I_DONT_KNOW, I_MADE_IT, useAdding } from '../state/adding';
import { useImport } from '../state/importer';
import { useIndexVersion, useLibraryId } from '../state/library';
import { useNav } from '../state/nav';
import { md, mdAlpha, SHAPE } from '../theme';
import { coverHeight, PackCard } from './browse/PackCard';
import { PAGE, Page } from './Placeholder';

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days < 1 ? 'added today' : days === 1 ? 'added yesterday' : `added ${days} days ago`;
};

/** The dashed outline that says a field still wants filling in. */
const needSx = (need: boolean): SxProps<Theme> => (need ? { '& .MuiOutlinedInput-notchedOutline': { borderColor: md('tertiary'), borderStyle: 'dashed' } } : {});

/** The licences worth one click; the rest are in the list. */
const QUICK = ['CC0-1.0', 'CC-BY-4.0', 'royalty-free'];

interface Edit {
  licence?: string | null;
  url?: string;
  name?: string | null;
}

/**
 * Fill in one waiting pack and, once it has both a licence and a source, move it into the
 * library. Used by a card and by filling several in at once.
 */
async function apply(id: string, edit: Edit): Promise<boolean> {
  const pack = await call('pack:get', id);
  if (!pack) return false;
  const meta = pack.meta;
  const url = edit.url !== undefined ? edit.url.trim() || null : meta.source.url;
  const found = url ? sourceFromUrl(url) : null;
  const site = edit.url !== undefined ? (found?.id ?? meta.source.site) : meta.source.site;
  const name = edit.name !== undefined ? edit.name : meta.source.name;
  const licence = edit.licence !== undefined ? edit.licence : meta.licence.id;
  await call('pack:edit', id, {
    licence: { ...meta.licence, id: licence },
    source: { ...meta.source, url, site, name, ...(found?.creator && !meta.source.creator ? { creator: found.creator } : {}) },
  });
  const done = !!licence && !!(url || site || name);
  if (done) await call('pack:status', id, 'library');
  return done;
}

/**
 * One pack waiting for its details, with room to fill them in: the two fields that matter, the
 * shortcuts for work of your own or a download you cannot place, and what is still missing.
 */
function ReviewCard({ pack, selected, onSelect }: { pack: PackRow; selected: boolean; onSelect: (id: string, on: boolean) => void }) {
  const go = useNav((s) => s.go);
  const meta = useQuery({ queryKey: ['review-pack', pack.id, pack.licence, pack.source], queryFn: () => call('pack:get', pack.id) }).data?.meta;
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(meta?.source.url ?? ''), [meta?.source.url]);

  const licence = LICENCES.find((l) => l.id === meta?.licence.id) ?? null;
  const named = meta?.source.name ?? null;
  const hasSource = !!(meta?.source.site || meta?.source.url || named);
  const mine = named === I_MADE_IT;

  const save = async (edit: Edit) => {
    if (!meta) return;
    try {
      if (await apply(pack.id, edit)) notify.success(`“${meta.name}” is in the library.`);
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

  const missing = [!meta?.licence.id && 'a licence', !hasSource && 'a source'].filter(Boolean) as string[];

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20, borderRadius: SHAPE.lg, background: selected ? md('secondaryContainer') : md('surfaceContainerLow') }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Checkbox checked={selected} onChange={(_, on) => onSelect(pack.id, on)} sx={{ mt: -0.5, ml: -1 }} slotProps={{ input: { 'aria-label': `Pick ${pack.name}` } }} />
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
        <Tooltip title="Delete this pack">
          <IconButton onClick={() => void removePacks([pack.id], pack.name)} aria-label={`Delete ${pack.name}`} sx={{ color: md('onSurfaceVariant') }}>
            <DeleteOutlineRounded />
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
        {!licence && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {QUICK.map((id) => (
              <Chip key={id} size="small" label={licenceInfo(id)!.short} variant="outlined" onClick={() => void save({ licence: id })} />
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Typography variant="labelMedium" sx={{ color: md('onSurfaceVariant') }}>
          Source
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

      <Typography variant="bodySmall" component="div" sx={{ mt: 'auto', pt: 0.5, color: missing.length ? md('onSurfaceVariant') : md('primary'), display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {missing.length ? (
          `Needs ${missing.join(' and ')}.`
        ) : (
          <>
            <CheckCircleRounded sx={{ fontSize: 15 }} /> Ready for the library.
          </>
        )}
      </Typography>
    </section>
  );
}


/** Filling in several packs at once: the same licence, or the same answer about where they came from. */
function FillMany({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (edit: Edit) => {
    setBusy(true);
    let moved = 0;
    try {
      for (const id of ids) if (await apply(id, edit)) moved++;
      notify.success(moved ? `${moved} of ${ids.length} went into the library.` : `${ids.length} updated.`);
      onDone();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
      setMenu(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 28,
        transform: 'translateX(-50%)',
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px 10px 20px',
        borderRadius: SHAPE.full,
        background: md('inverseSurface'),
        color: md('inverseOnSurface'),
        boxShadow: `0 6px 20px ${mdAlpha('shadow', 0.3)}`,
      }}
    >
      <Typography variant="labelLarge">{ids.length} picked</Typography>
      <Button disabled={busy} onClick={(e) => setMenu(e.currentTarget)} sx={{ color: md('inversePrimary') }}>
        Licence
      </Button>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { maxHeight: 420 } } }}>
        {LICENCES.map((l) => (
          <MenuItem key={l.id} onClick={() => void run({ licence: l.id })}>
            {l.name}
          </MenuItem>
        ))}
      </Menu>
      <Button startIcon={<PersonOutlineRounded />} disabled={busy} onClick={() => void run({ name: I_MADE_IT, url: '', licence: OWN_WORK })} sx={{ color: md('inversePrimary') }}>
        I made them
      </Button>
      <Button startIcon={<HelpOutlineRounded />} disabled={busy} onClick={() => void run({ name: I_DONT_KNOW, url: '' })} sx={{ color: md('inversePrimary') }}>
        I don’t know
      </Button>
      <Button
        startIcon={<DeleteOutlineRounded />}
        disabled={busy}
        onClick={async () => {
          if (await removePacks(ids)) onDone();
        }}
        sx={{ color: md('inversePrimary') }}
      >
        Delete
      </Button>
      <Button disabled={busy} onClick={onDone} sx={{ color: md('inverseOnSurface') }}>
        Clear
      </Button>
    </div>
  );
}

/**
 * Anything here that already has both a licence and a source was only parked, not undecided: it
 * goes into the library as the page opens, rather than sitting in a list of things to do.
 */
function useReadyMoveOn(rows: PackRow[]): void {
  const swept = useRef(new Set<string>());
  useEffect(() => {
    // A licence is the cheap hint; the pack's own record settles whether a source is there too.
    const maybe = rows.filter((r) => r.licence && !swept.current.has(r.id));
    if (!maybe.length) return;
    for (const r of maybe) swept.current.add(r.id);
    void (async () => {
      const moved: string[] = [];
      for (const row of maybe) {
        try {
          const pack = await call('pack:get', row.id);
          if (!pack || missingForLibrary(pack.meta).length) continue;
          await call('pack:status', row.id, 'library');
          moved.push(pack.meta.name);
        } catch (e) {
          failed(e);
        }
      }
      if (moved.length === 1) notify.info(`“${moved[0]}” already had everything, so it went into the library.`);
      else if (moved.length > 1) notify.info(`${moved.length} packs already had everything, so they went into the library.`);
    })();
  }, [rows]);
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
  const [picked, setPicked] = useState<string[]>([]);
  useReadyMoveOn(rows);
  const here = new Set(rows.map((r) => r.id));
  const chosen = picked.filter((id) => here.has(id));
  const select = (id: string, on: boolean) => setPicked((was) => (on ? [...was, id] : was.filter((x) => x !== id)));

  return (
    <Page
      title="Review"
      subtitle={rows.length ? `${rows.length} pack${rows.length === 1 ? '' : 's'} waiting for a licence and a source` : 'Packs waiting for a licence and a source'}
      flush
      actions={
        rows.length > 1 ? (
          <Button onClick={() => setPicked(chosen.length === rows.length ? [] : rows.map((r) => r.id))}>{chosen.length === rows.length ? 'Pick none' : 'Pick all'}</Button>
        ) : undefined
      }
    >
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16, alignItems: 'stretch' }}>
            {rows.map((p) => (
              <ReviewCard key={p.id} pack={p} selected={chosen.includes(p.id)} onSelect={select} />
            ))}
          </div>
          {chosen.length > 0 && <FillMany ids={chosen} onDone={() => setPicked([])} />}
        </div>
      )}
    </Page>
  );
}
