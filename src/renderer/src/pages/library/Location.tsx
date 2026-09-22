import CloudOutlined from '@mui/icons-material/CloudOutlined';
import CreateNewFolderOutlined from '@mui/icons-material/CreateNewFolderOutlined';
import FolderRounded from '@mui/icons-material/FolderRounded';
import StorageRounded from '@mui/icons-material/StorageRounded';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type { FolderInfo } from '@shared/types';
import { baseName, folderPathProblem, joinPath, pathParts } from '@shared/folders';
import { call } from '../../api';
import { formatBytes } from '../../components/labels';
import { StatusSlot, type SlotMessage } from '../../components/StatusSlot';
import { md, SHAPE } from '../../theme';
import type { Role } from '../../theme/m3';

/** "/Users/sam/Documents/Assets" → "~/Documents/Assets", where the home folder is recognisable. */
export const tidyPath = (p: string) => p.replace(/^\/(Users|home)\/[^/]+/, '~').replace(/^[A-Z]:\\Users\\[^\\]+/i, '~');

const LOW_SPACE = 5 * 1024 ** 3;

export function usePlaces() {
  return useQuery({ queryKey: ['places'], queryFn: () => call('fs:places'), staleTime: Infinity }).data;
}

export function useFolder(path: string | null) {
  return useQuery({ queryKey: ['folder', path], queryFn: () => call('fs:describe', path!), enabled: !!path, staleTime: 0, placeholderData: (prev) => prev });
}

export interface LocationState {
  parent: string | null;
  setParent(p: string): void;
  /** Use the chosen folder itself instead of making a new one inside it. */
  itself: boolean;
  setItself(v: boolean): void;
  name: string;
  setName(n: string): void;
  /** Where the library will be, and what it will be called. */
  target: string | null;
  libraryName: string;
  parentInfo: FolderInfo | undefined;
  targetInfo: FolderInfo | undefined;
  /** It can't go ahead; `message` says why. */
  blocked: boolean;
  /** The one thing worth saying about this choice, most important first. */
  message: SlotMessage | null;
}

/** The choice of where a library goes: a folder, and either a new folder inside it or the folder itself. */
export function useLocation(initialName: string, initialParent?: string | null, onOpenExisting?: (path: string) => void): LocationState {
  const places = usePlaces();
  const [parent, setParentState] = useState<string | null>(initialParent ?? null);
  const [itself, setItself] = useState(false);
  const [name, setName] = useState(initialName);
  useEffect(() => {
    if (!parent && places) setParentState(places.documents);
  }, [parent, places]);
  const p = useFolder(parent).data;
  // "Art/Game Library" makes Art, then Game Library in it.
  const parts = pathParts(name);
  const nameProblem = folderPathProblem(name);
  const target = parent && places ? (itself ? parent : joinPath(parent, parts.join(places.separator), places.separator)) : null;
  const t = useFolder(itself || nameProblem ? null : target).data;
  // With folders inside folders, the first one may already be a library.
  const first = useFolder(!itself && !nameProblem && parts.length > 1 && parent && places ? joinPath(parent, parts[0]!, places.separator) : null).data;
  // An empty folder can be used as it is; one with files can't.
  const canUseItself = !!p && (p.kind === 'empty' || p.kind === 'missing');
  useEffect(() => {
    if (itself && p && !canUseItself) setItself(false);
  }, [itself, p, canUseItself]);

  const open = (path: string) =>
    onOpenExisting && (
      <Button size="small" color="inherit" onClick={() => onOpenExisting(path)}>
        Open it
      </Button>
    );
  let message: SlotMessage | null = null;
  let blocked = true;
  if (!p || !target) message = null;
  else if (!p.writable) message = { tone: 'error', text: 'Tessera can’t write in this folder.' };
  else if (p.kind === 'library') message = { tone: 'error', text: `“${p.library?.name ?? p.name}” is a library. Choose a folder outside it.`, action: open(parent!) };
  else if (!itself && nameProblem) message = { tone: 'error', text: nameProblem };
  else if (!itself && parts.length > 1 && first?.kind === 'library') message = { tone: 'error', text: `“${first.library?.name ?? first.name}” is a library. A new one can’t go inside it.`, action: open(first.path) };
  else if (!itself && t?.kind === 'library') message = { tone: 'error', text: `A library called “${t.library?.name ?? t.name}” is already here.`, action: open(target) };
  else if (!itself && t?.kind === 'other') message = { tone: 'error', text: `“${t.name}” already exists here and isn’t empty.` };
  else {
    blocked = false;
    if (p.cloud) message = { tone: 'warning', text: `This is in ${p.cloud}. A folder on this computer or an external drive is safer.` };
    else if (p.free !== null && p.free < LOW_SPACE) message = { tone: 'warning', text: `Only ${formatBytes(p.free)} free on this drive.` };
    else if (!itself && t?.kind === 'empty') message = { tone: 'info', text: `An empty “${t.name}” is already here; it will be used.` };
  }
  const setParent = (next: string) => {
    setParentState(next);
    setItself(false);
  };
  const libraryName = (itself ? (p?.name ?? '') : (parts.at(-1) ?? '')).trim() || (target ? baseName(target) : '');
  return { parent, setParent, itself, setItself, name, setName, target, libraryName, parentInfo: p, targetInfo: itself ? p : t, blocked, message };
}

function Chip({ icon: Icon, children, tone = 'surfaceContainerHighest' }: { icon: typeof FolderRounded; children: ReactNode; tone?: Role }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 10px 0 8px', height: 22, borderRadius: SHAPE.full, background: md(tone), color: md('onSurfaceVariant'), fontSize: 12 }}>
      <Icon sx={{ fontSize: 14 }} />
      {children}
    </span>
  );
}

/** The chosen folder as a card of fixed height, with a way to change it. */
export function FolderCard({ info, path, onChange, placeholder = 'No folder chosen' }: { info: FolderInfo | undefined; path: string | null; onChange: () => void; placeholder?: string }) {
  return (
    <div style={{ height: 84, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 14, padding: '0 14px', borderRadius: SHAPE.lg, background: md('surfaceContainerLow'), border: `1px solid ${md('outlineVariant')}` }}>
      <span style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: md('secondaryContainer'), color: md('onSecondaryContainer'), flexShrink: 0 }}>
        <FolderRounded />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleMedium" noWrap component="div" sx={{ color: path ? md('onSurface') : md('onSurfaceVariant') }} title={path ?? ''}>
          {path ? baseName(path) : placeholder}
        </Typography>
        <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant'), height: 18 }}>
          {path ? tidyPath(path) : ''}
        </Typography>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, height: 22, overflow: 'hidden' }}>
          {info?.free !== null && info?.free !== undefined && <Chip icon={StorageRounded}>{formatBytes(info.free)} free</Chip>}
          {info?.cloud && (
            <Chip icon={CloudOutlined} tone="tertiaryContainer">
              {info.cloud}
            </Chip>
          )}
          {info && info.kind !== 'missing' && <Chip icon={FolderRounded}>{info.entries ? `${info.entries} item${info.entries === 1 ? '' : 's'}` : 'Empty'}</Chip>}
        </div>
      </div>
      <Button variant="outlined" onClick={onChange} sx={{ flexShrink: 0 }}>
        {path ? 'Change…' : 'Choose…'}
      </Button>
    </div>
  );
}

export function SectionLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', background: md('primary'), color: md('onPrimary'), fontSize: 12, fontWeight: 600 }}>{n}</span>
      <Typography variant="titleSmall" sx={{ color: md('onSurface') }}>
        {children}
      </Typography>
    </div>
  );
}

/**
 * Where a library goes: a folder (Documents to start with), then a new folder in it or, when the
 * chosen one is empty, that folder itself. Every part keeps its size whatever is chosen, and
 * anything worth saying goes in the one message slot at the bottom (or the caller's, with
 * `slot={false}`).
 */
export function LocationFields({ loc, pickerTitle, slot = true }: { loc: LocationState; pickerTitle: string; slot?: boolean }) {
  const choose = async () => {
    const picked = await call('dialog:folder', pickerTitle, { message: pickerTitle, buttonLabel: 'Choose', ...(loc.parent ? { defaultPath: loc.parent } : {}) });
    if (picked) loc.setParent(picked);
  };
  const p = loc.parentInfo;
  const canUseItself = !!p && (p.kind === 'empty' || p.kind === 'missing');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <SectionLabel n={1}>Choose a place</SectionLabel>
        <FolderCard info={p} path={loc.parent} onChange={() => void choose()} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44, padding: '0 4px', marginTop: 6, cursor: canUseItself ? 'pointer' : 'default' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Typography variant="bodyMedium" noWrap sx={{ color: canUseItself ? md('onSurface') : md('onSurfaceVariant') }}>
              Use this folder as it is
            </Typography>
            <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }}>
              {canUseItself ? 'It’s empty, so the library can go straight in.' : 'Only for an empty folder.'}
            </Typography>
          </div>
          <Switch checked={loc.itself} disabled={!canUseItself} onChange={(_, v) => loc.setItself(v)} slotProps={{ input: { 'aria-label': 'Use this folder as it is' } }} />
        </label>
      </div>

      <div>
        <SectionLabel n={2}>Name the new folder</SectionLabel>
        <TextField
          fullWidth
          value={loc.itself ? (p?.name ?? '') : loc.name}
          disabled={loc.itself}
          onChange={(e) => loc.setName(e.target.value)}
          slotProps={{ input: { startAdornment: <CreateNewFolderOutlined sx={{ color: md('onSurfaceVariant'), mr: 1 }} /> } }}
        />
        <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant'), mt: 1, px: 0.5, height: 18, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }} title={loc.target ?? ''}>
          {loc.target ? tidyPath(loc.target) : ''}
        </Typography>
      </div>

      {slot && <StatusSlot message={loc.message} />}
    </div>
  );
}
