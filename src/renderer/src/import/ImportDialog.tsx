import FolderOutlined from '@mui/icons-material/FolderOutlined';
import FolderZipOutlined from '@mui/icons-material/FolderZipOutlined';
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import { formatBytes, formatCount } from '../components/labels';
import { useImport } from '../state/importer';
import { useLibraryRecord } from '../state/library';
import { md, SHAPE } from '../theme';

const ICON = { archive: FolderZipOutlined, folder: FolderOutlined, files: InsertDriveFileOutlined };

/** Confirm what's about to be added: one row per pack, names editable, likely duplicates left out. */
export function ImportDialog() {
  const { items, chosen, toggle, rename, cancel, run } = useImport();
  const skipInbox = useLibraryRecord()?.skipInboxWhenSure ?? true;
  const picked = (items ?? []).filter((i) => chosen.has(i.id));
  const size = picked.reduce((n, i) => n + i.size, 0);
  return (
    <Dialog open={!!items} onClose={cancel} maxWidth="md" fullWidth>
      <DialogTitle>
        Add {items?.length === 1 ? 'a pack' : `${items?.length ?? 0} packs`}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          Each is copied into your library exactly as it is; your originals stay where they are.{' '}
          {skipInbox
            ? 'Packs whose download states its licence go straight into the library; the rest wait in the Inbox for you to check.'
            : 'They’ll wait in the Inbox until you’ve checked their licence and source.'}
        </Typography>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '50vh', overflowY: 'auto', marginTop: 8 }}>
          {items?.map((item) => {
            const Icon = ICON[item.kind];
            const on = chosen.has(item.id);
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 8px', borderRadius: SHAPE.sm, background: on ? md('surfaceContainerHighest') : 'transparent', opacity: on ? 1 : 0.7 }}>
                <Checkbox checked={on} onChange={() => toggle(item.id)} slotProps={{ input: { 'aria-label': `Add ${item.name}` } }} />
                <Icon sx={{ color: md('onSurfaceVariant') }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <InputBase value={item.name} onChange={(e) => rename(item.id, e.target.value)} fullWidth inputProps={{ 'aria-label': 'Pack name' }} sx={{ typography: 'titleSmall', color: md('onSurface') }} />
                  <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant') }} title={item.sources.join('\n')}>
                    {item.kind === 'files' ? `${formatCount(item.files)} files` : item.sources[0]!.split(/[\\/]/).pop()} · {formatBytes(item.size)}
                  </Typography>
                  {item.duplicateOf && (
                    <Typography variant="bodySmall" sx={{ color: md('error'), display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <WarningAmberOutlined sx={{ fontSize: 14 }} /> Looks like “{item.duplicateOf}”, already in your library.
                    </Typography>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), mr: 'auto' }}>
          {picked.length} of {items?.length ?? 0} · {formatBytes(size)}
        </Typography>
        <Button onClick={cancel}>Cancel</Button>
        <Button variant="contained" disabled={!picked.length} onClick={() => void run()}>
          Add {picked.length === 1 ? 'pack' : `${picked.length} packs`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
