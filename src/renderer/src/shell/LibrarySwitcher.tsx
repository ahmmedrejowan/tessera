import AddRounded from '@mui/icons-material/AddRounded';
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import CloudDoneOutlined from '@mui/icons-material/CloudDoneOutlined';
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import DriveFileRenameOutlineOutlined from '@mui/icons-material/DriveFileRenameOutlineOutlined';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import RestoreRounded from '@mui/icons-material/RestoreRounded';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SyncRounded from '@mui/icons-material/SyncRounded';
import Badge from '@mui/material/Badge';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import ButtonBase from '@mui/material/ButtonBase';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { useState, type ReactNode } from 'react';
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
import { md, mdAlpha, SHAPE } from '../theme';
import type { Role } from '../theme/m3';

/** One line on how a library is kept safe: backups and sync. */
export function libraryStatus(l: LibrarySummary): string {
  const backup = !l.backup.on ? 'Not backed up' : l.backup.failing ? 'Last backup failed' : l.backup.lastBackupAt ? `Backed up ${timeAgo(l.backup.lastBackupAt)}` : 'No backup yet';
  const sync = l.sync.on ? (l.sync.whileClosed ? ' · Syncs' : ' · Syncs while open') : '';
  return backup + sync;
}

/** Whether something about a library wants attention. */
export const needsAttention = (l: LibrarySummary) => l.backup.failing || !l.found;

/** A library's mark: its initial on a colour picked from its id, so each keeps its look. */
const TONES: [Role, Role][] = [
  ['primaryContainer', 'onPrimaryContainer'],
  ['secondaryContainer', 'onSecondaryContainer'],
  ['tertiaryContainer', 'onTertiaryContainer'],
];
export function LibraryMark({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [bg, fg] = TONES[h % TONES.length]!;
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?';
  return (
    <span aria-hidden style={{ width: size, height: size, borderRadius: size * 0.32, flexShrink: 0, display: 'grid', placeItems: 'center', background: md(bg), color: md(fg), fontSize: size * 0.46, fontWeight: 600, lineHeight: 1 }}>
      {initial}
    </span>
  );
}

/** Something about a library worth a line under its name; nothing when all is well. */
function note(l: LibrarySummary): { text: string; warn: boolean } | null {
  if (!l.found) return { text: 'Not found: moved, or its drive isn’t connected', warn: true };
  if (l.backup.failing) return { text: 'Last backup failed', warn: true };
  if (l.sync.on && l.sync.whileClosed) return { text: 'Syncing in the background', warn: false };
  return null;
}

const ROW = 48;

function Row({ children, onClick, disabled }: { children: ReactNode; onClick: (e: React.MouseEvent<HTMLElement>) => void; disabled?: boolean }) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={!!disabled}
      sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.5, px: 1.5, height: ROW, flexShrink: 0, borderRadius: `${SHAPE.md}px`, textAlign: 'left', opacity: disabled ? 0.55 : 1, '&:hover': { backgroundColor: md('surfaceContainerHighest') } }}
    >
      {children}
    </ButtonBase>
  );
}

/**
 * The open library, at the right of the top bar: its mark and name, with a dot when something
 * needs attention. The panel shows the open library (its folder, how it's kept safe, and quick
 * actions), the other libraries to switch to, and one way in to adding another.
 */
export function LibrarySwitcher() {
  const libraries = useLibraries().data ?? [];
  const jobs = useJobs();
  const go = useNav((s) => s.go);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [filter, setFilter] = useState('');
  const current = libraries.find((l) => l.open);
  if (!current) return null;
  // Libraries that can be opened first; ones that can't be found at the end.
  const others = libraries.filter((l) => !l.open).sort((a, b) => Number(b.found) - Number(a.found));
  const shown = others.filter((l) => !filter.trim() || l.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const close = () => {
    setAnchor(null);
    setAdding(false);
    setFilter('');
  };

  /** Work on the open library (adding packs, copying) would stop if it closed now. */
  const leave = async (then: () => unknown) => {
    close();
    const job = jobs.find((j) => j.state === 'running' && !j.label.startsWith('Backing up'));
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
  const status = libraryStatus(current);
  const finder = window.tessera.platform === 'darwin' ? 'Show in Finder' : window.tessera.platform === 'win32' ? 'Show in Explorer' : 'Show in folder';
  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Library"
        aria-haspopup="dialog"
        sx={{ gap: 1, pl: 0.75, pr: 0.5, height: 40, maxWidth: 240, borderRadius: `${SHAPE.full}px`, border: `1px solid ${md('outlineVariant')}`, '&:hover': { backgroundColor: md('surfaceContainerHigh') } }}
      >
        <Badge variant="dot" invisible={!warn} overlap="circular" sx={{ '& .MuiBadge-dot': { backgroundColor: md('tertiary') } }}>
          <LibraryMark id={current.id} name={current.name} />
        </Badge>
        <Typography variant="labelLarge" noWrap sx={{ color: md('onSurface') }}>
          {current.name}
        </Typography>
        <ArrowDropDown sx={{ color: md('onSurfaceVariant') }} />
      </ButtonBase>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 340, mt: 1, p: 1, borderRadius: `${SHAPE.xl}px`, backgroundColor: md('surfaceContainerHigh'), backgroundImage: 'none' } } }}
      >
        {/* The open library */}
        <div style={{ padding: 14, borderRadius: SHAPE.lg, background: md('surfaceContainerLowest') }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <LibraryMark id={current.id} name={current.name} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Typography variant="titleMedium" noWrap sx={{ color: md('onSurface') }}>
                {current.name}
              </Typography>
              <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }} title={current.path}>
                {tidyPath(current.path)}
              </Typography>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12 }}>
            <span style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px 0 8px', borderRadius: SHAPE.full, fontSize: 12, background: warn ? mdAlpha('tertiary', 0.14) : md('surfaceContainerHigh'), color: warn ? md('tertiary') : md('onSurfaceVariant'), overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {current.backup.on && !current.backup.failing ? <CloudDoneOutlined sx={{ fontSize: 15 }} /> : <CloudOffOutlined sx={{ fontSize: 15 }} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{status}</span>
            </span>
            <span style={{ flex: 1 }} />
            <Tooltip title="Library settings">
              <IconButton size="small" aria-label="Library settings" onClick={() => (close(), go({ to: 'settings' }))}>
                <SettingsOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Rename">
              <IconButton size="small" aria-label="Rename" onClick={() => (close(), setRenaming(true))}>
                <DriveFileRenameOutlineOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={finder}>
              <IconButton size="small" aria-label={finder} onClick={() => (close(), void call('fs:reveal', current.path))}>
                <FolderOpenRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        </div>

        {/* Other libraries */}
        {others.length > 0 && (
          <div style={{ padding: '12px 0 4px' }}>
            <Typography variant="labelMedium" component="div" sx={{ color: md('onSurfaceVariant'), px: 1.5, pb: 0.5 }}>
              Switch to
            </Typography>
            {others.length > 6 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, margin: '0 4px 6px', padding: '0 10px', borderRadius: SHAPE.full, background: md('surfaceContainerHighest'), color: md('onSurfaceVariant') }}>
                <SearchRounded sx={{ fontSize: 18 }} />
                <InputBase autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a library" sx={{ flex: 1, typography: 'bodyMedium' }} inputProps={{ 'aria-label': 'Find a library' }} />
              </label>
            )}
            {/* A fixed height, so filtering doesn't make the panel jump. */}
            <div style={{ height: Math.min(others.length, 6) * ROW, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {shown.map((l) => {
                const n = note(l);
                return (
                  <Row key={l.id} disabled={!l.found} onClick={() => void leave(() => call('library:open', l.path))}>
                    {l.found ? <LibraryMark id={l.id} name={l.name} /> : <span style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', background: md('surfaceContainerHighest'), color: md('onSurfaceVariant') }}><LinkOffRounded sx={{ fontSize: 16 }} /></span>}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="bodyMedium" noWrap component="div" sx={{ color: md('onSurface') }}>
                        {l.name}
                      </Typography>
                      {n && (
                        <Typography variant="bodySmall" noWrap component="div" sx={{ color: n.warn ? md('tertiary') : md('onSurfaceVariant') }}>
                          {n.text}
                        </Typography>
                      )}
                    </span>
                    {l.sync.on && l.sync.whileClosed && <SyncRounded sx={{ fontSize: 16, color: md('onSurfaceVariant') }} />}
                  </Row>
                );
              })}
              {!shown.length && (
                <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), px: 1.5, py: 1 }}>
                  No library called that.
                </Typography>
              )}
            </div>
          </div>
        )}

        {/* Adding one, and closing */}
        <div style={{ borderTop: `1px solid ${md('outlineVariant')}`, marginTop: 8, paddingTop: 8, display: 'flex', flexDirection: 'column' }}>
          <Row onClick={() => setAdding(!adding)}>
            <AddRounded sx={{ fontSize: 20, color: md('onSurfaceVariant'), mx: 0.5 }} />
            <Typography variant="bodyMedium" sx={{ flex: 1, color: md('onSurface') }}>
              Add a library
            </Typography>
            {adding ? <ExpandLessRounded sx={{ fontSize: 20, color: md('onSurfaceVariant') }} /> : <ExpandMoreRounded sx={{ fontSize: 20, color: md('onSurfaceVariant') }} />}
          </Row>
          {adding && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '2px 4px 8px' }}>
              {[
                { icon: <AddRounded />, label: 'Create new', run: () => useLibraryDialog.getState().show('create') },
                { icon: <FolderOpenRounded />, label: 'Open a folder', run: () => useLibraryDialog.getState().show('open') },
                { icon: <DevicesRounded />, label: 'From another computer', run: () => useGuides.getState().show('receive') },
                { icon: <RestoreRounded />, label: 'From a backup', run: () => useGuides.getState().show('restore') },
              ].map((a) => (
                <ButtonBase
                  key={a.label}
                  onClick={() => void leave(a.run)}
                  sx={{ flexDirection: 'column', gap: 0.75, height: 72, px: 1, borderRadius: `${SHAPE.md}px`, backgroundColor: md('surfaceContainerLowest'), color: md('onSurfaceVariant'), '&:hover': { backgroundColor: md('surfaceContainerHighest') } }}
                >
                  {a.icon}
                  <Typography variant="labelMedium" sx={{ color: md('onSurface'), textAlign: 'center', lineHeight: 1.2 }}>
                    {a.label}
                  </Typography>
                </ButtonBase>
              ))}
            </div>
          )}
          <Row onClick={() => void leave(() => call('library:close'))}>
            <LogoutRounded sx={{ fontSize: 20, color: md('onSurfaceVariant'), mx: 0.5 }} />
            <Typography variant="bodyMedium" sx={{ color: md('onSurface') }}>
              Close library
            </Typography>
          </Row>
        </div>
      </Popover>

      <RenameLibrary open={renaming} name={current.name} onClose={() => setRenaming(false)} />
    </>
  );
}
