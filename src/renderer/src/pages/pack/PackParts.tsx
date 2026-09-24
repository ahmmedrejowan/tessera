import AddRounded from '@mui/icons-material/AddRounded';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LICENCES, licenceInfo } from '@shared/licences';
import { PackLicence, type PackLicenceRule, type PackMeta } from '@shared/pack';
import type { AssetRow } from '@shared/query';
import { call } from '../../api';
import { LicenceChip } from '../../components/LicenceChip';
import { failed, notify } from '../../notices/store';
import { md, SHAPE } from '../../theme';

/** Every folder in the pack, deepest paths included, for choosing what a rule covers. */
function folders(files: AssetRow[]): string[] {
  const out = new Set<string>();
  for (const f of files) {
    const parts = f.dir.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) out.add(parts.slice(0, i).join('/'));
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

/** How many of the pack's assets a rule covers, so a wrong path shows itself. */
const covers = (files: AssetRow[], path: string) => {
  const at = path.replace(/^\/+|\/+$/g, '').toLowerCase();
  return files.filter((f) => f.role === 'main' && (`${f.dir}/${f.name}`.toLowerCase() === at || `${f.dir}/`.toLowerCase().startsWith(`${at}/`))).length;
};

function RuleDialog({ open, files, rule, onClose, onSave }: { open: boolean; files: AssetRow[]; rule: PackLicenceRule | null; onClose: () => void; onSave: (rule: PackLicenceRule) => void }) {
  const [path, setPath] = useState(rule?.path ?? '');
  const [licence, setLicence] = useState<(typeof LICENCES)[number] | null>(licenceInfo(rule?.licence.id) ?? null);
  const [credit, setCredit] = useState(rule?.licence.attribution ?? '');
  const options = useMemo(() => folders(files), [files]);
  const n = path.trim() ? covers(files, path.trim()) : 0;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        transition: {
          onEnter: () => {
            setPath(rule?.path ?? '');
            setLicence(licenceInfo(rule?.licence.id) ?? null);
            setCredit(rule?.licence.attribution ?? '');
          },
        },
      }}
    >
      <DialogTitle>{rule ? 'Edit this part' : 'A part with its own licence'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          Bundles often hold folders that came from different people. Name the folder and say what covers it; the rest of the pack keeps the pack’s own licence.
        </Typography>
        <Autocomplete
          freeSolo
          options={options}
          value={path}
          onChange={(_, v) => setPath(v ?? '')}
          onInputChange={(_, v) => setPath(v)}
          renderInput={(p) => <TextField {...p} autoFocus label="Folder or file" placeholder="Models/synty" sx={{ mt: 1 }} />}
        />
        <Autocomplete
          options={LICENCES}
          value={licence}
          onChange={(_, v) => setLicence(v)}
          getOptionLabel={(l) => l.name}
          // People type the short form as often as the full name: "CC BY 4.0" finds it too.
          filterOptions={(options, { inputValue }) => {
            const q = inputValue.trim().toLowerCase().replace(/[\s-]+/g, '');
            return q ? options.filter((l) => `${l.name} ${l.short} ${l.id}`.toLowerCase().replace(/[\s-]+/g, '').includes(q)) : options;
          }}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(p) => <TextField {...p} label="Licence" />}
        />
        <TextField label="Credit line (optional)" value={credit} onChange={(e) => setCredit(e.target.value)} />
        <Typography variant="bodySmall" sx={{ color: n ? md('onSurfaceVariant') : md('error') }}>
          {path.trim() ? (n ? `Covers ${n} asset${n === 1 ? '' : 's'} of this pack.` : 'Nothing in the pack is under that path yet.') : 'Pick a folder in the pack.'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!path.trim() || !licence}
          onClick={() => onSave({ path: path.trim(), licence: PackLicence.parse({ id: licence?.id ?? null, attribution: credit.trim() || null }) })}
        >
          {rule ? 'Save' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Parts of a pack with terms of their own. The most exact rule wins for a file, so a rule on
 * `Models` can be narrowed by one on `Models/synty`.
 */
export function PackParts({ id, meta, files }: { id: string; meta: PackMeta; files: AssetRow[] }) {
  const rules = meta.licences ?? [];
  const [editing, setEditing] = useState<{ open: boolean; rule: PackLicenceRule | null }>({ open: false, rule: null });
  // Licence files sitting inside the pack: each one suggests a rule for the folder holding it.
  const hints = useQuery({ queryKey: ['partLicences', id], queryFn: () => call('pack:partLicences', id) }).data ?? [];
  const unused = hints.filter((h) => !rules.some((r) => r.path.toLowerCase() === h.path.toLowerCase()) && h.licence !== meta.licence.id);

  const save = async (next: PackLicenceRule[]) => {
    try {
      await call('pack:edit', id, { licences: next.sort((a, b) => a.path.localeCompare(b.path)) });
    } catch (e) {
      failed(e);
    }
  };
  const put = (rule: PackLicenceRule) => {
    const was = editing.rule;
    setEditing({ open: false, rule: null });
    if (!was && rules.some((r) => r.path.toLowerCase() === rule.path.toLowerCase())) {
      notify.info('There is already a rule for that path.');
      return;
    }
    void save(was ? rules.map((r) => (r.path === was.path ? rule : r)) : [...rules, rule]);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
          Parts with their own licence
        </Typography>
        <Button size="small" startIcon={<AddRounded />} onClick={() => setEditing({ open: true, rule: null })}>
          Add a part
        </Button>
      </div>
      {rules.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map((r) => (
            <div key={r.path} className="tile" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: SHAPE.sm, background: md('surfaceContainerLow') }}>
              <FolderOutlined sx={{ fontSize: 18, color: md('onSurfaceVariant') }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography variant="bodyMedium" noWrap sx={{ color: md('onSurface') }}>
                  {r.path}
                </Typography>
                <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant') }}>
                  {covers(files, r.path)} assets{r.licence.attribution ? ` · ${r.licence.attribution}` : ''}
                </Typography>
              </div>
              <LicenceChip id={r.licence.id} />
              <Button size="small" onClick={() => setEditing({ open: true, rule: r })}>
                Edit
              </Button>
              <Tooltip title="Remove this rule">
                <IconButton aria-label="Remove this rule" size="small" onClick={() => void save(rules.filter((x) => x.path !== r.path))}>
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </div>
          ))}
        </div>
      ) : (
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          The whole pack is covered by its own licence. If a folder in it came under different terms, add it here and its assets carry that licence instead.
        </Typography>
      )}
      {unused.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {unused.map((h) => (
            <div key={h.path} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: SHAPE.sm, background: md('tertiaryContainer'), color: md('onTertiaryContainer') }}>
              <AutoAwesomeOutlined sx={{ fontSize: 18 }} />
              <Typography variant="bodyMedium" sx={{ flex: 1, minWidth: 0 }}>
                {h.from} says {licenceInfo(h.licence)?.short ?? h.licence}. Does that cover {h.path}?
              </Typography>
              <Button size="small" color="inherit" onClick={() => void save([...rules, { path: h.path, licence: PackLicence.parse({ id: h.licence }) }])}>
                Add it
              </Button>
            </div>
          ))}
        </div>
      )}
      <RuleDialog open={editing.open} files={files} rule={editing.rule} onClose={() => setEditing({ open: false, rule: null })} onSave={put} />
    </div>
  );
}
