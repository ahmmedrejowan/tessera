import FindInPageOutlined from '@mui/icons-material/FindInPageOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ProjectSummary } from '@shared/project';
import { call } from '../../api';
import { formatCount } from '../../components/labels';
import { failed, notify } from '../../notices/store';
import { md, SHAPE } from '../../theme';

type Scan = Awaited<ReturnType<typeof call<'projects:findAlreadyHere'>>>;

/**
 * Assets the game already has.
 *
 * Nobody starts with an empty project. This looks through a folder they name, matches what it
 * finds against the library by content, and shows the answer before recording anything: "I found
 * 400 of your files" is a claim somebody should get to look at first.
 */
export function AlreadyHere({ project, open, onClose }: { project: ProjectSummary | null; open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [folder, setFolder] = useState('');
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScan(null);
    setFolder(project?.target ?? '');
  }, [open, project?.id]);

  if (!project) return null;

  const look = async () => {
    setBusy(true);
    setScan(null);
    try {
      setScan(await call('projects:findAlreadyHere', project.id, folder.trim()));
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  const record = async () => {
    if (!scan?.matches.length) return;
    setBusy(true);
    try {
      const n = await call('projects:adopt', project.id, scan.matches);
      notify.success(n ? `Recorded ${formatCount(n)} asset${n === 1 ? '' : 's'}. Nothing was copied, and the credits now cover them.` : 'They were all recorded already.');
      await client.invalidateQueries();
      onClose();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Find assets already in {project.name}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          Tessera looks through a folder of the game and matches what it finds against your library, by content rather than by name. What matches is recorded where the game already keeps it: nothing is copied, nothing moves, and no path changes. Your credits file then covers it.
        </Typography>
        <TextField
          label="Folder in the game to look through"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder={project.engine === 'unity' ? 'Assets' : project.engine === 'unreal' ? 'Content' : 'assets'}
          helperText="Relative to the project. The whole of Assets works, it just takes longer."
          disabled={busy}
        />
        {busy && <LinearProgress sx={{ height: 3, borderRadius: 2 }} />}

        {scan && (
          <div style={{ padding: 14, borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
            {/* "Nothing else matched" and "I stopped looking" are different answers. */}
            {scan.stoppedEarly && (
              <Typography variant="bodySmall" component="div" sx={{ color: md('error'), mb: 1 }}>
                This stopped before it had looked everywhere: too much of the library is the same size as
                the files in this folder for matching by size to narrow it down. What is listed is real;
                there may be more.
              </Typography>
            )}
            {scan.matches.length === 0 ? (
              <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
                Nothing of your library’s is in there. Looked at {formatCount(scan.looked)} file{scan.looked === 1 ? '' : 's'}. An asset that was re-exported or edited will not match, because it is no longer the file the licence was recorded against.
              </Typography>
            ) : (
              <>
                <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
                  {formatCount(scan.matches.length)} of {formatCount(scan.looked)} files are from {scan.packs.length} pack{scan.packs.length === 1 ? '' : 's'}
                </Typography>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {scan.packs.map((p) => (
                    <Typography key={p.id} variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
                      {p.name} · {formatCount(p.files)} file{p.files === 1 ? '' : 's'}
                    </Typography>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button startIcon={<FindInPageOutlined />} onClick={() => void look()} disabled={busy || !folder.trim()}>
          {scan ? 'Look again' : 'Look'}
        </Button>
        <Button variant="contained" onClick={() => void record()} disabled={busy || !scan?.matches.length}>
          Record them
        </Button>
      </DialogActions>
    </Dialog>
  );
}
