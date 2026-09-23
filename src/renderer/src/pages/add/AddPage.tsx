import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import ArrowBack from '@mui/icons-material/ArrowBack';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ErrorRounded from '@mui/icons-material/ErrorRounded';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import FolderZipOutlined from '@mui/icons-material/FolderZipOutlined';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import LinkRounded from '@mui/icons-material/LinkRounded';
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import RuleRounded from '@mui/icons-material/RuleRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import SelectAllRounded from '@mui/icons-material/SelectAllRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { LICENCES, licenceInfo, OWN_WORK } from '@shared/licences';
import { hostOf, ruleFor } from '@shared/siteRules';
import { SOURCES, sourceFromUrl, sourceInfo } from '@shared/sources';
import { call } from '../../api';
import { AssetThumb } from '../../components/AssetThumb';
import { countOf, formatBytes, TYPE_ICONS } from '../../components/labels';
import type { AssetType } from '@shared/assets';
import { I_DONT_KNOW, I_MADE_IT, isReady, useAdding, type AddForm, type Draft, type Found } from '../../state/adding';
import { useJobs } from '../../state/library';
import { useNav } from '../../state/nav';
import { useNotices } from '../../notices/store';
import { useSettings, useUpdateSettings } from '../../state/queries';
import { md, mdAlpha, SHAPE } from '../../theme';

/** Changing a form, saying where a filled-in value came from when Tessera filled it in. */
type Edit = (p: Partial<AddForm>, found?: Draft['found']) => void;

const QUICK = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'royalty-free'];
const STYLES = ['Pixel art', 'Low poly', 'Voxel', 'Hand-painted', 'Isometric', 'Cartoon', 'Realistic', 'Sci-fi', 'Stylized'];

/** Under a field: where its value came from. Green when read in the pack, blue when worked out. */
function FoundNote({ found, hint }: { found: Found | undefined; hint?: string }) {
  if (!found) return <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5, minHeight: 18 }}>{hint ?? ' '}</Typography>;
  return (
    <Typography variant="bodySmall" component="div" sx={{ mt: 0.5, minHeight: 18, display: 'flex', alignItems: 'center', gap: 0.5, color: found.sure ? md('primary') : md('onSurfaceVariant') }}>
      {found.sure ? <CheckCircleRounded sx={{ fontSize: 15 }} /> : <AutoAwesomeRounded sx={{ fontSize: 15, color: md('primary') }} />}
      From {found.from}
    </Typography>
  );
}

function Label({ children, needed }: { children: ReactNode; needed?: boolean }) {
  return (
    <Typography variant="labelMedium" component="div" sx={{ color: md('onSurfaceVariant'), mb: 0.75, display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {children}
      {needed && <ErrorRounded sx={{ fontSize: 15, color: md('tertiary') }} />}
    </Typography>
  );
}

function ColumnTitle({ children }: { children: ReactNode }) {
  return (
    <Typography variant="titleSmall" component="div" sx={{ color: md('primary'), mb: -0.5 }}>
      {children}
    </Typography>
  );
}

/** One part of the form, in a card of its own: a title, a line about it, and the fields. */
function Card({ title, note, grow, children }: { title: string; note?: string; grow?: boolean; children: ReactNode }) {
  return (
    <section style={{ flex: grow ? 1 : 'none', display: 'flex', flexDirection: 'column', gap: 14, padding: '18px 20px 20px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
      <div>
        <Typography variant="titleSmall" component="h2" sx={{ color: md('onSurface') }}>
          {title}
        </Typography>
        {note && (
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.25 }}>
            {note}
          </Typography>
        )}
      </div>
      {children}
    </section>
  );
}

/** The needed-field look: an amber outline until it's filled. */
const needSx = (need: boolean): SxProps<Theme> => (need ? { '& .MuiOutlinedInput-notchedOutline': { borderColor: md('tertiary'), borderStyle: 'dashed' } } : {});

function LicenceField({ form, onEdit, found, compact }: { form: AddForm; onEdit: Edit; found?: Found; compact?: boolean }) {
  const value = LICENCES.find((l) => l.id === form.licence) ?? null;
  return (
    <div>
      <Label needed={!form.licence}>Licence</Label>
      <Autocomplete
        options={LICENCES}
        value={value}
        onChange={(_, v) => onEdit({ licence: v?.id ?? null })}
        getOptionLabel={(l) => l.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(p) => <TextField {...p} placeholder="Not found in the pack" sx={needSx(!form.licence)} />}
      />
      {!form.licence ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {QUICK.map((id) => (
            <Chip key={id} label={compact ? licenceInfo(id)!.short : licenceInfo(id)!.id === 'royalty-free' ? 'Royalty-free (bought)' : licenceInfo(id)!.short} variant="outlined" onClick={() => onEdit({ licence: id })} />
          ))}
        </div>
      ) : (
        <FoundNote found={found} hint={licenceInfo(form.licence)?.attribution ? 'Asks for credit: fill in the credit line' : 'No credit needed'} />
      )}
    </div>
  );
}

function SourceField({ form, onEdit, found }: { form: AddForm; onEdit: Edit; found?: Found }) {
  const rules = useSettings().data?.siteRules ?? [];
  const site = form.site ? sourceInfo(form.site) : form.url ? sourceFromUrl(form.url) : null;
  const need = !form.site && !form.url.trim() && !form.sourceName;
  return (
    <div>
      <Label needed={need}>Where it came from</Label>
      <TextField
        fullWidth
        value={form.url}
        onChange={(e) => {
          const url = e.target.value;
          const s = sourceFromUrl(url);
          const rule = ruleFor(rules, url);
          const patch: Partial<AddForm> = { url, site: s?.id ?? (url ? null : form.site), sourceName: url ? null : form.sourceName };
          const note: Draft['found'] = {};
          const creator = rule?.creator ?? s?.creator ?? '';
          if (creator && !form.creator) {
            patch.creator = creator;
            note.creator = { from: rule?.creator ? `your rule for ${rule.host}` : 'the site', sure: true };
          }
          // The user has already settled what this site's packs carry.
          if (rule?.licence && !form.licence) {
            patch.licence = rule.licence;
            note.licence = { from: `your rule for ${rule.host}`, sure: true };
          }
          onEdit(patch, note);
        }}
        placeholder={form.sourceName ? form.sourceName : 'Paste the page you downloaded it from'}
        sx={needSx(need)}
        slotProps={{ input: { startAdornment: <LinkRounded sx={{ color: md('onSurfaceVariant'), mr: 1 }} /> } }}
      />
      {need || form.sourceName ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {[
            [I_DONT_KNOW, 'I don’t know', <HelpOutlineRounded key="h" />],
            [I_MADE_IT, 'I made it', <PersonOutlineRounded key="p" />],
          ].map(([v, label, icon]) => (
            <Chip
              key={v as string}
              icon={icon as never}
              label={label as string}
              variant={form.sourceName === v ? 'filled' : 'outlined'}
              color={form.sourceName === v ? 'primary' : 'default'}
              onClick={() => {
                const off = form.sourceName === v;
                const mine = !off && v === I_MADE_IT;
                onEdit(
                  {
                    sourceName: off ? null : (v as string),
                    url: '',
                    site: null,
                    // Your own work carries its own licence, and nobody to credit.
                    ...(mine ? { licence: form.licence ?? OWN_WORK, creator: '', attribution: '' } : {}),
                    ...(off && form.licence === OWN_WORK ? { licence: null } : {}),
                  },
                  mine ? { licence: { from: 'you: it is your own work', sure: true } } : {},
                );
              }}
            />
          ))}
        </div>
      ) : (
        <FoundNote found={found} hint={site ? `${site.name}` : undefined} />
      )}
    </div>
  );
}

/**
 * The licence and the site are both filled in: offer to keep that pairing. Once a site is
 * remembered, its next packs arrive with the licence (and creator) already there.
 */
function RememberSite({ form }: { form: AddForm }) {
  const rules = useSettings().data?.siteRules ?? [];
  const update = useUpdateSettings();
  const [saved, setSaved] = useState<string | null>(null);
  const host = hostOf(form.url);
  const lic = licenceInfo(form.licence);
  if (!host || !lic) return null;
  const known = ruleFor(rules, form.url);
  if (known && known.host !== saved) return null;

  const set = (next: typeof rules) => update.mutate({ siteRules: next });
  const remember = () => {
    setSaved(host);
    set([...rules.filter((r) => r.host !== host), { host, licence: lic.id, creator: form.creator.trim() || null, addedAt: new Date().toISOString() }]);
  };
  const undo = () => {
    setSaved(null);
    set(rules.filter((r) => r.host !== host));
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: SHAPE.lg, border: `1px solid ${md('outlineVariant')}`, background: saved ? mdAlpha('primary', 0.06) : md('surfaceContainerLowest') }}>
      <RuleRounded sx={{ fontSize: 20, color: saved ? md('primary') : md('onSurfaceVariant') }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="bodyMedium" component="div" noWrap sx={{ color: md('onSurface') }}>
          {saved ? `Remembered: ${lic.short} for this site` : `Always use ${lic.short} for this site?`}
        </Typography>
        <Typography variant="bodySmall" component="div" noWrap sx={{ color: md('onSurfaceVariant') }}>
          {host} · {saved ? 'change it in Settings → Sites' : 'its next packs fill themselves in'}
        </Typography>
      </div>
      <Button size="small" onClick={saved ? undo : remember}>
        {saved ? 'Undo' : 'Remember'}
      </Button>
    </div>
  );
}

/** The two things a pack cannot join the library without, and what follows from them. */
function TermsCard({ d, onEdit, grow }: { d: Draft; onEdit: Edit; grow?: boolean }) {
  const f = d.form;
  const lic = licenceInfo(f.licence);
  const mine = f.sourceName === I_MADE_IT;
  return (
    <Card title="Licence and source" note={mine ? 'Your own work: nothing to credit, nowhere it came from.' : 'The two things every pack needs before it joins the library.'} grow={grow}>
      <SourceField form={f} onEdit={onEdit} found={d.found.source} />
      <LicenceField form={f} onEdit={onEdit} found={d.found.licence} />
      {!mine && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <Label>Creator</Label>
            <TextField fullWidth value={f.creator} onChange={(e) => onEdit({ creator: e.target.value })} placeholder="Who made it" />
            <FoundNote found={f.creator ? d.found.creator : undefined} />
          </div>
          <div>
            <Label>Credit line</Label>
            <TextField fullWidth value={f.attribution} onChange={(e) => onEdit({ attribution: e.target.value })} disabled={!!lic && !lic.attribution} placeholder={lic && !lic.attribution ? `Not needed for ${lic.short}` : 'If the licence asks'} />
            <FoundNote found={undefined} hint={lic?.attribution ? 'Copied into a project’s credits' : ' '} />
          </div>
        </div>
      )}
      <RememberSite form={f} />
    </Card>
  );
}

/** What the pack is called: the first thing to get right, so it sits at the top. */
function NameCard({ d, onEdit }: { d: Draft; onEdit: Edit }) {
  return (
    <Card title="Name" note="How it will show up in your library.">
      <div>
        <TextField fullWidth value={d.form.name} onChange={(e) => onEdit({ name: e.target.value })} />
        <FoundNote found={d.found.name} />
      </div>
    </Card>
  );
}

/** Which version of the pack this is, beside its picture. */
function VersionCard({ d, onEdit }: { d: Draft; onEdit: Edit }) {
  const f = d.form;
  return (
    <Card title="Version" note="If the download says one.">
      <div>
        <TextField fullWidth value={f.version} onChange={(e) => onEdit({ version: e.target.value })} placeholder="1.0" />
        <FoundNote found={f.version ? d.found.version : undefined} />
      </div>
    </Card>
  );
}

/** What is inside, in the words you will search for later. */
function DescribeCard({ d, onEdit, grow }: { d: Draft; onEdit: Edit; grow?: boolean }) {
  const f = d.form;
  return (
    <Card title="What’s inside" note="What you will search for in six months." grow={grow}>
      <div>
        <Label>Description</Label>
        <TextField fullWidth multiline minRows={2} maxRows={4} value={f.description} onChange={(e) => onEdit({ description: e.target.value })} placeholder="What’s in it, in a line or two" />
        <FoundNote found={f.description ? d.found.description : undefined} />
      </div>
      <div>
        <Label>Style</Label>
        <Autocomplete multiple freeSolo options={STYLES} value={f.styles} onChange={(_, v) => onEdit({ styles: v as string[] })} renderInput={(p) => <TextField {...p} placeholder={f.styles.length ? '' : 'Pixel art, low poly…'} />} />
        <FoundNote found={f.styles.length ? d.found.styles : undefined} />
      </div>
      <div>
        <Label>Tags</Label>
        <Autocomplete multiple freeSolo options={[]} value={f.tags} onChange={(_, v) => onEdit({ tags: (v as string[]).map((t) => t.trim().toLowerCase()).filter(Boolean) })} renderInput={(p) => <TextField {...p} placeholder={f.tags.length ? '' : 'Type and press Enter'} />} />
        <FoundNote found={f.tags.length ? d.found.tags : undefined} />
      </div>
    </Card>
  );
}

/** Proof of where it came from, kept with the pack. */
function RecordCard({ d, onEdit }: { d: Draft; onEdit: Edit }) {
  const f = d.form;
  const hasUrl = /^https?:\/\//i.test(f.url.trim());
  return (
    <Card title="Keep a record of the page" note={hasUrl ? 'Proof of what the page said the day you downloaded it.' : 'Needs a page link above.'}>
      <div style={{ border: `1px solid ${md('outlineVariant')}`, borderRadius: SHAPE.lg, background: md('surfaceContainerLowest'), padding: '2px 14px' }}>
        {[
          ['snapshot', <PhotoCameraOutlined key="c" />, 'Save a snapshot of the page', 'Kept with the pack, as proof of its licence'],
          ['archive', <AccountBalanceOutlined key="a" />, 'Save it on archive.org', 'A public copy in the Wayback Machine, in the background'],
        ].map(([key, icon, title, sub], i) => (
          <label key={key as string} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, borderTop: i ? `1px solid ${md('surfaceContainerHigh')}` : 'none', cursor: hasUrl ? 'pointer' : 'default' }}>
            <span style={{ color: md('onSurfaceVariant'), display: 'flex' }}>{icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <Typography variant="bodyMedium" component="div" sx={{ color: hasUrl ? md('onSurface') : md('onSurfaceVariant') }}>
                {title as string}
              </Typography>
              <Typography variant="bodySmall" component="div" noWrap sx={{ color: md('onSurfaceVariant') }}>
                {hasUrl ? (sub as string) : 'Needs the page link'}
              </Typography>
            </span>
            <Switch checked={hasUrl && f[key as 'snapshot' | 'archive']} disabled={!hasUrl} onChange={(_, v) => onEdit({ [key as string]: v })} slotProps={{ input: { 'aria-label': title as string } }} />
          </label>
        ))}
      </div>
    </Card>
  );
}

/**
 * The two columns beside the preview: what the pack is allowed to be used for on the left, what
 * it holds on the right, with the record of its page under that. Narrow windows stack them.
 */
function Details({ d, onEdit }: { d: Draft; onEdit: Edit }) {
  const mine = d.form.sourceName === I_MADE_IT;
  // Both columns stretch to the taller of the two, so the page ends level on either side.
  const column = { display: 'flex', flexDirection: 'column' as const, gap: 16, minWidth: 0 };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, alignItems: 'stretch' }}>
      <div style={column}>
        <NameCard d={d} onEdit={onEdit} />
        <TermsCard d={d} onEdit={onEdit} grow />
      </div>
      <div style={column}>
        <DescribeCard d={d} onEdit={onEdit} grow={mine} />
        {!mine && <RecordCard d={d} onEdit={onEdit} />}
      </div>
    </div>
  );
}

/** For a pack with no pictures: an icon for what's in it most (sounds, fonts…). */
function PackIcon({ d, size }: { d: Draft; size: number }) {
  const top = (Object.entries(d.row?.types ?? {}) as [AssetType, number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
  const Icon = top ? TYPE_ICONS[top] : FolderZipOutlined;
  return <Icon sx={{ fontSize: size, color: md('onSurfaceVariant') }} />;
}

/** The pack's pictures and what's in it, and how the copying is going. */
function Preview({ d }: { d: Draft }) {
  const files = useQuery({ queryKey: ['add-files', d.packId], queryFn: () => call('pack:files', d.packId!), enabled: !!d.packId }).data ?? [];
  const jobs = useJobs();
  const pics = files.filter((a) => a.kind === 'model' || a.kind === 'image').slice(0, 5);
  const job = jobs.find((j) => j.state === 'running' && j.label.startsWith('Adding'));
  const types = d.row?.types ?? {};
  return (
    <div style={{ background: md('surfaceContainerLow'), borderRadius: SHAPE.xl, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      <div style={{ aspectRatio: '1.45', borderRadius: SHAPE.lg, overflow: 'hidden', background: md('surfaceContainerHigh'), display: 'grid', placeItems: 'center' }}>
        {pics[0] ? <AssetThumb asset={pics[0]} size={268} rounded={0} /> : d.state === 'copying' ? <CircularProgress size={28} /> : <PackIcon d={d} size={44} />}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ aspectRatio: '1', borderRadius: SHAPE.md, overflow: 'hidden', background: md('surfaceContainerHigh') }}>{pics[i] && <AssetThumb asset={pics[i]} size={60} rounded={0} />}</div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {(Object.entries(types) as [keyof typeof types, number][])
          .filter(([t]) => t !== 'other')
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => (
            <span key={t} style={{ fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 13, background: md('surfaceContainerLowest') }}>
              {countOf(t, n)}
            </span>
          ))}
        <span style={{ fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 13, background: md('surfaceContainerLowest') }}>{formatBytes(d.item.size)}</span>
      </div>
      <div style={{ marginTop: 'auto' }}>
        <Typography variant="bodySmall" component="div" sx={{ color: d.state === 'failed' ? md('error') : md('onSurfaceVariant'), display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {d.state === 'copying' ? `Copying into the library…${job?.progress != null ? ` ${Math.round(job.progress * 100)}%` : ''}` : d.state === 'failed' ? `Couldn’t add it: ${d.error}` : (
            <>
              Copied into the library <CheckRounded sx={{ fontSize: 15 }} />
            </>
          )}
        </Typography>
        <LinearProgress variant={d.state === 'copying' && job?.progress == null ? 'indeterminate' : 'determinate'} value={d.state === 'copying' ? (job?.progress ?? 0) * 100 : 100} sx={{ mt: 0.75, height: 4, borderRadius: 2 }} />
      </div>
    </div>
  );
}

function Header({ title, file, children }: { title: string; file: ReactNode; children?: ReactNode }) {
  const goBack = useNav((s) => s.goBack);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 28px 16px 20px' }}>
      <Tooltip title="Back (unfinished packs wait in Review)">
        <IconButton onClick={goBack} aria-label="Back">
          <ArrowBack />
        </IconButton>
      </Tooltip>
      <Typography variant="headlineSmall" component="h1" sx={{ color: md('onSurface') }}>
        {title}
      </Typography>
      {file}
      <span style={{ flex: 1 }} />
      {children}
    </div>
  );
}

function FileChip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px 0 8px', borderRadius: 13, background: md('surfaceContainerHigh'), color: md('onSurfaceVariant'), fontSize: 12, maxWidth: 360, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
      {icon}
      {children}
    </span>
  );
}

function Footer({ children, note, tone }: { children: ReactNode; note: ReactNode; tone: 'ok' | 'warn' | 'plain' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px 18px 28px', borderTop: `1px solid ${md('outlineVariant')}`, background: md('surfaceContainerLowest') }}>
      <Typography variant="bodyMedium" component="div" sx={{ mr: 'auto', display: 'flex', alignItems: 'center', gap: 1, color: tone === 'warn' ? md('tertiary') : md('onSurfaceVariant') }}>
        {tone === 'ok' ? <CheckCircleRounded sx={{ color: md('primary') }} /> : <InfoOutlined />}
        {note}
      </Typography>
      {children}
    </div>
  );
}

/** Items the library seems to have already, with a way to add them anyway. */
function Skipped() {
  const { skipped, addAnyway } = useAdding();
  if (!skipped.length) return null;
  return (
    <div style={{ margin: '0 28px 12px', padding: '10px 10px 10px 16px', borderRadius: SHAPE.lg, background: mdAlpha('tertiary', 0.1), color: md('onSurface'), display: 'flex', alignItems: 'center', gap: 12 }}>
      <InfoOutlined sx={{ color: md('tertiary') }} />
      <Typography variant="bodyMedium" sx={{ flex: 1 }}>
        Left out, already in your library: {skipped.map((s) => `“${s.name}”`).join(', ')}
      </Typography>
      {skipped.map((s) => (
        <Button key={s.id} size="small" onClick={() => void addAnyway(s)}>
          Add {skipped.length > 1 ? `“${s.name}”` : 'it'} anyway
        </Button>
      ))}
    </div>
  );
}

function SinglePage({ d }: { d: Draft }) {
  const { edit, save, cancel, busy } = useAdding();
  const onEdit: Edit = (p, found) => edit(d.item.id, p, found);
  const ready = isReady(d.form);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Header title="Add pack" file={<FileChip icon={d.item.kind === 'folder' ? <FolderOutlined sx={{ fontSize: 16 }} /> : <FolderZipOutlined sx={{ fontSize: 16 }} />}>{d.item.sources[0]?.split(/[\\/]/).pop()}</FileChip>} />
      <Skipped />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', gap: 24, padding: '0 32px 24px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Preview d={d} />
          <VersionCard d={d} onEdit={onEdit} />
        </div>
        <Details d={d} onEdit={onEdit} />
      </div>
      <Footer tone={ready ? 'ok' : 'warn'} note={d.state === 'copying' ? 'Reading the pack…' : ready ? 'Everything needed is filled in' : 'Add a licence and source now, or finish later from Review.'}>
        <Button onClick={() => void cancel()} disabled={busy}>
          Cancel
        </Button>
        {!ready && (
          <Button variant="contained" color="secondary" startIcon={<ScheduleRounded />} disabled={busy || d.state !== 'ready'} onClick={() => void save([d.item.id], { later: true })} sx={{ backgroundColor: md('secondaryContainer'), color: md('onSecondaryContainer'), boxShadow: 'none' }}>
            Finish later
          </Button>
        )}
        <Button variant="contained" startIcon={<CheckRounded />} disabled={busy || !ready || d.state !== 'ready'} onClick={() => void save([d.item.id])}>
          Add to library
        </Button>
      </Footer>
    </div>
  );
}

/** One quick setting for every selected pack: a licence or a source from a list, or a creator. */
function BulkBar({ count }: { count: number }) {
  const editSelected = useAdding((s) => s.editSelected);
  const [licAnchor, setLicAnchor] = useState<HTMLElement | null>(null);
  const [srcAnchor, setSrcAnchor] = useState<HTMLElement | null>(null);
  const [creatorAnchor, setCreatorAnchor] = useState<HTMLElement | null>(null);
  const [creator, setCreator] = useState('');
  const pill = { height: 32, px: 1.5, borderRadius: `${SHAPE.full}px`, backgroundColor: md('surfaceContainerLowest'), color: md('onSurface'), fontWeight: 500, fontSize: 13 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 14px', borderRadius: SHAPE.lg, background: md('tertiaryContainer'), color: md('onTertiaryContainer'), marginBottom: 20 }}>
      <SelectAllRounded fontSize="small" />
      <Typography variant="labelLarge" sx={{ flex: 1 }}>
        {count} selected · fill in once for all
      </Typography>
      <ButtonBase sx={pill} onClick={(e) => setLicAnchor(e.currentTarget)}>
        Licence ▾
      </ButtonBase>
      <ButtonBase sx={pill} onClick={(e) => setSrcAnchor(e.currentTarget)}>
        Source ▾
      </ButtonBase>
      <ButtonBase sx={pill} onClick={(e) => setCreatorAnchor(e.currentTarget)}>
        Creator
      </ButtonBase>
      <Menu anchorEl={licAnchor} open={!!licAnchor} onClose={() => setLicAnchor(null)}>
        {LICENCES.map((l) => (
          <MenuItem key={l.id} onClick={() => (editSelected({ licence: l.id }), setLicAnchor(null))}>
            {l.name}
          </MenuItem>
        ))}
      </Menu>
      <Menu anchorEl={srcAnchor} open={!!srcAnchor} onClose={() => setSrcAnchor(null)}>
        {SOURCES.map((s) => (
          <MenuItem key={s.id} onClick={() => (editSelected({ site: s.id, sourceName: null, ...(s.creator ? { creator: s.creator } : {}) }), setSrcAnchor(null))}>
            {s.name}
          </MenuItem>
        ))}
        <MenuItem onClick={() => (editSelected({ sourceName: I_DONT_KNOW, site: null, url: '' }), setSrcAnchor(null))}>I don’t know</MenuItem>
        <MenuItem onClick={() => (editSelected({ sourceName: I_MADE_IT, site: null, url: '' }), setSrcAnchor(null))}>I made them</MenuItem>
      </Menu>
      <Popover anchorEl={creatorAnchor} open={!!creatorAnchor} onClose={() => setCreatorAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { p: 2, display: 'flex', gap: 1 } } }}>
        <TextField autoFocus size="small" value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="Who made them" onKeyDown={(e) => e.key === 'Enter' && (editSelected({ creator }), setCreatorAnchor(null))} />
        <Button variant="contained" onClick={() => (editSelected({ creator }), setCreatorAnchor(null))}>
          Set
        </Button>
      </Popover>
    </div>
  );
}

function ListRow({ d, selected, primary, onClick }: { d: Draft; selected: boolean; primary: boolean; onClick: (e: React.MouseEvent) => void }) {
  const files = useQuery({ queryKey: ['add-files', d.packId], queryFn: () => call('pack:files', d.packId!), enabled: !!d.packId }).data ?? [];
  const pic = files.find((a) => a.kind === 'model' || a.kind === 'image');
  const ready = isReady(d.form);
  const why = !d.form.licence && !d.form.site && !d.form.url && !d.form.sourceName ? 'No licence or source' : !d.form.licence ? 'No licence' : 'No source';
  return (
    <ButtonBase
      onClick={onClick}
      sx={{ width: '100%', height: 52, flexShrink: 0, gap: 1.5, px: 2.25, justifyContent: 'flex-start', textAlign: 'left', backgroundColor: primary ? md('secondaryContainer') : selected ? mdAlpha('secondaryContainer', 0.55) : 'transparent', '&:hover': { backgroundColor: primary ? md('secondaryContainer') : md('surfaceContainerLow') } }}
    >
      <span style={{ width: 40, height: 32, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: md('surfaceContainerHigh'), display: 'grid', placeItems: 'center' }}>
        {pic ? <AssetThumb asset={pic} size={40} rounded={0} /> : d.state === 'copying' ? <CircularProgress size={14} /> : <PackIcon d={d} size={20} />}
      </span>
      <Typography variant="bodyMedium" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 500, color: md('onSurface') }}>
        {d.form.name}
      </Typography>
      {d.state === 'failed' ? (
        <Typography variant="bodySmall" sx={{ color: md('error') }}>
          Couldn’t add
        </Typography>
      ) : d.state === 'copying' ? (
        <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
          Copying…
        </Typography>
      ) : ready ? (
        <>
          <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant') }}>
            {[sourceInfo(d.form.site)?.name ?? d.form.sourceName, licenceInfo(d.form.licence)?.short].filter(Boolean).join(' · ')}
          </Typography>
          <CheckRounded sx={{ fontSize: 18, color: md('primary') }} />
        </>
      ) : (
        <Typography variant="bodySmall" noWrap sx={{ color: md('tertiary') }}>
          {why}
        </Typography>
      )}
    </ButtonBase>
  );
}

function Group({ icon, title, count }: { icon: ReactNode; title: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px 6px', color: md('onSurfaceVariant') }}>
      {icon}
      <Typography variant="labelMedium" sx={{ textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="labelMedium">{count}</Typography>
    </div>
  );
}

function BatchPage() {
  const { drafts, selected, select, edit, save, cancel, busy, folder, treatAsOnePack } = useAdding();
  const [anchor, setAnchor] = useState<string | null>(null);
  const needs = drafts.filter((d) => !isReady(d.form));
  const ready = drafts.filter((d) => isReady(d.form));
  const order = [...needs, ...ready];
  const primary = drafts.find((d) => d.item.id === selected[0]) ?? order[0];
  const click = (d: Draft) => (e: React.MouseEvent) => {
    const id = d.item.id;
    if (e.shiftKey && anchor) {
      const a = order.findIndex((x) => x.item.id === anchor);
      const b = order.findIndex((x) => x.item.id === id);
      const range = order.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.item.id);
      select([id, ...range.filter((x) => x !== id)]);
    } else if (e.metaKey || e.ctrlKey) {
      select(selected.includes(id) ? selected.filter((x) => x !== id) : [id, ...selected]);
      setAnchor(id);
    } else {
      select([id]);
      setAnchor(id);
    }
  };
  const readyIds = ready.filter((d) => d.state === 'ready').map((d) => d.item.id);
  const copying = drafts.some((d) => d.state === 'copying');
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Header
        title={`Add ${drafts.length} packs`}
        file={folder ? <FileChip icon={<FolderOutlined sx={{ fontSize: 16 }} />}>{folder.split(/[\\/]/).slice(-2).join('/')}</FileChip> : null}
      >
        {folder && (
          <Button startIcon={<UnfoldLessRounded />} onClick={() => void treatAsOnePack()} disabled={busy}>
            Treat as one pack
          </Button>
        )}
      </Header>
      <Skipped />
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '420px minmax(0, 1fr)', gap: 28, padding: '0 28px 20px' }}>
        <div style={{ background: md('surfaceContainerLowest'), border: `1px solid ${md('outlineVariant')}`, borderRadius: SHAPE.xl, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {needs.length > 0 && <Group icon={<ErrorRounded sx={{ fontSize: 16, color: md('tertiary') }} />} title="Needs details" count={needs.length} />}
            {needs.map((d) => (
              <ListRow key={d.item.id} d={d} selected={selected.includes(d.item.id)} primary={d.item.id === primary?.item.id} onClick={click(d)} />
            ))}
            {ready.length > 0 && <Group icon={<CheckCircleRounded sx={{ fontSize: 16, color: md('primary') }} />} title="Ready" count={ready.length} />}
            {ready.map((d) => (
              <ListRow key={d.item.id} d={d} selected={selected.includes(d.item.id)} primary={d.item.id === primary?.item.id} onClick={click(d)} />
            ))}
          </div>
          <Typography variant="bodySmall" component="div" sx={{ px: 2.25, py: 1.25, color: md('onSurfaceVariant'), borderTop: `1px solid ${md('surfaceContainerHigh')}` }}>
            {window.tessera.platform === 'darwin' ? '⌘' : 'Ctrl'}-click or Shift-click to fill in several at once
          </Typography>
        </div>
        <div style={{ minHeight: 0, overflowY: 'auto' }}>
          {selected.length > 1 && <BulkBar count={selected.length} />}
          {primary && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <Typography variant="titleLarge" noWrap sx={{ color: md('onSurface'), flex: 1, minWidth: 0 }}>
                  {primary.form.name}
                </Typography>
                <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant') }}>
                  {formatBytes(primary.item.size)} · {primary.item.sources[0]?.split(/[\\/]/).pop()}
                </Typography>
              </div>
              <Details d={primary} onEdit={(p, found) => edit(primary.item.id, p, found)} />
            </>
          )}
        </div>
      </div>
      <Footer tone="plain" note={copying ? 'Reading the packs…' : 'Ready packs go in now. The others can be finished here or later.'}>
        <Button onClick={() => void cancel()} disabled={busy}>
          Cancel
        </Button>
        {needs.length > 0 && (
          <Button variant="contained" disabled={busy || copying} onClick={() => void save(drafts.map((d) => d.item.id), { later: false })} sx={{ backgroundColor: md('secondaryContainer'), color: md('onSecondaryContainer'), boxShadow: 'none', '&:hover': { backgroundColor: md('secondaryContainer') } }}>
            {readyIds.length ? `Add all ${drafts.length}, finish ${needs.length} later` : 'Finish all later'}
          </Button>
        )}
        <Button variant="contained" startIcon={<CheckRounded />} disabled={busy || !readyIds.length} onClick={() => void save(readyIds)}>
          {!readyIds.length ? 'Add to library' : needs.length ? `Add the ${readyIds.length} that are ready` : `Add all ${readyIds.length}`}
        </Button>
      </Footer>
    </div>
  );
}

/**
 * Adding packs: right after choosing them, one page with everything that could be found filled
 * in. Add to the library, finish later (the pack waits in Review), or cancel. Leaving the page
 * keeps unfinished packs in Review.
 */
export function AddPage() {
  const drafts = useAdding((s) => s.drafts);
  const goBack = useNav((s) => s.goBack);
  // Leaving while packs are still here keeps them for Review.
  useEffect(() => () => void useAdding.getState().finishLater(), []);
  // Messages rise above the page's buttons.
  useEffect(() => {
    useNotices.getState().setLift(84);
    return () => useNotices.getState().setLift(0);
  }, []);
  useEffect(() => {
    if (!drafts.length && !useAdding.getState().busy) {
      const t = setTimeout(() => !useAdding.getState().drafts.length && goBack(), 0);
      return () => clearTimeout(t);
    }
  }, [drafts.length, goBack]);
  if (!drafts.length) return null;
  return drafts.length === 1 ? <SinglePage d={drafts[0]!} /> : <BatchPage />;
}
