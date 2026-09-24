/**
 * Packs and the files in them: browsing, reading, editing, linking out, and the bin.
 *
 * Every handler here answers one channel of the contract in src/shared/ipc.ts. What it needs is
 * given to it; nothing in this file reaches for a service of its own.
 */
import { BrowserWindow, app, dialog, shell } from 'electron';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { packFileUrl } from '@shared/urls';
import { parseRef } from '../index/files';
import { UserError, handle } from '../ipc';
import { log } from '../log';
import type { IpcContext } from './context';

type Deps = Pick<IpcContext, 'activity' | 'copySource' | 'library' | 'libraryId' | 'projects' | 'recordPage' | 'windows'>;

/**
 * Where a file of a pack actually is. Every ref the window sends comes from the index, so it is
 * always inside the pack already; this is here so that it stays true if one ever does not, because
 * the two channels below hand a path to the desktop, and the desktop does not ask questions.
 */
function withinPack(dir: string, rel: string): string {
  const path = resolve(dir, ...rel.split('/'));
  const step = relative(dir, path);
  if (!step || step.startsWith('..') || isAbsolute(step)) throw new UserError('not-in-pack', 'That file is not in the pack.');
  return path;
}

export function registerPackIpc(c: Deps): void {
  const { activity, copySource, library, libraryId, projects, recordPage, windows } = c;
  handle('browse:assets', (q, sort, offset, limit) => library.require().queries.assets(q, sort, offset, Math.min(limit, 1000)));
  handle('browse:packs', (q, sort, offset, limit) => library.require().queries.packs(q, sort, offset, Math.min(limit, 1000)));
  handle('browse:facets', (q, mode) => library.require().queries.facets(q, mode));
  handle('browse:allIds', (q, mode) => library.require().queries.allIds(q, mode));
  handle('browse:sum', (mode, ids) => library.require().queries.sum(mode, ids));

  handle('pack:get', (id) => library.require().queries.pack(id));
  handle('pack:files', (id) => library.require().queries.packFiles(id));
  handle('pack:edit', async (id, edit) => {
    await library.editPack(id, edit);
    // Projects keep the pack's licence and credit line on record: bring them up to date.
    const row = library.require().queries.pack(id);
    if (row) {
      const m = row.meta;
      await projects
        .packChanged(libraryId(), id, { packName: m.name, licence: m.licence.id, attribution: m.licence.attribution, creator: m.source.creator, sourceUrl: m.source.url })
        .catch((e: unknown) => log.warn('projects', 'could not update projects after a pack edit', e));
    }
  });
  handle('pack:detect', (id) => library.detect(id));
  handle('pack:partLicences', (id) => library.partLicences(id));
  handle('pack:details', (id) => library.details(id));
  handle('pack:discard', (id) => library.discardPack(id));
  handle('pack:recordPage', (id, what) => {
    // In the background, one page at a time: the add page doesn't wait for it.
    recordPage(id, what);
  });
  handle('pack:status', async (id, status) => {
    const name = library.require().queries.pack(id)?.name;
    await library.setStatus(id, status);
    if (status === 'library' && name) activity.add('reviewed', `“${name}” passed Review and is in the library`);
  });
  handle('pack:remove', async (id) => {
    await projects.keepLicences(libraryId(), [id], copySource()).catch((e: unknown) => log.warn('projects', 'could not write a licence into a game', e));
    return library.removePack(id);
  });
  handle('assets:remove', async (items) => {
    await projects.keepLicences(libraryId(), [...new Set(items.map((i) => i.packId))], copySource()).catch((e: unknown) => log.warn('projects', 'could not write a licence into a game', e));
    return library.removeFiles(items);
  });
  handle('bin:list', () => library.bin());
  handle('bin:restore', (id) => library.restoreFromBin(id));
  handle('bin:empty', (ids) => library.emptyBin(ids));
  handle('pack:proof', async (id) => (await library.proofFiles(id)).map((f) => ({ ...f, url: packFileUrl(id, `licence/${f.name}`) })));
  handle('pack:addProof', async (id) => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options = { title: 'Add licence proof', properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? 0 : library.addProof(id, result.filePaths);
  });
  handle('pack:openProof', async (id, name) => {
    const error = await shell.openPath(await library.proofPath(id, name));
    if (error) throw new UserError('open-failed', error);
  });
  handle('asset:get', (id) => library.require().queries.asset(id));
  handle('asset:variants', (id) => library.require().queries.variants(id));
  handle('assets:refs', (ids) => library.require().queries.refs(ids.slice(0, 10_000)));
  handle('pack:textures', (id) => {
    const out: Record<string, string> = {};
    for (const img of library.require().queries.packImages(id)) out[img.name.toLowerCase()] ??= packFileUrl(id, img.ref);
    return out;
  });
  handle('pack:reveal', async (id, ref) => {
    const pack = await library.packRecord(id);
    // A file inside an archive can't be shown; the archive holding it can.
    const onDisk = ref ? parseRef(ref).file : null;
    shell.showItemInFolder(onDisk ? withinPack(pack.dir, onDisk) : join(pack.dir, 'pack.json'));
  });

  handle('pack:open', async (id, ref) => {
    const pack = await library.packRecord(id);
    const { file, inside } = parseRef(ref);
    const onDisk = withinPack(pack.dir, file);
    // A file inside an archive can't be handed to another app; show the archive instead.
    if (inside.length) {
      shell.showItemInFolder(onDisk);
      return 'inArchive';
    }
    const error = await shell.openPath(onDisk);
    if (error) throw new Error(error);
    return 'opened';
  });

  handle('pack:addFiles', async (id, paths, into) => {
    const pack = library.require().queries.pack(id);
    const done = await library.addFilesToPack(id, paths, into);
    if (done.added) activity.add('added', `Added ${done.added} file${done.added === 1 ? '' : 's'} to “${pack?.name ?? 'a pack'}”`, done.names.slice(0, 6).join(', '));
    return done;
  });
  handle('pack:folders', (id) => library.packFolders(id));
  handle('favourites:assets', (items, on) => library.favouriteAssets(items, on));
  handle('favourites:pack', (id, on) => library.favouritePack(id, on));
  handle('pack:archive', async (id, on) => {
    if (on) await projects.keepLicences(libraryId(), [id], copySource()).catch((e: unknown) => log.warn('projects', 'could not write a licence into a game', e));
    return library.archivePack(id, on);
  });

}
