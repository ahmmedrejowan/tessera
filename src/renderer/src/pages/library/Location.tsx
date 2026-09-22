import CloudOutlined from '@mui/icons-material/CloudOutlined';
import CreateNewFolderOutlined from '@mui/icons-material/CreateNewFolderOutlined';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import StorageRounded from '@mui/icons-material/StorageRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type { FolderInfo } from '@shared/types';
import { baseName, folderNameProblem, joinPath } from '@shared/folders';
import { call } from '../../api';
import { formatBytes } from '../../components/labels';
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
  /** Where the library will be. */
  target: string | null;
  parentInfo: FolderInfo | undefined;
  targetInfo: FolderInfo | undefined;
  /** Why it can't go ahead, or null. */
  blocker: string | null;
}

/** The choice of where a library goes: a folder, and either a new folder inside it or the folder itself. */
export function useLocation(initialName: string, initialParent?: string | null): LocationState {
  const places = usePlaces();
  const [parent, setParentState] = useState<string | null>(initialParent ?? null);
  const [itself, setItself] = useState(false);
  const [name, setName] = useState(initialName);
  useEffect(() => {
    if (!parent && places) setParentState(places.documents);
  }, [parent, places]);
  const parentInfo = useFolder(parent).data;
  const target = parent && places ? (itself ? parent : joinPath(parent, name.trim(), places.separator)) : null;
  const targetInfo = useFolder(itself ? null : name.trim() && !folderNameProblem(name) ? target : null).data;
  // An empty folder can be used as it is; one with files can't.
  const canUseItself = !!parentInfo && (parentInfo.kind === 'empty' || parentInfo.kind === 'missing');
  useEffect(() => {
    if (itself && parentInfo && !canUseItself) setItself(false);
  }, [itself, parentInfo, canUseItself]);

  const setParent = (p: string) => {
    setParentState(p);
    setItself(false);
  };
  let blocker: string | null = null;
  if (!parentInfo || !target) blocker = 'Choose a folder.';
  else if (!parentInfo.writable) blocker = 'Tessera can’t write there.';
  else if (parentInfo.kind === 'library') blocker = 'A library can’t go inside another.';
  else if (!itself && folderNameProblem(name)) blocker = folderNameProblem(name);
  else if (!itself && targetInfo && (targetInfo.kind === 'other' || targetInfo.kind === 'library')) blocker = 'That folder is already there.';
  else if (itself && !canUseItself) blocker = 'That folder isn’t empty.';
  return { parent, setParent, itself, setItself, name, setName, target, parentInfo, targetInfo: itself ? parentInfo : targetInfo, blocker };
}

export function Note({ tone, children, action }: { tone: 'error' | 'warning' | 'info' | 'success'; children: ReactNode; action?: ReactNode }) {
  const look: Record<string, { bg: Role; fg: Role; icon: typeof InfoOutlined }> = {
    error: { bg: 'errorContainer', fg: 'onErrorContainer', icon: ErrorOutlineRounded },
    warning: { bg: 'tertiaryContainer', fg: 'onTertiaryContainer', icon: WarningAmberRounded },
    info: { bg: 'surfaceContainerHigh', fg: 'onSurfaceVariant', icon: InfoOutlined },
    success: { bg: 'secondaryContainer', fg: 'onSecondaryContainer', icon: InfoOutlined },
  };
  const { bg, fg, icon: Icon } = look[tone]!;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 14px', borderRadius: SHAPE.md, background: md(bg), color: md(fg) }}>
      <Icon sx={{ fontSize: 20, flexShrink: 0 }} />
      <Typography variant="bodySmall" component="div" sx={{ flex: 1, fontSize: 13 }}>
        {children}
      </Typography>
      {action}
    </div>
  );
}

function Chip({ icon: Icon, children, tone = 'surfaceContainerHighest' }: { icon: typeof InfoOutlined; children: ReactNode; tone?: Role }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px 2px 8px', borderRadius: SHAPE.full, background: md(tone), color: md('onSurfaceVariant'), fontSize: 12, lineHeight: '20px' }}>
      <Icon sx={{ fontSize: 14 }} />
      {children}
    </span>
  );
}

/** The chosen folder as a card, with a way to change it. */
export function FolderCard({ info, path, onChange, empty }: { info: FolderInfo | undefined; path: string | null; onChange: () => void; empty?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: SHAPE.lg, background: md('surfaceContainerLow'), border: `1px solid ${md('outlineVariant')}` }}>
      <span style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: md('secondaryContainer'), color: md('onSecondaryContainer'), flexShrink: 0 }}>
        <FolderRounded />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography variant="titleMedium" noWrap sx={{ color: md('onSurface') }}>
          {path ? baseName(path) : (empty ?? 'No folder chosen')}
        </Typography>
        {path && (
          <Typography variant="bodySmall" noWrap component="div" sx={{ color: md('onSurfaceVariant') }} title={path}>
            {tidyPath(path)}
          </Typography>
        )}
        {info && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {info.free !== null && <Chip icon={StorageRounded}>{formatBytes(info.free)} free</Chip>}
            {info.cloud && (
              <Chip icon={CloudOutlined} tone="tertiaryContainer">
                {info.cloud}
              </Chip>
            )}
            {info.kind !== 'missing' && <Chip icon={FolderRounded}>{info.entries ? `${info.entries} item${info.entries === 1 ? '' : 's'}` : 'Empty'}</Chip>}
          </div>
        )}
      </div>
      <Button variant="outlined" onClick={onChange} sx={{ flexShrink: 0 }}>
        {path ? 'Change…' : 'Choose…'}
      </Button>
    </div>
  );
}

function SectionLabel({ n, children }: { n: number; children: ReactNode }) {
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
 * Choose where a library goes: a folder (Documents to start with), then a new folder inside it
 * with a name, or, when the chosen folder is empty, that folder itself. Everything the choice
 * implies is said right here: the full path, free space, cloud folders, clashes.
 */
export function LocationFields({ loc, what, pickerTitle, onOpenExisting }: { loc: LocationState; what: string; pickerTitle: string; onOpenExisting?: (path: string) => void }) {
  const choose = async () => {
    const picked = await call('dialog:folder', pickerTitle, { message: pickerTitle, buttonLabel: 'Choose', ...(loc.parent ? { defaultPath: loc.parent } : {}) });
    if (picked) loc.setParent(picked);
  };
  const p = loc.parentInfo;
  const t = loc.targetInfo;
  const canUseItself = !!p && (p.kind === 'empty' || p.kind === 'missing');
  const nameProblem = !loc.itself && loc.name ? folderNameProblem(loc.name) : null;
  const parentIsLibrary = p?.kind === 'library' && p.library;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <SectionLabel n={1}>Choose a place</SectionLabel>
        <FolderCard info={p} path={loc.parent} onChange={() => void choose()} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, padding: '6px 4px 0 4px' }}>
          <div style={{ flex: 1 }}>
            <Typography variant="bodyMedium" sx={{ color: canUseItself ? md('onSurface') : md('onSurfaceVariant') }}>
              Use this folder itself
            </Typography>
            <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant') }}>
              {canUseItself ? (loc.itself ? `The ${what} goes straight into “${p ? p.name : ''}”.` : `Off: a new folder is made inside it, so nothing else gets mixed in.`) : p ? `Only an empty folder can be used as it is. This one has ${p.entries} item${p.entries === 1 ? '' : 's'}, so a new folder is made inside it.` : ''}
            </Typography>
          </div>
          <Switch checked={loc.itself} disabled={!canUseItself} onChange={(_, v) => loc.setItself(v)} slotProps={{ input: { 'aria-label': 'Use this folder itself' } }} />
        </div>
      </div>

      {!loc.itself && (
        <div>
          <SectionLabel n={2}>Name the new folder</SectionLabel>
          <TextField fullWidth value={loc.name} onChange={(e) => loc.setName(e.target.value)} error={!!nameProblem} {...(nameProblem ? { helperText: nameProblem } : {})} slotProps={{ input: { startAdornment: <CreateNewFolderOutlined sx={{ color: md('onSurfaceVariant'), mr: 1 }} /> } }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loc.target && !nameProblem && (
          <div style={{ padding: '12px 14px', borderRadius: SHAPE.md, background: md('surfaceContainerHigh') }}>
            <Typography variant="labelMedium" component="div" sx={{ color: md('onSurfaceVariant'), mb: 0.25 }}>
              The {what} will be in
            </Typography>
            <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurface'), overflowWrap: 'anywhere', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13 }}>
              {loc.itself ? (
                tidyPath(loc.target)
              ) : (
                <>
                  <span style={{ color: md('onSurfaceVariant') }}>{tidyPath(loc.parent ?? '')}/</span>
                  <b style={{ color: md('primary') }}>{loc.name.trim()}</b>
                  {t?.kind === 'missing' && <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: SHAPE.full, background: md('primaryContainer'), color: md('onPrimaryContainer'), fontSize: 11, fontFamily: 'inherit' }}>new</span>}
                </>
              )}
            </Typography>
          </div>
        )}
        {parentIsLibrary && (
          <Note tone="info" action={onOpenExisting && <Button size="small" onClick={() => onOpenExisting(loc.parent!)}>Open it</Button>}>
            “{p.library!.name}” is a library already. A new one can go next to it, not inside it.
          </Note>
        )}
        {!loc.itself && t?.kind === 'library' && (
          <Note tone="warning" action={onOpenExisting && <Button size="small" color="inherit" onClick={() => onOpenExisting(loc.target!)}>Open it</Button>}>
            There’s already a library called “{t.library?.name ?? t.name}” here{t.library ? `, with ${t.library.packs} packs` : ''}.
          </Note>
        )}
        {!loc.itself && t?.kind === 'other' && <Note tone="error">A folder called “{t.name}” is already here and has files in it. Choose another name.</Note>}
        {!loc.itself && t?.kind === 'empty' && <Note tone="info">An empty folder called “{t.name}” is already here. The {what} will use it.</Note>}
        {p && !p.writable && <Note tone="error">Tessera can’t make folders here. Choose a folder you can write to.</Note>}
        {p?.cloud && (
          <Note tone="warning">
            This is in {p.cloud}. Libraries get large, and a cloud service copying the same files can clash with Tessera’s own sync. A folder on this computer or an external drive is safer.
          </Note>
        )}
        {p && p.free !== null && p.free < LOW_SPACE && <Note tone="warning">Only {formatBytes(p.free)} is free on this drive. Libraries grow with every pack you add.</Note>}
      </div>
    </div>
  );
}
