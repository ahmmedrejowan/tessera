import InfoOutlined from '@mui/icons-material/InfoOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { ENGINE_LABELS, type ProjectProbe } from '@shared/project';
import { md } from '../../theme';
import { EngineBadge } from './EngineBadge';

/** Confirm a project before linking it: what engine it is, what to call it, where assets go. */
export function LinkProjectDialog({ probe, onClose, onLink }: { probe: ProjectProbe | null; onClose: () => void; onLink: (p: ProjectProbe) => void }) {
  const [draft, setDraft] = useState<ProjectProbe | null>(probe);
  useEffect(() => setDraft(probe), [probe]);
  if (!draft) return null;
  return (
    <Dialog open={!!probe} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Link a game project</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 4 }}>
          <EngineBadge engine={draft.engine} size={48} />
          <div style={{ minWidth: 0 }}>
            <Typography variant="titleMedium" sx={{ color: md('onSurface') }}>
              {ENGINE_LABELS[draft.engine]}
              {draft.engineVersion ? ` ${draft.engineVersion}` : ''}
            </Typography>
            <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant') }} title={draft.path}>
              {draft.path}
            </Typography>
          </div>
        </div>
        <TextField label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <TextField
          label="Copy assets into"
          value={draft.target}
          onChange={(e) => setDraft({ ...draft, target: e.target.value })}
          helperText="A folder inside the project. Each pack gets its own folder in it, with its licence beside the files."
        />
        {draft.notes.map((n) => (
          <div key={n} style={{ display: 'flex', gap: 10 }}>
            <InfoOutlined sx={{ fontSize: 18, color: md('onSurfaceVariant'), mt: '2px' }} />
            <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
              {n}
            </Typography>
          </div>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!draft.name.trim() || !draft.target.trim()} onClick={() => onLink(draft)}>
          Link project
        </Button>
      </DialogActions>
    </Dialog>
  );
}
