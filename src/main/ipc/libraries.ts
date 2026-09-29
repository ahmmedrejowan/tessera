/**
 * Libraries: making one, opening it, what is in it, and the previews it keeps.
 *
 * Every handler here answers one channel of the contract in src/shared/ipc.ts. What it needs is
 * given to it; nothing in this file reaches for a service of its own.
 */
import { join } from 'node:path';
import { readdir, rm, stat } from 'node:fs/promises';
import { UserError, handle } from '../ipc';
import { patchRecord } from '../libraries';
import { locateLibrary } from '../library/locate';
import type { IpcContext } from './context';
import { clearFor, previewCost } from '../thumbs/cache';
import { DIRECT, DIRECT_MAX, DRAWN_FOR } from '../thumbs/service';
import { stillToHash } from '../index/hashes';

type Deps = Pick<
  IpcContext,
  'buildPreviews' | 'indexChanged' | 'librariesChanged' | 'library' | 'librarySummaries' | 'openRecord' | 'previewsBuilding' | 'settings' | 'stopPreviews' | 'sync' | 'thumbDir' | 'thumbs' | 'usage'
>;

export function registerLibraryIpc(c: Deps): void {
  const { buildPreviews, indexChanged, librariesChanged, library, librarySummaries, openRecord, previewsBuilding, settings, stopPreviews, sync, thumbDir, thumbs, usage } = c;
  handle('library:locate', (path) => locateLibrary(path));
  handle('library:state', () => library.getState());
  handle('library:inspect', (path) => library.inspect(path));
  handle('library:create', (path, name) => library.create(path, name));
  handle('library:open', (path) => library.open(path));
  handle('library:rename', async (name) => {
    const state = await library.rename(name);
    if (state.status === 'ready') await patchRecord(settings, state.library.id, { name: state.library.name });
    librariesChanged();
    return state;
  });
  handle('library:setPrefs', async (prefs) => {
    const record = openRecord();
    if (!record) throw new UserError('no-library', 'No library is open.');
    await patchRecord(settings, record.id, prefs);
    librariesChanged();
  });
  handle('libraries:list', () => librarySummaries());
  handle('libraries:forget', async (id) => {
    const state = library.getState();
    if (state.status === 'ready' && state.library.id === id) throw new UserError('library-open', 'Close the library first.');
    const { [id]: _gone, ...rest } = settings.get().libraries;
    await settings.update({ libraries: rest });
    sync.reconcileSoon();
    librariesChanged();
  });
  handle('library:close', async () => {
    library.close();
    await settings.update({ libraryPath: null });
  });
  handle('library:refresh', () => library.sync());
  handle('library:stats', () => library.require().queries.stats());
  handle('library:terms', (field) => library.require().queries.terms(field));
  handle('library:health', () => library.require().queries.health());
  handle('library:duplicates', () => library.require().queries.duplicates());
  handle('library:stillReading', () => stillToHash(library.require().index.db));
  handle('library:reindex', () => library.reindex());
  handle('thumbs:size', async () => {
    const dir = thumbDir();
    if (!dir) return 0;
    let total = 0;
    for (const f of await readdir(dir).catch(() => [] as string[])) total += (await stat(join(dir, f)).catch(() => null))?.size ?? 0;
    return total;
  });
  handle('thumbs:clear', async () => {
    const dir = thumbDir();
    if (dir) await rm(dir, { recursive: true, force: true });
    thumbs.reset();
    indexChanged();
  });
  handle('thumbs:cost', () => previewCost(thumbDir()));
  handle('thumbs:clearSome', async (opts) => {
    const n = await clearFor(thumbDir(), opts);
    thumbs.reset();
    indexChanged();
    return n;
  });
  handle('thumbs:packs', async () => {
    const queries = library.require().queries;
    const cost = await previewCost(thumbDir());
    // Thumbnail names carry only the first eight characters of the pack id, which is what makes
    // the folder readable on its own. Matching happens here, where the real ids are.
    const packs = queries.packs({ scope: 'all', text: '', filters: {} }, 'name', 0, 5000).rows;
    const wanted = queries.previewsWanted([...DRAWN_FOR], [...DIRECT], DIRECT_MAX);
    return packs
      .map((p) => {
        const had = cost.byPack[p.id.slice(0, 8)];
        return { packId: p.id, name: p.name, bytes: had?.bytes ?? 0, count: had?.count ?? 0, on: usage.previewsOn(p.id), assets: p.assetCount, wanted: wanted.get(p.id) ?? 0 };
      })
      .sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  });
  handle('thumbs:forPack', (packId) => usage.previewsOn(packId));
  handle('thumbs:setForPack', async (packId, on) => {
    usage.setPreviews(packId, on);
    // Turning them off frees what this pack was using at once, rather than waiting for the cap.
    if (!on) await clearFor(thumbDir(), { packs: [packId] });
    thumbs.reset();
    indexChanged();
  });
  // Not awaited anywhere: the job is the answer, and the window watches the activity bar.
  handle('thumbs:build', (packs) => buildPreviews(packs));
  handle('thumbs:stopBuild', () => stopPreviews());
  handle('thumbs:building', () => previewsBuilding());
  handle('thumbs:get', (keys) => thumbs.get(keys.slice(0, 500)));

}
