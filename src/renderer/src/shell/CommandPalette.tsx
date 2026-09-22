import AddLinkOutlined from '@mui/icons-material/AddLinkOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import BrightnessMediumOutlined from '@mui/icons-material/BrightnessMediumOutlined';
import CollectionsBookmarkOutlined from '@mui/icons-material/CollectionsBookmarkOutlined';
import GridViewOutlined from '@mui/icons-material/GridViewOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import Dialog from '@mui/material/Dialog';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { call } from '../api';
import { displayName, TYPE_ICONS } from '../components/labels';
import { useBrowse } from '../state/browse';
import { useCollections } from '../state/collections';
import { useImport } from '../state/importer';
import { useIndexVersion, useLibraryId } from '../state/library';
import { useNav } from '../state/nav';
import { useProjects } from '../state/projects';
import { useSettings, useUpdateSettings } from '../state/queries';
import { md, mdAlpha, SHAPE } from '../theme';
import { useDebounced } from '../pages/browse/BrowsePage';

interface Command {
  id: string;
  group: string;
  label: string;
  detail?: string;
  icon: ComponentType<{ sx?: object }>;
  run: () => void;
}

const matches = (needle: string, ...hay: (string | undefined)[]) => {
  const words = needle.toLowerCase().split(/\s+/).filter(Boolean);
  const text = hay.filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => text.includes(w));
};

/**
 * ⌘K / Ctrl+K: jump anywhere or do anything by typing — pages, actions, packs, collections,
 * projects and assets, all in one list. Arrow keys move, Enter runs.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const lib = useLibraryId();
  const version = useIndexVersion();
  const go = useNav((s) => s.go);
  const choose = useImport((s) => s.choose);
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const collections = useCollections().data ?? [];
  const projects = useProjects().data ?? [];
  const q = useDebounced(text.trim(), 120);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setText('');
        setActive(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const packs = useQuery({
    queryKey: ['palette-packs', lib, version, q],
    queryFn: () => call('browse:packs', { scope: 'all', text: q, filters: {} }, 'name', 0, 6),
    enabled: open && !!lib && q.length > 1,
  }).data?.rows;
  const assets = useQuery({
    queryKey: ['palette-assets', lib, version, q],
    queryFn: () => call('browse:assets', { scope: 'library', text: q, filters: {} }, 'relevance', 0, 6),
    enabled: open && !!lib && q.length > 1,
  }).data?.rows;

  const commands = useMemo<Command[]>(() => {
    const close = (fn: () => void) => () => {
      setOpen(false);
      fn();
    };
    const pages: Command[] = [
      { id: 'home', group: 'Go to', label: 'Home', icon: HomeOutlined, run: close(() => go({ to: 'home' })) },
      { id: 'browse', group: 'Go to', label: 'Browse', icon: GridViewOutlined, run: close(() => go({ to: 'browse' })) },
      { id: 'collections', group: 'Go to', label: 'Collections', icon: CollectionsBookmarkOutlined, run: close(() => go({ to: 'collections' })) },
      { id: 'projects', group: 'Go to', label: 'Projects', icon: SportsEsportsOutlined, run: close(() => go({ to: 'projects' })) },
      { id: 'inbox', group: 'Go to', label: 'Inbox', icon: InboxOutlined, run: close(() => go({ to: 'inbox' })) },
      { id: 'settings', group: 'Go to', label: 'Settings', icon: SettingsOutlined, run: close(() => go({ to: 'settings' })) },
    ];
    const actions: Command[] = [
      { id: 'add', group: 'Actions', label: 'Add packs…', icon: AddOutlined, run: close(() => void choose('files')) },
      { id: 'add-folder', group: 'Actions', label: 'Add a folder of packs…', icon: AddOutlined, run: close(() => void choose('folderOfPacks')) },
      { id: 'link', group: 'Actions', label: 'Link a game project…', icon: AddLinkOutlined, run: close(() => go({ to: 'projects' })) },
      {
        id: 'theme',
        group: 'Actions',
        label: settings?.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: BrightnessMediumOutlined,
        run: close(() => update.mutate({ theme: settings?.theme === 'dark' ? 'light' : 'dark' })),
      },
    ];
    const searchAll: Command[] = q
      ? [
          {
            id: 'search',
            group: 'Search',
            label: `Search the library for “${q}”`,
            icon: SearchOutlined,
            run: close(() => {
              useBrowse.getState().setText(q);
              go({ to: 'browse' });
            }),
          },
        ]
      : [];
    const out = [
      ...searchAll,
      ...pages.filter((c) => !q || matches(q, c.label)),
      ...actions.filter((c) => !q || matches(q, c.label)),
      ...collections.filter((c) => q && matches(q, c.name)).slice(0, 5).map<Command>((c) => ({ id: `c${c.id}`, group: 'Collections', label: c.name, detail: `${c.count} assets`, icon: CollectionsBookmarkOutlined, run: close(() => go({ to: 'collection', id: c.id })) })),
      ...projects.filter((p) => q && matches(q, p.name)).slice(0, 5).map<Command>((p) => ({ id: `p${p.id}`, group: 'Projects', label: p.name, detail: p.path, icon: SportsEsportsOutlined, run: close(() => go({ to: 'project', id: p.id })) })),
      ...(packs ?? []).map<Command>((p) => ({ id: `k${p.id}`, group: 'Packs', label: p.name, detail: p.status === 'inbox' ? 'In the Inbox' : undefined, icon: Inventory2Outlined, run: close(() => go({ to: 'pack', id: p.id })) })),
      ...(assets ?? []).map<Command>((a) => ({
        id: `a${a.id}`,
        group: 'Assets',
        label: displayName(a.name),
        detail: a.packName,
        icon: TYPE_ICONS[a.type],
        run: close(() => {
          useBrowse.getState().setText(displayName(a.name));
          useBrowse.getState().focus({ kind: 'asset', id: a.id });
          go({ to: 'browse' });
        }),
      })),
    ];
    return out;
  }, [q, packs, assets, collections, projects, settings?.theme, go, choose, update]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(commands.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commands[active]?.run();
    }
  };

  let lastGroup = '';
  return (
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: '12vh', p: 0, overflow: 'hidden' } } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${md('outlineVariant')}` }}>
        <SearchOutlined sx={{ color: md('onSurfaceVariant') }} />
        <InputBase autoFocus fullWidth value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} placeholder="Go to, do, or find anything" inputProps={{ 'aria-label': 'Command' }} sx={{ typography: 'bodyLarge' }} />
      </div>
      <div ref={list} role="listbox" style={{ maxHeight: '50vh', overflowY: 'auto', padding: 8 }}>
        {commands.map((c, i) => {
          const header = c.group !== lastGroup;
          lastGroup = c.group;
          const Icon = c.icon;
          return (
            <div key={c.id}>
              {header && (
                <Typography variant="labelMedium" sx={{ display: 'block', px: 1.5, pt: i ? 1.5 : 0.5, pb: 0.5, color: md('onSurfaceVariant') }}>
                  {c.group}
                </Typography>
              )}
              <div
                role="option"
                aria-selected={i === active}
                data-index={i}
                onMouseMove={() => setActive(i)}
                onClick={c.run}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: SHAPE.sm, cursor: 'default', background: i === active ? mdAlpha('onSurface', 0.08) : 'transparent' }}
              >
                <Icon sx={{ fontSize: 20, color: md('onSurfaceVariant') }} />
                <Typography variant="bodyMedium" noWrap sx={{ color: md('onSurface'), flex: 1 }}>
                  {c.label}
                </Typography>
                {c.detail && (
                  <Typography variant="bodySmall" noWrap sx={{ color: md('onSurfaceVariant'), maxWidth: 240 }}>
                    {c.detail}
                  </Typography>
                )}
              </div>
            </div>
          );
        })}
        {!commands.length && (
          <Typography variant="bodyMedium" sx={{ p: 2, color: md('onSurfaceVariant') }}>
            Nothing matches.
          </Typography>
        )}
      </div>
    </Dialog>
  );
}
