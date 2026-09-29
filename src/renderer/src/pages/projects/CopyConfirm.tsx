import FindInPageOutlined from '@mui/icons-material/FindInPageOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { formatBytes, formatCount } from '../../components/labels';
import { useEffect, useState } from 'react';
import { useCopy, useProjects } from '../../state/projects';
import { AlreadyHere } from './AlreadyHere';
import { useUpdateSettings } from '../../state/queries';
import { md, mdAlpha, SHAPE } from '../../theme';
import { HowKept } from '../add/HowKept';

/** What to do with these assets: copy them in, or use the ones the game already has. */
type Way = 'copy' | 'already';

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
  const [way, setWay] = useState<Way>('copy');
  // Every pack starts from the same answer: a game that already has them is the exception.
  useEffect(() => {
    if (pending) setWay('copy');
  }, [pending]);
  const projects = useProjects().data ?? [];
  const update = useUpdateSettings();
  const project = projects.find((p) => p.id === pending?.projectId);
  const plan = pending?.plan;
  const warnings = plan?.warnings ?? [];
  // Files already at those paths that Tessera did not write are somebody else's work. Saying so
  // here is the whole protection: the copy still goes ahead if they want it to, but nobody finds
  // out afterwards that their own edit is gone.
  const overwriting = plan?.overwriting ?? [];

  return (
    <>
    <AlreadyHere project={project ?? null} open={finding} onClose={() => setFinding(false)} />
    <Dialog open={!!pending} onClose={cancel} maxWidth="sm" fullWidth>
      <DialogTitle>Put these into {pending?.projectName}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Two ways, side by side and the same shape, because for a game that is not new they
            are a real choice: a second copy at a new path, or the files the game already has.
            Offered here because this is the moment somebody would otherwise make that copy. */}
        <HowKept<Way>
          label=""
          value={way}
          onChange={setWay}
          choices={[
            {
              value: 'copy',
              title: `Copy into ${pending?.projectName ?? 'the game'}`,
              body: 'The files are copied into your game. Your library keeps its own copy, and nothing there changes. A licence file goes beside them, and CREDITS.md is written again.',
              icon: FolderOpenOutlined,
              adds: plan?.bytes,
              recommended: true,
              detail: plan ? (
                <>
                  {formatCount(plan.assets)} asset{plan.assets === 1 ? '' : 's'}, {formatCount(plan.files)} file{plan.files === 1 ? '' : 's'}
                  {plan.updating > 0 ? `, ${formatCount(plan.updating)} already there and being brought up to date` : ''}
                  {project ? ` · into ${project.target}/ in ${project.path}` : ''}
                </>
              ) : undefined,
            },
            {
              value: 'already',
              title: 'They are already in this game',
              body: 'Look for them where the game already keeps its assets, and record those instead. Nothing is copied, no path changes, and your credits still cover them.',
              icon: FindInPageOutlined,
              adds: 0,
            },
          ]}
        />

        {overwriting.length > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: SHAPE.lg, background: mdAlpha('errorContainer', 0.4) }}>
            <WarningAmberOutlined sx={{ fontSize: 20, color: md('error'), mt: '1px' }} />
            <div>
              <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
                {formatCount(overwriting.length)} file{overwriting.length === 1 ? '' : 's'} already there {overwriting.length === 1 ? 'was' : 'were'} not put there by Tessera, so {overwriting.length === 1 ? 'it is' : 'they are'} left exactly as {overwriting.length === 1 ? 'it is' : 'they are'}.
              </Typography>
              <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5, wordBreak: 'break-all' }}>
                {overwriting.slice(0, 6).join(', ')}
                {overwriting.length > 6 ? ` and ${formatCount(overwriting.length - 6)} more` : ''}
              </Typography>
              <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5 }}>
                The rest of the asset still comes in. Move {overwriting.length === 1 ? 'it' : 'them'} aside first if you want Tessera&rsquo;s version instead.
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
          {way === 'already' ? (
            <Button
              variant="contained"
              onClick={() => {
                cancel();
                setFinding(true);
              }}
            >
              Look for them
            </Button>
          ) : (
            <Button variant="contained" onClick={() => void confirm()}>
              {warnings.length ? 'Copy anyway' : 'Copy'}
            </Button>
          )}
        </div>
      </DialogActions>
    </Dialog>
    </>
  );
}
