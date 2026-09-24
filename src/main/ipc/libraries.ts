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

type Deps = Pick<IpcContext, 'indexChanged' | 'librariesChanged' | 'library' | 'librarySummaries' | 'openRecord' | 'settings' | 'sync' | 'thumbDir' | 'thumbs'>;

export function registerLibraryIpc(c: Deps): void {
  const { indexChanged, librariesChanged, library, librarySummaries, openRecord, settings, sync, thumbDir, thumbs } = c;
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
  handle('thumbs:get', (keys) => thumbs.get(keys.slice(0, 500)));

}
