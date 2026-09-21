import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { PackEdit } from '@shared/pack';
import type { FolderKind, LibraryState } from '@shared/types';
import { UserError } from './errors';
import { LibraryIndex } from './index/indexer';
import { LibraryQueries } from './index/query';
import type { Jobs } from './jobs';
import { createLibrary, DIRS, inspectFolder, readLibraryInfo } from './library/layout';
import { editPack, readPack, type PackRecord } from './library/packs';
import { log } from './log';

interface Deps {
  dataDir: string;
  jobs: Jobs;
  onState: (state: LibraryState) => void;
  /** The index changed: anything showing library data should reload. */
  onIndexChanged: () => void;
}

interface Open {
  root: string;
  index: LibraryIndex;
  queries: LibraryQueries;
}

/**
 * The library that is open: its folder, its index, and keeping the two in step — on opening,
 * whenever files in the folder change, and after the app itself changes something.
 */
export class LibraryService {
  private state: LibraryState = { status: 'none' };
  private current: Open | null = null;
  private watcher: FSWatcher | null = null;
  private syncing: Promise<void> | null = null;
  private syncAgain = false;
  private watchTimer: NodeJS.Timeout | null = null;

  constructor(private readonly d: Deps) {}

  getState(): LibraryState {
    return this.state;
  }

  inspect(path: string): Promise<FolderKind> {
    return inspectFolder(path);
  }

  private setState(state: LibraryState): void {
    this.state = state;
    this.d.onState(state);
  }

  async create(path: string, name: string): Promise<LibraryState> {
    await createLibrary(path, name.trim() || 'Tessera Library');
    return this.open(path);
  }

  async open(path: string): Promise<LibraryState> {
    this.close();
    this.setState({ status: 'opening', path });
    try {
      const info = await readLibraryInfo(path);
      // Each library gets its own index, so switching libraries never mixes them.
      const index = new LibraryIndex(join(this.d.dataDir, 'libraries', info.id, 'index.sqlite'));
      this.current = { root: path, index, queries: new LibraryQueries(index.db) };
      this.setState({ status: 'ready', library: { id: info.id, name: info.name, path }, problems: [] });
      this.startWatching(path);
      void this.sync();
      return this.state;
    } catch (e) {
      const code = e instanceof UserError ? e.code : 'open-failed';
      const message = e instanceof Error ? e.message : String(e);
      log.error('library', `could not open ${path}`, e);
      this.setState({ status: 'error', path, code, message });
      return this.state;
    }
  }

  close(): void {
    this.watcher?.close();
    this.watcher = null;
    this.current?.index.close();
    this.current = null;
    if (this.state.status !== 'none') this.setState({ status: 'none' });
  }

  /** The open library, or a clear error for the window when there is none. */
  require(): Open {
    if (!this.current) throw new UserError('no-library', 'No library is open.');
    return this.current;
  }

  /**
   * Bring the index up to date. Calls while a sync runs are folded into one more sync afterwards,
   * so a burst of file changes costs at most two passes.
   */
  sync(): Promise<void> {
    if (this.syncing) {
      this.syncAgain = true;
      return this.syncing;
    }
    const lib = this.current;
    if (!lib) return Promise.resolve();
    this.syncing = (async () => {
      const job = this.d.jobs.start('Reading the library');
      try {
        const result = await lib.index.sync(lib.root, (done, total, current) => job.update(total ? done / total : null, current));
        if (this.current !== lib) return;
        job.done(result.changed || result.removed ? `${result.changed} changed, ${result.removed} removed` : 'Up to date');
        if (this.state.status === 'ready') this.setState({ ...this.state, problems: result.problems });
        if (result.changed || result.removed) this.d.onIndexChanged();
      } catch (e) {
        job.fail(e);
      } finally {
        this.syncing = null;
        if (this.syncAgain) {
          this.syncAgain = false;
          void this.sync();
        }
      }
    })();
    return this.syncing;
  }

  private startWatching(root: string): void {
    try {
      this.watcher = watch(join(root, DIRS.packs), { recursive: true }, () => {
        if (this.watchTimer) clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => void this.sync(), 1500);
      });
      this.watcher.on('error', (e) => log.warn('library', 'folder watching stopped', e));
    } catch (e) {
      // Without watching, changes made outside the app show up on the next open or manual refresh.
      log.warn('library', 'could not watch the library folder', e);
    }
  }

  /** A pack's record as it is on disk now. */
  async packRecord(id: string): Promise<PackRecord> {
    const lib = this.require();
    const row = lib.queries.pack(id);
    if (!row) throw new UserError('no-pack', 'That pack is no longer in the library.');
    return readPack(join(lib.root, DIRS.packs, row.folder), row.folder);
  }

  async editPack(id: string, edit: PackEdit): Promise<void> {
    const lib = this.require();
    const updated = await editPack(await this.packRecord(id), edit);
    await lib.index.syncPack(updated, lib.index.known(id));
    this.d.onIndexChanged();
  }
}
