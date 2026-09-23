import BookmarkAddOutlined from '@mui/icons-material/BookmarkAddOutlined';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DriveFileMoveOutlined from '@mui/icons-material/DriveFileMoveOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import LanguageRounded from '@mui/icons-material/LanguageRounded';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { hostLabel } from '@shared/links';
import type { AssetRow, PackRow } from '@shared/query';
import { sourceInfo } from '@shared/sources';
import { call } from '../../api';
import { ask } from '../../notices/dialogs';
import { failed, notify } from '../../notices/store';
import { useIndexVersion, useLibraryId } from '../../state/library';
import { useNav } from '../../state/nav';
import { CollectionMenu } from '../collections/CollectionMenu';
import { ProjectMenu } from '../projects/ProjectMenu';

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

function Item({ icon, primary, secondary, onClick, danger }: { icon: ReactNode; primary: string; secondary?: string; onClick: (e: React.MouseEvent<HTMLLIElement>) => void; danger?: boolean }) {
  return (
    <MenuItem onClick={onClick} {...(danger ? { sx: { color: 'error.main' } } : {})}>
      <ListItemIcon {...(danger ? { sx: { color: 'error.main' } } : {})}>{icon}</ListItemIcon>
      <ListItemText primary={primary} {...(secondary ? { secondary } : {})} />
    </MenuItem>
  );
}

/**
 * The quick menu on an asset tile, the same wherever tiles are shown. What it offers depends on
 * where it is: only a collection page can take something out of a collection, and only Browse
 * has a pile to add to.
 */
export function AssetMenu({
  anchor,
  asset,
  onClose,
  onOpen,
  onPick,
  onOpenPack,
  extra,
}: {
  anchor: HTMLElement;
  asset: AssetRow;
  onClose: () => void;
  onOpen: () => void;
  onPick?: () => void;
  onOpenPack?: () => void;
  /** One more thing to offer, where the page has one (taking it out of a collection). */
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
        {onPick && <Item icon={<CheckCircleOutlineRounded fontSize="small" />} primary="Pick it out" secondary="To do something with several" onClick={run(onPick)} />}
        <Divider />
        <Item icon={<BookmarkAddOutlined fontSize="small" />} primary="Add to a collection" onClick={(e) => setCollections(e.currentTarget)} />
        <Item icon={<DriveFileMoveOutlined fontSize="small" />} primary="Copy to a project" onClick={(e) => setProjects(e.currentTarget)} />
        {extra && <Item icon={extra.icon} primary={extra.primary} onClick={run(extra.run)} />}
        <Divider />
        {onOpenPack && <Item icon={<Inventory2Outlined fontSize="small" />} primary="Open its pack" secondary={asset.packName} onClick={run(onOpenPack)} />}
        {page && <Item icon={<LanguageRounded fontSize="small" />} primary="Its page on the web" secondary={hostLabel(page)} onClick={run(() => void call('app:openExternal', page).catch(failed))} />}
        <Item icon={<FolderOpenOutlined fontSize="small" />} primary="Show the file" onClick={run(() => void call('pack:reveal', asset.packId, asset.ref).catch(failed))} />
      </Menu>
      <CollectionMenu anchor={collections} onClose={close} items={items} />
      <ProjectMenu anchor={projects} onClose={close} items={items} />
    </>
  );
}

/** The quick menu on a pack card: what can be done to a whole pack without opening it. */
export function PackMenu({ anchor, pack, onClose, onOpen, onPick }: { anchor: HTMLElement; pack: PackRow; onClose: () => void; onOpen: () => void; onPick?: () => void }) {
  const go = useNav((n) => n.go);
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

  const remove = async () => {
    const yes = await ask<boolean>({
      tone: 'warning',
      title: `Remove ${pack.name}?`,
      body: 'Its folder goes to the wastebasket. Anything already copied into a game stays where it is.',
      actions: [
        { label: 'Keep it', value: false, kind: 'text' },
        { label: 'Remove', value: true, kind: 'danger' },
      ],
    });
    if (!yes) return;
    try {
      await call('pack:remove', pack.id);
      notify.success('The pack is in the wastebasket.');
    } catch (e) {
      failed(e);
    }
  };

  return (
    <>
      <Menu anchorEl={anchor} open={!collections && !projects} onClose={close} slotProps={{ paper: { sx: { minWidth: 240 } } }}>
        <Item icon={<OpenInFullRounded fontSize="small" />} primary="Open the pack" onClick={run(onOpen)} />
        {onPick && <Item icon={<CheckCircleOutlineRounded fontSize="small" />} primary="Pick it out" secondary="To do something with several" onClick={run(onPick)} />}
        <Divider />
        <Item icon={<BookmarkAddOutlined fontSize="small" />} primary="Collect its assets" onClick={(e) => setCollections(e.currentTarget)} />
        <Item icon={<DriveFileMoveOutlined fontSize="small" />} primary="Copy its assets to a project" onClick={(e) => setProjects(e.currentTarget)} />
        <Divider />
        <Item icon={<EditOutlined fontSize="small" />} primary="Edit details" onClick={run(() => go({ to: 'pack', id: pack.id, edit: true }))} />
        {page && <Item icon={<LanguageRounded fontSize="small" />} primary="Its page on the web" secondary={hostLabel(page)} onClick={run(() => void call('app:openExternal', page).catch(failed))} />}
        <Item icon={<FolderOpenOutlined fontSize="small" />} primary="Show the folder" onClick={run(() => void call('pack:reveal', pack.id).catch(failed))} />
        <Divider />
        <Item danger icon={<DeleteOutlineRounded fontSize="small" />} primary="Remove" onClick={run(() => void remove())} />
      </Menu>
      <CollectionMenu anchor={collections} onClose={close} items={items} />
      <ProjectMenu anchor={projects} onClose={close} items={items} />
    </>
  );
}
