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

type Deps = Pick<IpcContext, 'activity' | 'copySource' | 'library' | 'libraryId' | 'projects' | 'recordPage' | 'usage' | 'windows'>;

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
  const { activity, copySource, library, libraryId, projects, recordPage, usage, windows } = c;
  handle('browse:assets', (q, sort, offset, limit) => library.require().queries.assets(q, sort, offset, Math.min(limit, 1000)));
  handle('browse:packs', (q, sort, offset, limit) => {
    const queries = library.require().queries;
    if (sort !== 'used') return queries.packs(q, sort, offset, Math.min(limit, 1000));
    // Which packs someone reaches for is kept outside the index, so the ordering happens here.
    // Packs are in the hundreds, not the hundred thousands, so reading them all is cheap.
    const all = queries.packs(q, 'name', 0, 1000);
    const score = new Map(usage.ranked().map((r) => [r.packId, r.score]));
    const rows = [...all.rows].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || a.name.localeCompare(b.name));
    return { ...all, rows: rows.slice(offset, offset + Math.min(limit, 1000)) };
  });
  handle('browse:facets', (q, mode) => library.require().queries.facets(q, mode));
  handle('browse:allIds', (q, mode) => library.require().queries.allIds(q, mode));
  handle('browse:sum', (mode, ids) => library.require().queries.sum(mode, ids));

  handle('pack:get', (id) => library.require().queries.pack(id));
  handle('usage:record', (packId, kind) => usage.record(packId, kind));
  handle('usage:top', (limit = 12) =>
    usage
      .ranked()
      .slice(0, limit)
      .map((r) => ({ packId: r.packId, score: Math.round(r.score * 10) / 10, ...r.use })),
  );
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
  handle('pack:discard', (id) => {
    // Thrown away, so whatever it was made from stays where it is.
    library.forgetOriginals(id);
    return library.discardPack(id);
  });
  handle('import:takeOriginals', (packId) => library.takeOriginals(packId));
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
    await keepTheRecord(projects, activity, libraryId(), [id], copySource());
    return library.removePack(id);
  });
  handle('assets:remove', async (items) => {
    await keepTheRecord(projects, activity, libraryId(), [...new Set(items.map((i) => i.packId))], copySource());
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
  handle('pack:findAgain', async (id, path) => {
    const found = await library.findPackAgain(id, path);
    activity.add('library', 'Found the folder for a pack again', path);
    return found;
  });
  handle('pack:takeIn', async (id) => {
    await library.takePackIn(id);
    activity.add('added', 'Took a pack into the library', 'Its files were copied in; the folder they came from is untouched');
  });
  handle('favourites:assets', (items, on) => library.favouriteAssets(items, on));
  handle('favourites:pack', (id, on) => library.favouritePack(id, on));
  handle('pack:archive', async (id, on) => {
    if (on) await keepTheRecord(projects, activity, libraryId(), [id], copySource());
    return library.archivePack(id, on);
  });

}

/**
 * Every game that uses these packs keeps the licence beside the files. Any game that would not
 * take it is named in the activity log, because the pack is about to leave the library and the
 * record is the thing that must not be lost quietly.
 */
async function keepTheRecord(projects: Deps['projects'], activity: Deps['activity'], libraryId: string, packIds: string[], src: ReturnType<Deps['copySource']>): Promise<void> {
  try {
    const { failed } = await projects.keepLicences(libraryId, packIds, src);
    if (failed.length) activity.add('project', `Could not write the licence into ${failed.join(', ')}. The record there is out of date.`);
  } catch (e) {
    log.warn('projects', 'could not write a licence into a game', e);
    activity.add('project', 'Could not write the licence into the games using this pack. The record there is out of date.');
  }
}
