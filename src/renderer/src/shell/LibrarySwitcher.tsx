import AddRounded from '@mui/icons-material/AddRounded';
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import CloudDoneOutlined from '@mui/icons-material/CloudDoneOutlined';
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import DriveFileRenameOutlineOutlined from '@mui/icons-material/DriveFileRenameOutlineOutlined';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import RestoreRounded from '@mui/icons-material/RestoreRounded';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SyncRounded from '@mui/icons-material/SyncRounded';
import Badge from '@mui/material/Badge';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { LibrarySummary } from '@shared/types';
import { call } from '../api';
import { timeAgo } from '../components/labels';
import { ask } from '../notices/dialogs';
import { failed } from '../notices/store';
import { useGuides } from '../pages/library/guides';
import { useLibraryDialog } from '../pages/library/LibraryDialog';
import { tidyPath } from '../pages/library/Location';
import { RenameLibrary } from '../pages/library/RenameLibrary';
import { useJobs, useLibraries } from '../state/library';
import { useNav } from '../state/nav';
import { md, SHAPE } from '../theme';

/** One line on how a library is kept safe: backups and sync. */
export function libraryStatus(l: LibrarySummary): string {
  const backup = !l.backup.on ? 'Not backed up' : l.backup.failing ? 'Last backup failed' : l.backup.lastBackupAt ? `Backed up ${timeAgo(l.backup.lastBackupAt)}` : 'No backup yet';
  const sync = l.sync.on ? (l.sync.whileClosed ? ' · Syncs' : ' · Syncs while open') : '';
  return backup + sync;
}

/** Whether something about a library wants attention. */
export const needsAttention = (l: LibrarySummary) => l.backup.failing || !l.found;

/**
 * The open library, at the right of the top bar: its name, and a dot when something needs
 * attention. The menu switches to another library, makes or brings one in, and gets to this
 * library's settings and folder.
 */
export function LibrarySwitcher() {
  const libraries = useLibraries().data ?? [];
  const jobs = useJobs();
  const go = useNav((s) => s.go);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState(false);
  const current = libraries.find((l) => l.open);
  const others = libraries.filter((l) => !l.open);
  if (!current) return null;
  const close = () => setAnchor(null);

  /** Work on the open library (adding packs, copying) would stop if it closed now. */
  const busyWith = () => jobs.find((j) => j.state === 'running' && !j.label.startsWith('Backing up'));
  const leave = async (then: () => unknown) => {
    close();
    const job = busyWith();
    if (job) {
      await ask({ tone: 'warning', title: `“${job.label}” is still running`, body: 'Switching libraries now would stop it. Wait for it to finish, then switch.', actions: [{ label: 'OK', value: true, kind: 'primary' }] });
      return;
    }
    try {
      await then();
    } catch (e) {
      failed(e);
    }
  };

  const warn = needsAttention(current);
  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Library"
        sx={{ gap: 1, pl: 0.75, pr: 0.5, height: 40, maxWidth: 260, borderRadius: `${SHAPE.full}px`, border: `1px solid ${md('outlineVariant')}`, '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
      >
        <Badge variant="dot" invisible={!warn} overlap="circular" sx={{ '& .MuiBadge-dot': { backgroundColor: md('tertiary') } }}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', background: md('secondaryContainer'), color: md('onSecondaryContainer') }}>
            <AutoStoriesOutlined sx={{ fontSize: 16 }} />
          </span>
        </Badge>
        <div style={{ textAlign: 'left', lineHeight: 1, minWidth: 0 }}>
          <Typography variant="labelSmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
            Library
          </Typography>
          <Typography variant="labelLarge" component="div" noWrap sx={{ color: md('onSurface') }}>
            {current.name}
          </Typography>
        </div>
        <ArrowDropDown sx={{ color: md('onSurfaceVariant') }} />
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 340, borderRadius: `${SHAPE.lg}px` } } }}
      >
        <div style={{ padding: '8px 16px 12px' }}>
          <Typography variant="titleMedium" noWrap sx={{ color: md('onSurface') }}>
            {current.name}
          </Typography>
          <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }} title={current.path}>
            {tidyPath(current.path)}
          </Typography>
          <Typography variant="bodySmall" component="div" sx={{ color: warn ? md('tertiary') : md('onSurfaceVariant'), display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            {current.backup.failing ? <ErrorOutlineRounded sx={{ fontSize: 15 }} /> : current.backup.on ? <CloudDoneOutlined sx={{ fontSize: 15 }} /> : <CloudOffOutlined sx={{ fontSize: 15 }} />}
            {libraryStatus(current)}
          </Typography>
        </div>
        <MenuItem onClick={() => (close(), go({ to: 'settings' }))}>
          <ListItemIcon><SettingsOutlined fontSize="small" /></ListItemIcon>
          <ListItemText primary="Library settings" />
        </MenuItem>
        <MenuItem onClick={() => (close(), setRenaming(true))}>
          <ListItemIcon><DriveFileRenameOutlineOutlined fontSize="small" /></ListItemIcon>
          <ListItemText primary="Rename…" />
        </MenuItem>
        <MenuItem onClick={() => (close(), void call('fs:reveal', current.path))}>
          <ListItemIcon><FolderOpenRounded fontSize="small" /></ListItemIcon>
          <ListItemText primary={window.tessera.platform === 'darwin' ? 'Show in Finder' : window.tessera.platform === 'win32' ? 'Show in Explorer' : 'Show in folder'} />
        </MenuItem>
        {others.length > 0 && <Divider />}
        {others.length > 0 && (
          <Typography variant="labelMedium" component="div" sx={{ color: md('onSurfaceVariant'), px: 2, pt: 0.5, pb: 0.5 }}>
            Switch to
          </Typography>
        )}
        {others.slice(0, 8).map((l) => (
          <MenuItem key={l.id} disabled={!l.found} onClick={() => void leave(() => call('library:open', l.path))}>
            <ListItemIcon>{l.found ? <AutoStoriesOutlined fontSize="small" /> : <LinkOffRounded fontSize="small" />}</ListItemIcon>
            <ListItemText
              primary={l.name}
              secondary={l.found ? libraryStatus(l) : 'Not found — moved, or on a drive that isn’t connected'}
              slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true, sx: needsAttention(l) && l.found ? { color: md('tertiary') } : {} } }}
            />
            {l.sync.on && l.sync.whileClosed && <SyncRounded fontSize="small" sx={{ color: md('onSurfaceVariant'), ml: 1 }} titleAccess="Syncing in the background" />}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => void leave(() => useLibraryDialog.getState().show('create'))}>
          <ListItemIcon><AddRounded fontSize="small" /></ListItemIcon>
          <ListItemText primary="Create a library…" />
        </MenuItem>
        <MenuItem onClick={() => void leave(() => useLibraryDialog.getState().show('open'))}>
          <ListItemIcon><FolderOpenRounded fontSize="small" /></ListItemIcon>
          <ListItemText primary="Open a library…" />
        </MenuItem>
        <MenuItem onClick={() => void leave(() => useGuides.getState().show('receive'))}>
          <ListItemIcon><DevicesRounded fontSize="small" /></ListItemIcon>
          <ListItemText primary="From another computer…" />
        </MenuItem>
        <MenuItem onClick={() => void leave(() => useGuides.getState().show('restore'))}>
          <ListItemIcon><RestoreRounded fontSize="small" /></ListItemIcon>
          <ListItemText primary="From a backup…" />
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => void leave(() => call('library:close'))}>
          <ListItemIcon><LogoutRounded fontSize="small" /></ListItemIcon>
          <ListItemText primary="Close library" />
        </MenuItem>
      </Menu>
      <RenameLibrary open={renaming} name={current.name} onClose={() => setRenaming(false)} />
    </>
  );
}
