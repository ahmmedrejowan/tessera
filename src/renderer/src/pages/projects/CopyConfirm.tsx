import FindInPageOutlined from '@mui/icons-material/FindInPageOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { formatBytes, formatCount } from '../../components/labels';
import { useState } from 'react';
import { useCopy, useProjects } from '../../state/projects';
import { AlreadyHere } from './AlreadyHere';
import { useUpdateSettings } from '../../state/queries';
import { md, SHAPE } from '../../theme';

/**
 * What is about to be written into a game, before it is written.
 *
 * Copying into someone's project is the one thing Tessera does outside its own folder, so it says
 * plainly how much is going and where it will land. Anything wrong with a licence is shown here
 * too, and that part is never skipped, whatever the setting says.
 */
export function CopyConfirm() {
  const { pending, confirm, cancel } = useCopy();
  const [finding, setFinding] = useState(false);
  const projects = useProjects().data ?? [];
  const update = useUpdateSettings();
  const project = projects.find((p) => p.id === pending?.projectId);
  const plan = pending?.plan;
  const warnings = plan?.warnings ?? [];

  return (
    <>
    <AlreadyHere project={project ?? null} open={finding} onClose={() => setFinding(false)} />
    <Dialog open={!!pending} onClose={cancel} maxWidth="sm" fullWidth>
      <DialogTitle>Copy into {pending?.projectName}?</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          The files are copied into your game. Your library keeps its own copy, and nothing there changes.
        </Typography>

        {/* The other answer, for a game that is not new: it may already have these files, and a
            second copy at a new path is worse than useless. Offered here because this is the
            moment somebody would otherwise make that second copy. */}
        <ButtonBase
          onClick={() => {
            cancel();
            setFinding(true);
          }}
          sx={{ display: 'block', textAlign: 'left', width: '100%', p: 1.5, borderRadius: `${SHAPE.md}px`, border: `1px solid ${md('outlineVariant')}`, '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FindInPageOutlined sx={{ fontSize: 20, color: md('onSurfaceVariant') }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
                They may already be in this game
              </Typography>
              <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
                Look for them where the game already keeps its assets and record those instead, so nothing is copied twice.
              </Typography>
            </div>
          </div>
        </ButtonBase>

        {plan && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: `${SHAPE.md}px`, background: md('surfaceContainerHigh') }}>
            <FolderOpenOutlined sx={{ fontSize: 20, color: md('onSurfaceVariant'), mt: '2px' }} />
            <div style={{ minWidth: 0 }}>
              <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
                {formatCount(plan.assets)} asset{plan.assets === 1 ? '' : 's'}, {formatCount(plan.files)} file{plan.files === 1 ? '' : 's'}, {formatBytes(plan.bytes)}
                {plan.updating > 0 ? `, ${formatCount(plan.updating)} of them already there and being brought up to date` : ''}
              </Typography>
              {project && (
                <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), mt: 0.5, wordBreak: 'break-all' }}>
                  Into {project.target}/ in {project.path}
                </Typography>
              )}
              <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), mt: 0.5 }}>
                A licence file goes beside them, and CREDITS.md is written again.
              </Typography>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
              Check these before they go into your game:
            </Typography>
            {warnings.map((w) => (
              <div key={w} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <WarningAmberOutlined sx={{ fontSize: 20, color: md('error'), mt: '1px' }} />
                <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
                  {w}
                </Typography>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
        {/* Only offered when nothing is wrong: a licence problem is always worth stopping for. */}
        {warnings.length === 0 ? (
          <FormControlLabel
            sx={{ ml: 0 }}
            control={<Checkbox size="small" onChange={(_, on) => on && update.mutate({ confirmCopyToGame: false })} />}
            label={
              <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                Don’t ask again
              </Typography>
            }
          />
        ) : (
          <span />
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={cancel}>Cancel</Button>
          <Button variant="contained" onClick={() => void confirm()}>
            {warnings.length ? 'Copy anyway' : 'Copy'}
          </Button>
        </div>
      </DialogActions>
    </Dialog>
    </>
  );
}
