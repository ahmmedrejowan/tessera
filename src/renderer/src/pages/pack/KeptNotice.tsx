import FolderOffOutlined from '@mui/icons-material/FolderOffOutlined';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { PackRow } from '@shared/query';
import { call } from '../../api';
import { failed, notify } from '../../notices/store';
import { md, mdAlpha, SHAPE } from '../../theme';

/**
 * A pack whose files were never brought into the library.
 *
 * Said on the pack itself rather than only where it was chosen, because the consequence turns up
 * much later: the day a drive is not plugged in, or the day somebody restores a backup and finds
 * the record without the files. Both ways out are here, next to the bad news.
 */
export function KeptNotice({ pack }: { pack: PackRow }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!pack.keptWhere) return null;
  const away = pack.away;

  const again = async () => {
    const path = await call('dialog:folder', `Where is ${pack.name} now?`, { message: 'Pick the folder this pack’s files are in.' }).catch(() => null);
    if (!path) return;
    setBusy(true);
    try {
      const { matched, of } = await call('pack:findAgain', pack.id, path);
      notify.success(`Found it: ${matched} of ${of} files are there.`);
      await client.invalidateQueries();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  const takeIn = async () => {
    setBusy(true);
    try {
      await call('pack:takeIn', pack.id);
      notify.success(`${pack.name} is in the library now. The folder it came from is untouched.`);
      await client.invalidateQueries();
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: 14,
        borderRadius: SHAPE.lg,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        background: away ? mdAlpha('errorContainer', 0.55) : md('surfaceContainerHigh'),
      }}
    >
      {away ? <FolderOffOutlined sx={{ color: md('error'), mt: '2px' }} /> : <LinkOutlined sx={{ color: md('onSurfaceVariant'), mt: '2px' }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
          {away ? 'Its folder is not there' : 'Indexed where it lies'}
        </Typography>
        <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.25, wordBreak: 'break-all' }}>
          {away
            ? `Tessera reads this pack from ${pack.keptWhere}, and cannot get to it. Its files are still listed here, and nothing has been lost: connect the drive, or find the folder again.`
            : `Tessera reads this pack from ${pack.keptWhere} and never writes there. Its record, license and tags are in the library and are backed up; the files are not, because they are not in the library.`}
        </Typography>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <Button size="small" variant={away ? 'contained' : 'outlined'} disabled={busy} onClick={() => void again()}>
            Find it again
          </Button>
          <Button size="small" disabled={busy || away} onClick={() => void takeIn()}>
            Take it into the library
          </Button>
        </div>
      </div>
    </div>
  );
}
