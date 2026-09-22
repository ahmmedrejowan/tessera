import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useCopy } from '../../state/projects';
import { md } from '../../theme';

/** Before a copy that deserves a second look: what's wrong, and a choice to go ahead anyway. */
export function CopyConfirm() {
  const { pending, confirm, cancel } = useCopy();
  return (
    <Dialog open={!!pending} onClose={cancel} maxWidth="sm" fullWidth>
      <DialogTitle>Copy to {pending?.projectName}?</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          Check these before they go into your game:
        </Typography>
        {pending?.plan.warnings.map((w) => (
          <div key={w} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <WarningAmberOutlined sx={{ fontSize: 20, color: md('error'), mt: '1px' }} />
            <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
              {w}
            </Typography>
          </div>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel}>Cancel</Button>
        <Button variant="contained" onClick={() => void confirm()}>
          Copy anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
}
