import BookmarkAddOutlined from '@mui/icons-material/BookmarkAddOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DriveFileMoveOutlined from '@mui/icons-material/DriveFileMoveOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import LanguageRounded from '@mui/icons-material/LanguageRounded';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useQuery } from '@tanstack/react-query';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { hostLabel } from '@shared/links';
import type { AssetRow, PackRow } from '@shared/query';
import { sourceInfo } from '@shared/sources';
import { call } from '../../api';
import { failed, notify } from '../../notices/store';
import { useIndexVersion, useLibraryId } from '../../state/library';
import { CollectionMenu } from '../collections/CollectionMenu';
import { ProjectMenu } from '../projects/ProjectMenu';
import { removeAssets, removePacks } from './deleting';

/** A pack in full, from the cache where a page has already read it. */
function usePackDetails(packId: string | null) {
  const lib = useLibraryId();
  const version = useIndexVersion();
  return useQuery({ queryKey: ['pack', lib, version, packId], queryFn: () => call('pack:get', packId!), enabled: !!lib && !!packId }).data ?? null;
}

/** The page a pack came from, its own or its site's. */
function pageOf(pack: { meta: { source: { url?: string | null; site?: string | null } } } | null): string | null {
  if (!pack) return null;
  return pack.meta.source.url ?? sourceInfo(pack.meta.source.site)?.url ?? null;
}

/** Open a file in whatever this computer uses for it, saying so when it lives inside an archive. */
async function openOutside(packId: string, ref: string) {
  try {
    if ((await call('pack:open', packId, ref)) === 'inArchive') notify.info('That file is inside an archive, so the archive is shown instead.');
  } catch (e) {
    failed(e);
  }
}

function Item({ icon, primary, secondary, onClick, danger }: { icon: ReactNode; primary: string; secondary?: string; onClick: (e: MouseEvent<HTMLLIElement>) => void; danger?: boolean }) {
  return (
    <MenuItem onClick={onClick} {...(danger ? { sx: { color: 'error.main' } } : {})}>
      <ListItemIcon {...(danger ? { sx: { color: 'error.main' } } : {})}>{icon}</ListItemIcon>
      <ListItemText primary={primary} {...(secondary ? { secondary } : {})} />
    </MenuItem>
  );
}

/**
 * The quick menu on an asset tile, the same wherever tiles are shown: open it, here or elsewhere,
 * put it somewhere, see where it came from, or be rid of it. A page can add one thing of its own
 * (taking it out of a collection).
 */
export function AssetMenu({
  anchor,
  asset,
  onClose,
  onOpen,
  extra,
}: {
  anchor: HTMLElement;
  asset: AssetRow;
  onClose: () => void;
  onOpen: () => void;
  extra?: { icon: ReactNode; primary: string; run: () => void };
}) {
  const [collections, setCollections] = useState<HTMLElement | null>(null);
  const [projects, setProjects] = useState<HTMLElement | null>(null);
  const pack = usePackDetails(asset.packId);
  const page = pageOf(pack);
  const items = () => call('assets:refs', [asset.id]);
  const close = () => {
    setCollections(null);
    setProjects(null);
    onClose();
  };
  const run = (f: () => void) => () => {
    close();
    f();
  };

  return (
    <>
      <Menu anchorEl={anchor} open={!collections && !projects} onClose={close} slotProps={{ paper: { sx: { minWidth: 240 } } }}>
        <Item icon={<OpenInFullRounded fontSize="small" />} primary="Open" onClick={run(onOpen)} />
        <Item icon={<LaunchRounded fontSize="small" />} primary="Open in another app" onClick={run(() => void openOutside(asset.packId, asset.ref))} />
        <Divider />
        <Item icon={<BookmarkAddOutlined fontSize="small" />} primary="Add to a collection" onClick={(e) => setCollections(e.currentTarget)} />
        <Item icon={<DriveFileMoveOutlined fontSize="small" />} primary="Copy to a project" onClick={(e) => setProjects(e.currentTarget)} />
        {extra && <Item icon={extra.icon} primary={extra.primary} onClick={run(extra.run)} />}
        {page && <Item icon={<LanguageRounded fontSize="small" />} primary="Its page on the web" secondary={hostLabel(page)} onClick={run(() => void call('app:openExternal', page).catch(failed))} />}
        <Divider />
        <Item danger icon={<DeleteOutlineRounded fontSize="small" />} primary="Delete" onClick={run(() => void removeAssets(items, 1, asset.name))} />
      </Menu>
      <CollectionMenu anchor={collections} onClose={close} items={items} />
      <ProjectMenu anchor={projects} onClose={close} items={items} />
    </>
  );
}

/** The quick menu on a pack card: the same six things, for a whole pack. */
export function PackMenu({ anchor, pack, onClose, onOpen }: { anchor: HTMLElement; pack: PackRow; onClose: () => void; onOpen: () => void }) {
  const [collections, setCollections] = useState<HTMLElement | null>(null);
  const [projects, setProjects] = useState<HTMLElement | null>(null);
  const details = usePackDetails(pack.id);
  const page = pageOf(details);
  const items = async () => (await call('pack:files', pack.id)).map((f) => ({ packId: f.packId, ref: f.ref }));
  const close = () => {
    setCollections(null);
    setProjects(null);
    onClose();
  };
  const run = (f: () => void) => () => {
    close();
    f();
  };

  return (
    <>
      <Menu anchorEl={anchor} open={!collections && !projects} onClose={close} slotProps={{ paper: { sx: { minWidth: 240 } } }}>
        <Item icon={<OpenInFullRounded fontSize="small" />} primary="Open the pack" onClick={run(onOpen)} />
        <Item icon={<FolderOpenOutlined fontSize="small" />} primary="Show its folder" onClick={run(() => void call('pack:reveal', pack.id).catch(failed))} />
        <Divider />
        <Item icon={<BookmarkAddOutlined fontSize="small" />} primary="Collect its assets" onClick={(e) => setCollections(e.currentTarget)} />
        <Item icon={<DriveFileMoveOutlined fontSize="small" />} primary="Copy its assets to a project" onClick={(e) => setProjects(e.currentTarget)} />
        {page && <Item icon={<LanguageRounded fontSize="small" />} primary="Its page on the web" secondary={hostLabel(page)} onClick={run(() => void call('app:openExternal', page).catch(failed))} />}
        <Divider />
        <Item danger icon={<DeleteOutlineRounded fontSize="small" />} primary="Delete" onClick={run(() => void removePacks([pack.id], pack.name))} />
      </Menu>
      <CollectionMenu anchor={collections} onClose={close} items={items} />
      <ProjectMenu anchor={projects} onClose={close} items={items} />
    </>
  );
}
