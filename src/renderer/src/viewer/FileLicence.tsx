import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { assetPath } from '@shared/assets';
import { LICENCES, licenceInfo } from '@shared/licences';
import { PackLicence, type PackMeta } from '@shared/pack';
import type { AssetRow } from '@shared/query';
import { call } from '../api';
import { failed, notify } from '../notices/store';
import { md } from '../theme';

/** The folder a file sits in, which is usually what a rule should cover. */
const folderOf = (ref: string) => {
  const shown = assetPath(ref);
  const slash = shown.lastIndexOf('/');
  return slash > 0 ? shown.slice(0, slash) : shown;
};

/**
 * The licence for this one file, when it isn't the pack's. It is written as a rule on the pack:
 * either for this file alone, or for the folder it sits in, which is how bundles usually differ.
 */
export function FileLicence({ open, asset, meta, onClose }: { open: boolean; asset: AssetRow; meta: PackMeta; onClose: () => void }) {
  const [licence, setLicence] = useState<(typeof LICENCES)[number] | null>(licenceInfo(asset.licence) ?? null);
  const [credit, setCredit] = useState('');
  const [covers, setCovers] = useState<'file' | 'folder'>('folder');
  const path = covers === 'file' ? assetPath(asset.ref) : folderOf(asset.ref);

  const save = async () => {
    try {
      const rules = (meta.licences ?? []).filter((r) => r.path.toLowerCase() !== path.toLowerCase());
      await call('pack:edit', asset.packId, {
        licences: [...rules, { path, licence: PackLicence.parse({ id: licence?.id ?? null, attribution: credit.trim() || null }) }].sort((a, b) => a.path.localeCompare(b.path)),
      });
      notify.success(`${path} is ${licenceInfo(licence?.id)?.short ?? 'recorded'} from now on.`);
      onClose();
    } catch (e) {
      failed(e);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        transition: {
          onEnter: () => {
            setLicence(licenceInfo(asset.licence) ?? null);
            setCredit('');
            setCovers('folder');
          },
        },
      }}
    >
      <DialogTitle>The licence for this file</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          A pack can hold parts that came under different terms. This is written as a rule on the pack, so anything else in the same place is covered too.
        </Typography>
        <Autocomplete
          options={LICENCES}
          value={licence}
          onChange={(_, v) => setLicence(v)}
          getOptionLabel={(l) => l.name}
          filterOptions={(options, { inputValue }) => {
            const q = inputValue.trim().toLowerCase().replace(/[\s-]+/g, '');
            return q ? options.filter((l) => `${l.name} ${l.short} ${l.id}`.toLowerCase().replace(/[\s-]+/g, '').includes(q)) : options;
          }}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(p) => <TextField {...p} autoFocus label="Licence" sx={{ mt: 1 }} />}
        />
        <TextField label="Credit line (optional)" value={credit} onChange={(e) => setCredit(e.target.value)} />
        <div>
          <Typography variant="labelLarge" sx={{ color: md('onSurfaceVariant') }}>
            What it covers
          </Typography>
          <RadioGroup value={covers} onChange={(e) => setCovers(e.target.value as 'file' | 'folder')}>
            <FormControlLabel value="folder" control={<Radio size="small" />} label={`Everything in ${folderOf(asset.ref)}`} />
            <FormControlLabel value="file" control={<Radio size="small" />} label="This file alone" />
          </RadioGroup>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!licence} onClick={() => void save()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
