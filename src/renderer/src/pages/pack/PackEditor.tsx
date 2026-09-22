import AutoFixHighOutlined from '@mui/icons-material/AutoFixHighOutlined';
import Close from '@mui/icons-material/Close';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { licenceInfo, LICENCES } from '@shared/licences';
import type { PackEdit, PackMeta } from '@shared/pack';
import { sourceInfo, SOURCES } from '@shared/sources';
import type { Detected } from '@shared/types';
import { GENRES, normaliseTerm, STYLES } from '@shared/vocabulary';
import { call } from '../../api';
import { failed } from '../../notices/store';
import { licenceSummary } from '../../components/LicenceChip';
import { useLibraryId } from '../../state/library';
import { md } from '../../theme';

const OTHER = '__other';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Typography variant="titleSmall" sx={{ color: md('primary') }}>
        {title}
      </Typography>
      {children}
    </section>
  );
}

/** Free words with suggestions: what the library already uses first, then the starter list. */
function TermsField({ label, value, onChange, field, starter }: { label: string; value: string[]; onChange: (v: string[]) => void; field: 'genre' | 'style' | 'tag'; starter?: string[] }) {
  const lib = useLibraryId();
  const used = useQuery({ queryKey: ['terms', lib, field], queryFn: () => call('library:terms', field), enabled: !!lib }).data ?? [];
  const options = [...new Set([...used.map((u) => u.value), ...(starter ?? [])])];
  return (
    <Autocomplete
      multiple
      freeSolo
      options={options}
      value={value}
      filterSelectedOptions
      onChange={(_, v) => onChange([...new Set(v.map((x) => normaliseTerm(String(x))).filter(Boolean))])}
      renderValue={(v, getItemProps) => v.map((t, i) => <Chip size="small" label={t} {...getItemProps({ index: i })} key={t} />)}
      renderInput={(params) => <TextField {...params} label={label} placeholder={value.length ? '' : 'Type and press Enter'} />}
    />
  );
}

interface Draft {
  name: string;
  site: string;
  sourceName: string;
  url: string;
  creator: string;
  creatorUrl: string;
  licence: string;
  attribution: string;
  licenceNotes: string;
  genres: string[];
  styles: string[];
  tags: string[];
  version: string;
  description: string;
  notes: string;
}

const fromMeta = (m: PackMeta): Draft => ({
  name: m.name,
  site: m.source.site ?? (m.source.name ? OTHER : ''),
  sourceName: m.source.name ?? '',
  url: m.source.url ?? '',
  creator: m.source.creator ?? '',
  creatorUrl: m.source.creatorUrl ?? '',
  licence: m.licence.id ?? '',
  attribution: m.licence.attribution ?? '',
  licenceNotes: m.licence.notes,
  genres: m.genres,
  styles: m.styles,
  tags: m.tags,
  version: m.version ?? '',
  description: m.description,
  notes: m.notes,
});

const orNull = (s: string) => (s.trim() ? s.trim() : null);

function toEdit(d: Draft, m: PackMeta): PackEdit {
  return {
    name: d.name.trim(),
    source: { site: d.site && d.site !== OTHER ? d.site : null, name: d.site === OTHER ? orNull(d.sourceName) : null, url: orNull(d.url), creator: orNull(d.creator), creatorUrl: orNull(d.creatorUrl) },
    licence: { ...m.licence, id: orNull(d.licence), attribution: orNull(d.attribution), notes: d.licenceNotes.trim() },
    genres: d.genres,
    styles: d.styles,
    tags: d.tags,
    version: orNull(d.version),
    description: d.description.trim(),
    notes: d.notes.trim(),
  };
}

/** A suggested credit line for licences that ask for one. */
function suggestedCredit(d: Draft): string {
  const who = d.creator.trim() || (sourceInfo(d.site)?.creator ?? 'the author');
  const lic = licenceInfo(d.licence)?.short ?? d.licence;
  return `"${d.name.trim()}" by ${who}, licensed under ${lic}${d.url.trim() ? ` (${d.url.trim()})` : ''}`;
}

/** Edit a pack's record: where it came from, its licence and how it's organised. */
export function PackEditor({ packId, meta, open, onClose }: { packId: string; meta: PackMeta; open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [d, setD] = useState<Draft>(() => fromMeta(meta));
  const [saving, setSaving] = useState(false);
  const [nameMissing, setNameMissing] = useState(false);
  const [detected, setDetected] = useState<Detected | null>(null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    if (open) {
      setD(fromMeta(meta));
      setNameMissing(false);
      setDetected(null);
    }
  }, [open, meta]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const info = licenceInfo(d.licence);

  const detect = async () => {
    setDetecting(true);
    try {
      const found = await call('pack:detect', packId);
      setDetected(found);
      setD((x) => ({
        ...x,
        licence: x.licence || found.licence || '',
        site: x.site || found.site || '',
        url: x.url || found.url || '',
        creator: x.creator || found.creator || '',
      }));
    } catch (e) {
      failed(e, 'Couldn’t read the pack');
    } finally {
      setDetecting(false);
    }
  };

  const save = async () => {
    if (!d.name.trim()) return setNameMissing(true);
    setSaving(true);
    try {
      await call('pack:edit', packId, toEdit(d, meta));
      void client.invalidateQueries({ queryKey: ['terms'] });
      onClose();
    } catch (e) {
      failed(e, 'Couldn’t save the pack');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} slotProps={{ paper: { sx: { width: 520, maxWidth: '100vw', backgroundColor: md('surfaceContainerLow'), borderTopLeftRadius: 16, borderBottomLeftRadius: 16 } } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `${window.tessera.platform === 'darwin' ? 28 : 16}px 16px 8px 24px` }}>
        <Typography variant="titleLarge" sx={{ flex: 1, color: md('onSurface') }}>
          Edit pack
        </Typography>
        <IconButton onClick={onClose} aria-label="Close">
          <Close />
        </IconButton>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <Section title="Basics">
          <TextField
            label="Name"
            value={d.name}
            onChange={(e) => {
              set('name', e.target.value);
              setNameMissing(false);
            }}
            required
            error={nameMissing}
            helperText={nameMissing ? 'A pack needs a name.' : ' '}
          />
          <TextField label="Description" value={d.description} onChange={(e) => set('description', e.target.value)} multiline minRows={2} />
          <TextField label="Version" value={d.version} onChange={(e) => set('version', e.target.value)} sx={{ maxWidth: 200 }} />
        </Section>

        <Section title="Where it came from">
          <Button variant="outlined" startIcon={<AutoFixHighOutlined />} onClick={() => void detect()} disabled={detecting} sx={{ alignSelf: 'flex-start' }}>
            {detecting ? 'Reading the pack…' : 'Detect from the pack’s files'}
          </Button>
          {/* Always two lines tall, so the fields below stay put when a result comes in. */}
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), height: 36, overflow: 'hidden', mt: -1 }}>
            {!detected
              ? 'Reads the licence and readme files inside the pack.'
              : detected.licence || detected.site
                ? `Found ${[detected.licence && `${licenceInfo(detected.licence)?.short ?? detected.licence} in ${detected.licenceFrom}`, detected.site && `a ${sourceInfo(detected.site)?.name} pack`].filter(Boolean).join(', ')}. Empty fields were filled in; check them before saving.`
                : 'Nothing found in the pack’s files. Fill these in from where you got it.'}
          </Typography>
          <TextField select label="Source" value={d.site} onChange={(e) => set('site', e.target.value)}>
            <MenuItem value="">
              <em>Not set</em>
            </MenuItem>
            {SOURCES.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
            <MenuItem value={OTHER}>Somewhere else…</MenuItem>
          </TextField>
          {d.site === OTHER && <TextField label="Where" placeholder="A friend, a game jam, a bundle…" value={d.sourceName} onChange={(e) => set('sourceName', e.target.value)} />}
          <TextField label="Link to the pack" value={d.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
          <TextField label="Creator" value={d.creator} onChange={(e) => set('creator', e.target.value)} />
          <TextField label="Creator’s link" value={d.creatorUrl} onChange={(e) => set('creatorUrl', e.target.value)} placeholder="https://" />
        </Section>

        <Section title="Licence">
          <TextField select label="Licence" value={d.licence} onChange={(e) => set('licence', e.target.value)} helperText={licenceSummary(d.licence || null)} slotProps={{ formHelperText: { sx: { minHeight: 36 } } }}>
            <MenuItem value="">
              <em>Unknown</em>
            </MenuItem>
            <ListSubheader>Free</ListSubheader>
            {LICENCES.filter((l) => l.free).map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name}
              </MenuItem>
            ))}
            <ListSubheader>Bought or subscribed</ListSubheader>
            {LICENCES.filter((l) => !l.free).map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Credit line"
            value={d.attribution}
            onChange={(e) => set('attribution', e.target.value)}
            multiline
            helperText={info?.attribution ? 'This licence asks for credit. The line goes into your game’s credits.' : 'Optional. Goes into your game’s credits.'}
            slotProps={{
              input: {
                endAdornment: (
                  <Button size="small" onClick={() => set('attribution', suggestedCredit(d))} sx={{ flexShrink: 0, visibility: info?.attribution && !d.attribution ? 'visible' : 'hidden' }}>
                    Suggest
                  </Button>
                ),
              },
            }}
          />
          <TextField label="Licence notes" value={d.licenceNotes} onChange={(e) => set('licenceNotes', e.target.value)} multiline minRows={2} placeholder="Order number, conditions, anything worth remembering" />
        </Section>

        <Section title="Organise">
          <TermsField label="Genre" field="genre" value={d.genres} onChange={(v) => set('genres', v)} starter={GENRES} />
          <TermsField label="Style" field="style" value={d.styles} onChange={(v) => set('styles', v)} starter={STYLES} />
          <TermsField label="Tags" field="tag" value={d.tags} onChange={(v) => set('tags', v)} />
        </Section>

        <Section title="Notes">
          <TextField label="Notes" value={d.notes} onChange={(e) => set('notes', e.target.value)} multiline minRows={3} />
        </Section>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 24px 20px', borderTop: `1px solid ${md('outlineVariant')}` }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Drawer>
  );
}
