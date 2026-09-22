import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import { call } from '../../api';
import { notify } from '../../notices/store';

/** Give the open library a new name. Its folder keeps its own. */
export function RenameLibrary({ open, name, onClose }: { open: boolean; name: string; onClose: () => void }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setValue(name);
      setError(null);
    }
  }, [open, name]);
  const clean = value.trim();
  const save = async () => {
    setBusy(true);
    try {
      await call('library:rename', clean);
      notify.success(`Renamed to “${clean}”.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Rename the library</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label="Name"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && clean && clean !== name && void save()}
          error={!!error}
          helperText={error ?? 'Its folder keeps its own name.'}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!clean || clean === name || busy} onClick={() => void save()}>
          Rename
        </Button>
      </DialogActions>
    </Dialog>
  );
}
