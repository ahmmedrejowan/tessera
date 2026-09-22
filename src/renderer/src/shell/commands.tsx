import AddLinkOutlined from '@mui/icons-material/AddLinkOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import BrightnessMediumOutlined from '@mui/icons-material/BrightnessMediumOutlined';
import CollectionsBookmarkOutlined from '@mui/icons-material/CollectionsBookmarkOutlined';
import GridViewOutlined from '@mui/icons-material/GridViewOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SportsEsportsOutlined from '@mui/icons-material/SportsEsportsOutlined';
import { useQuery } from '@tanstack/react-query';
import { useMemo, type ComponentType } from 'react';
import { call } from '../api';
import { useCollections } from '../state/collections';
import { useImport } from '../state/importer';
import { useIndexVersion, useLibraries, useLibraryId } from '../state/library';
import { useNav } from '../state/nav';
import { useProjects } from '../state/projects';
import { useSettings, useUpdateSettings } from '../state/queries';
import { useLinkProject } from '../pages/projects/ProjectsPage';

export interface Command {
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
 * What the search box offers besides the library's assets (those show in Browse as you type):
 * pages, actions, other libraries, collections, projects and packs. With nothing typed, the pages
 * and actions. `done` runs after a command (closing the list).
 */
export function useCommands(q: string, active: boolean, done: () => void): { commands: Command[]; link: ReturnType<typeof useLinkProject> } {
  const lib = useLibraryId();
  const version = useIndexVersion();
  const go = useNav((s) => s.go);
  const choose = useImport((s) => s.choose);
  const settings = useSettings().data;
  const update = useUpdateSettings();
  const collections = useCollections().data ?? [];
  const projects = useProjects().data ?? [];
  const libraries = useLibraries().data ?? [];
  const link = useLinkProject();
  const packs = useQuery({
    queryKey: ['palette-packs', lib, version, q],
    queryFn: () => call('browse:packs', { scope: 'all', text: q, filters: {} }, 'name', 0, 5),
    enabled: active && !!lib && q.length > 1,
  }).data?.rows;

  const commands = useMemo<Command[]>(() => {
    const then = (fn: () => void) => () => {
      done();
      fn();
    };
    const pages: Command[] = [
      { id: 'home', group: 'Go to', label: 'Home', icon: HomeOutlined, run: then(() => go({ to: 'home' })) },
      { id: 'browse', group: 'Go to', label: 'Browse', icon: GridViewOutlined, run: then(() => go({ to: 'browse' })) },
      { id: 'collections', group: 'Go to', label: 'Collections', icon: CollectionsBookmarkOutlined, run: then(() => go({ to: 'collections' })) },
      { id: 'projects', group: 'Go to', label: 'Projects', icon: SportsEsportsOutlined, run: then(() => go({ to: 'projects' })) },
      { id: 'inbox', group: 'Go to', label: 'Review', icon: RateReviewOutlined, run: then(() => go({ to: 'inbox' })) },
      { id: 'settings', group: 'Go to', label: 'Settings', icon: SettingsOutlined, run: then(() => go({ to: 'settings' })) },
    ];
    const actions: Command[] = [
      { id: 'add', group: 'Do', label: 'Add packs…', icon: AddOutlined, run: then(() => void choose('files')) },
      { id: 'add-folder', group: 'Do', label: 'Add a folder…', icon: AddOutlined, run: then(() => void choose('folder')) },
      { id: 'link', group: 'Do', label: 'Link a game project…', icon: AddLinkOutlined, run: then(() => void link.start()) },
      {
        id: 'theme',
        group: 'Do',
        label: settings?.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: BrightnessMediumOutlined,
        run: then(() => update.mutate({ theme: settings?.theme === 'dark' ? 'light' : 'dark' })),
      },
    ];
    if (!q) return [...pages, ...actions];
    return [
      ...pages.filter((c) => matches(q, c.label)),
      ...actions.filter((c) => matches(q, c.label)),
      ...libraries.filter((l) => !l.open && l.found && matches(q, l.name)).slice(0, 4).map<Command>((l) => ({ id: `l${l.id}`, group: 'Libraries', label: `Switch to ${l.name}`, icon: AutoStoriesOutlined, run: then(() => void call('library:open', l.path)) })),
      ...collections.filter((c) => matches(q, c.name)).slice(0, 4).map<Command>((c) => ({ id: `c${c.id}`, group: 'Collections', label: c.name, detail: `${c.count} assets`, icon: CollectionsBookmarkOutlined, run: then(() => go({ to: 'collection', id: c.id })) })),
      ...projects.filter((p) => matches(q, p.name)).slice(0, 4).map<Command>((p) => ({ id: `p${p.id}`, group: 'Projects', label: p.name, detail: p.path, icon: SportsEsportsOutlined, run: then(() => go({ to: 'project', id: p.id })) })),
      ...(packs ?? []).map<Command>((p) => ({ id: `k${p.id}`, group: 'Packs', label: p.name, detail: p.status === 'inbox' ? 'In Review' : undefined, icon: Inventory2Outlined, run: then(() => go({ to: 'pack', id: p.id })) })),
    ];
  }, [q, packs, collections, projects, libraries, settings?.theme, go, choose, update, link, done]);
  return { commands, link };
}
