import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { call } from '../../api';
import { formatBytes, formatCount } from '../../components/labels';
import { failed, notify } from '../../notices/store';
import { md, mdAlpha, SHAPE } from '../../theme';

/**
 * Which packs the previews belong to, and what to do about each.
 *
 * "Previews are big" is only actionable when you can see where the room went. This is the
 * folder read back pack by pack: draw the ones worth having on hand, clear the ones that are
 * not, and turn a pack off for good if it is never going to be worth drawing.
 */
export function PreviewPacks({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [find, setFind] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const building = useQuery({
    queryKey: ['thumbs-building'],
    queryFn: () => call('thumbs:building'),
    enabled: open,
    refetchInterval: (q) => (q.state.data ? 1500 : false),
  });
  // Asking to draw returns at once: the job is what does the work. So the numbers are read again
  // while it runs, and once more when it stops, or this list would still show what was here
  // before the drawing that was just asked for.
  const packs = useQuery({
    queryKey: ['thumbs-packs'],
    queryFn: () => call('thumbs:packs'),
    enabled: open,
    staleTime: 0,
    refetchInterval: building.data ? 2000 : false,
  });

  useEffect(() => {
    if (open && building.data === false) {
      void client.invalidateQueries({ queryKey: ['thumbs-packs'] });
      void client.invalidateQueries({ queryKey: ['thumbs-cost'] });
    }
  }, [open, building.data]);

  const rows = (packs.data ?? []).filter((p) => p.name.toLowerCase().includes(find.trim().toLowerCase()));
  const total = (packs.data ?? []).reduce((n, p) => n + p.bytes, 0);

  const again = async () => {
    await client.invalidateQueries({ queryKey: ['thumbs-packs'] });
    await client.invalidateQueries({ queryKey: ['thumbs-cost'] });
    await client.invalidateQueries({ queryKey: ['thumbs-building'] });
  };

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await again();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>Previews, pack by pack</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 320 }}>
        <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant') }}>
          {formatBytes(total)} in all. Drawing one costs nothing but time, and clearing one loses nothing: they are made again when you go back.
        </Typography>
        <TextField size="small" placeholder="Find a pack" value={find} onChange={(e) => setFind(e.target.value)} />
        {building.data && <LinearProgress sx={{ height: 3, borderRadius: 2 }} />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 380 }}>
          {rows.length === 0 && (
            <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), py: 3, textAlign: 'center' }}>
              {packs.isLoading ? 'Reading…' : find ? 'No pack of that name.' : 'No packs in this library yet.'}
            </Typography>
          )}
          {rows.map((p) => (
            <div
              key={p.packId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: SHAPE.md,
                background: p.on ? md('surfaceContainerLow') : mdAlpha('surfaceContainerHighest', 0.5),
                opacity: p.on ? 1 : 0.75,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography variant="bodyMedium" noWrap sx={{ color: md('onSurface') }}>
                  {p.name}
                </Typography>
                <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
                  {!p.on
                    ? 'Previews off for this pack'
                    : p.count
                      ? `${formatBytes(p.bytes)} across ${formatCount(p.count)} picture${p.count === 1 ? '' : 's'}`
                      : `None drawn yet, of ${formatCount(p.assets)} asset${p.assets === 1 ? '' : 's'}`}
                </Typography>
              </div>

              {p.on && (
                <Button size="small" disabled={!!busy || building.data} onClick={() => void run(p.packId, () => call('thumbs:build', [p.packId]).then(() => notify.success(`Drawing ${p.name}.`)))}>
                  Draw
                </Button>
              )}
              {p.count > 0 && (
                <Button size="small" color="error" disabled={busy === p.packId} onClick={() => void run(p.packId, () => call('thumbs:clearSome', { packs: [p.packId] }))}>
                  Clear
                </Button>
              )}
              {/* Off means nothing is drawn for it at all, however you got here. */}
              <Switch
                size="small"
                checked={p.on}
                disabled={busy === p.packId}
                onChange={(_, on) => void run(p.packId, () => call('thumbs:setForPack', p.packId, on))}
                slotProps={{ input: { 'aria-label': `Previews for ${p.name}` } }}
              />
            </div>
          ))}
        </div>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
        {building.data ? (
          <Button onClick={() => void call('thumbs:stopBuild').then(again)}>Stop drawing</Button>
        ) : (
          <Button onClick={() => void run('all', () => call('thumbs:build', null).then(() => notify.success('Drawing every pack.')))}>Draw them all</Button>
        )}
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
