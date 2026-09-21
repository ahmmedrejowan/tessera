import { watch, type FSWatcher } from 'node:fs';
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { missingForLibrary, type PackEdit, type PackStatus } from '@shared/pack';
import type { Detected, FolderKind, LibraryState } from '@shared/types';
import { UserError } from './errors';
import { listPackFiles } from './index/files';
import { LibraryIndex } from './index/indexer';
import { LibraryQueries } from './index/query';
import type { Jobs } from './jobs';
import { detectPack } from './library/detect';
import { createLibrary, DIRS, inspectFolder, PACK_DIRS, readLibraryInfo } from './library/layout';
import { safeFolderName, uniqueName } from './library/names';
import { editPack, readPack, writePack, type PackRecord } from './library/packs';
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

  async detect(id: string): Promise<Detected> {
    const pack = await this.packRecord(id);
    const { files } = await listPackFiles(pack.dir);
    return detectPack(pack.dir, files);
  }

  async setStatus(id: string, status: PackStatus): Promise<void> {
    const lib = this.require();
    const pack = await this.packRecord(id);
    if (pack.meta.status === status) return;
    if (status === 'library') {
      const missing = missingForLibrary(pack.meta);
      if (missing.length) throw new UserError('pack-incomplete', `Add ${missing.join(' and ')} before moving this pack to the library.`);
    }
    const meta = await writePack(pack.dir, { ...pack.meta, status });
    await lib.index.syncPack({ ...pack, meta }, lib.index.known(id));
    this.d.onIndexChanged();
  }

  async proofFiles(id: string): Promise<{ name: string; size: number }[]> {
    const pack = await this.packRecord(id);
    const dir = join(pack.dir, PACK_DIRS.licence);
    const out: { name: string; size: number }[] = [];
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.isFile() && !e.name.startsWith('.')) out.push({ name: e.name, size: (await stat(join(dir, e.name))).size });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Copy files into a pack's licence/ folder and record them as proof. */
  async addProof(id: string, files: string[]): Promise<number> {
    const lib = this.require();
    const pack = await this.packRecord(id);
    const dir = join(pack.dir, PACK_DIRS.licence);
    await mkdir(dir, { recursive: true });
    const taken = new Set((await readdir(dir)).map((n) => n.toLowerCase()));
    const added: string[] = [];
    for (const src of files) {
      const ext = extname(src);
      const name = uniqueName(safeFolderName(basename(src, ext)), (c) => taken.has(`${c}${ext}`.toLowerCase())) + ext;
      await copyFile(src, join(dir, name));
      taken.add(name.toLowerCase());
      added.push(name);
    }
    if (added.length) {
      const meta = await writePack(pack.dir, { ...pack.meta, licence: { ...pack.meta.licence, proof: [...new Set([...pack.meta.licence.proof, ...added])] } });
      await lib.index.syncPack({ ...pack, meta }, lib.index.known(id));
      this.d.onIndexChanged();
    }
    return added.length;
  }

  async proofPath(id: string, name: string): Promise<string> {
    const pack = await this.packRecord(id);
    if (name.includes('/') || name.includes('\\') || name.startsWith('.')) throw new UserError('bad-name', 'That file is not in the pack.');
    return join(pack.dir, PACK_DIRS.licence, name);
  }

  async editPack(id: string, edit: PackEdit): Promise<void> {
    const lib = this.require();
    const updated = await editPack(await this.packRecord(id), edit);
    await lib.index.syncPack(updated, lib.index.known(id));
    this.d.onIndexChanged();
  }
}
