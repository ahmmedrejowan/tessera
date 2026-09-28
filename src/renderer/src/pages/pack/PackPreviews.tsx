import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { call } from '../../api';
import { formatBytes, formatCount } from '../../components/labels';
import { failed, notify } from '../../notices/store';
import { md, SHAPE } from '../../theme';

/**
 * A pack's previews: what they cost, and what can be done about them.
 *
 * One way in rather than two buttons in the header. "Stop making previews" and "Draw its previews
 * now" are the same subject, they were the two longest labels in a column 132 pixels wide, and
 * both were being cut off mid-word. A subject with more than one action wants a place of its own,
 * where there is room to say what the actions mean.
 */
export function PackPreviews({ packId, packName, open, onClose }: { packId: string; packName: string; open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);

  const building = useQuery({
    queryKey: ['thumbs-building'],
    queryFn: () => call('thumbs:building'),
    enabled: open,
    refetchInterval: (q) => (q.state.data ? 1500 : false),
  });
  const mine = useQuery({
    queryKey: ['thumbs-pack', packId],
    queryFn: async () => (await call('thumbs:packs')).find((p) => p.packId === packId) ?? null,
    enabled: open,
    staleTime: 0,
    refetchInterval: building.data ? 2000 : false,
  });

  // Asking to draw returns at once: the job does the work. So the figures are read again when it
  // stops, or this would keep showing what was here before the drawing that was just asked for.
  useEffect(() => {
    if (open && building.data === false) void client.invalidateQueries({ queryKey: ['thumbs-pack', packId] });
  }, [open, building.data, packId]);

  const info = mine.data;
  const on = info?.on ?? true;
  /** Nothing in this pack is the kind of thing a preview is drawn for. */
  const none = !!info && info.wanted === 0;

  const run = async (fn: () => Promise<unknown>, said?: string) => {
    setBusy(true);
    try {
      await fn();
      if (said) notify.success(said);
      await client.invalidateQueries({ queryKey: ['thumbs-pack', packId] });
      await client.invalidateQueries({ queryKey: ['thumbs-cost'] });
      await client.invalidateQueries({ queryKey: ['thumbs-packs'] });
      await client.invalidateQueries({ queryKey: ['thumbs-for-pack', packId] });
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Previews for {packName}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
          The small pictures Tessera shows instead of file names. They are drawn as you browse, kept in the app’s own folder rather than in the library, and can always be made again.
        </Typography>

        <div style={{ padding: 14, borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
          <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
            {!on ? 'Off for this pack' : none ? 'Nothing here needs one' : info?.count ? `${formatBytes(info.bytes)} across ${formatCount(info.count)} picture${info.count === 1 ? '' : 's'}` : 'None drawn yet'}
          </Typography>
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.25 }}>
            {!on
              ? 'Nothing is drawn for it, and its tiles show what kind of thing each file is.'
              : none
                ? // A pack of small images shows every tile from the file itself. Saying "none
                  // drawn yet, of 804 assets" would be true and would read like a failure.
                  `Its ${formatCount(info?.assets ?? 0)} file${info?.assets === 1 ? '' : 's'} are shown straight from disk, so there is nothing to draw and nothing to clear.`
                : `${formatCount(info?.wanted ?? 0)} of its ${formatCount(info?.assets ?? 0)} asset${info?.assets === 1 ? '' : 's'} need one.`}
          </Typography>
        </div>

        {building.data && <LinearProgress sx={{ height: 3, borderRadius: 2 }} />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 2px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Typography variant="bodyLarge" sx={{ color: md('onSurface') }}>
              Draw previews for this pack
            </Typography>
            <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
              Turning it off throws away the ones it has, and draws no more.
            </Typography>
          </div>
          <Switch
            checked={on}
            disabled={busy || !info}
            onChange={(_, want) =>
              void run(
                () => call('thumbs:setForPack', packId, want),
                want ? 'Previews will be made for this pack.' : 'Previews for this pack are off, and the ones it had are gone.',
              )
            }
            slotProps={{ input: { 'aria-label': 'Draw previews for this pack' } }}
          />
        </div>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
        <Button color="error" disabled={busy || !info?.count} onClick={() => void run(() => call('thumbs:clearSome', { packs: [packId] }), 'Cleared. They are drawn again as you browse.')}>
          Clear them
        </Button>
        <div style={{ display: 'flex', gap: 8 }}>
          {building.data ? (
            <Button onClick={() => void run(() => call('thumbs:stopBuild'))}>Stop</Button>
          ) : (
            <Button disabled={busy || !on || none} onClick={() => void run(() => call('thumbs:build', [packId]), 'Drawing them. The bar at the bottom shows how it is going.')}>
              Draw them now
            </Button>
          )}
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        </div>
      </DialogActions>
    </Dialog>
  );
}
