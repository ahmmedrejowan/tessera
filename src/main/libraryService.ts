import { watch, type FSWatcher } from 'node:fs';
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { missingForLibrary, type PackEdit, type PackStatus } from '@shared/pack';
import type { CollectionItem, CollectionSummary, SmartQuery } from '@shared/collection';
import type { BrowseQuery, Filters } from '@shared/query';
import type { CollectionChange, Detected, FolderKind, ImportItem, ImportResult, LibraryState } from '@shared/types';
import { UserError } from './errors';
import { listPackFiles } from './index/files';
import { LibraryIndex } from './index/indexer';
import { planImport } from './import/plan';
import { runImport } from './import/run';
import { LibraryQueries } from './index/query';
import type { Jobs } from './jobs';
import { createCollection, deleteCollection, listCollections, updateCollection, withItems, withoutItems } from './library/collections';
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
  /** While the app itself is adding packs, file-change syncs wait until it's done. */
  private busyWriting = 0;

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
    this.collectionsSig = '';
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
        // Collections may have changed on disk too (edited on another computer and synced).
        const collectionsChanged = await this.reloadCollections();
        job.done(result.changed || result.removed ? `${result.changed} changed, ${result.removed} removed` : 'Up to date');
        if (this.state.status === 'ready') this.setState({ ...this.state, problems: result.problems });
        if (result.changed || result.removed || collectionsChanged) this.d.onIndexChanged();
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

  /** Read every pack again from scratch. */
  async reindex(): Promise<void> {
    const lib = this.require();
    await this.syncing;
    lib.index.clear();
    this.collectionsSig = '';
    await this.sync();
    this.d.onIndexChanged();
  }

  private startWatching(root: string): void {
    try {
      this.watcher = watch(root, { recursive: true }, () => {
        if (this.watchTimer) clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => (this.busyWriting ? undefined : void this.sync()), 1500);
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

  // ---- collections ----

  private collectionsSig = '';

  /** Mirror collections into the index; true when they differ from last time. */
  private async reloadCollections(): Promise<boolean> {
    const lib = this.current;
    if (!lib) return false;
    const all = await listCollections(lib.root);
    const sig = JSON.stringify(all.map((c) => [c.id, c.updatedAt, c.items.length]));
    if (sig === this.collectionsSig) return false;
    this.collectionsSig = sig;
    lib.index.setCollections(all);
    return true;
  }

  async collections(): Promise<CollectionSummary[]> {
    const lib = this.require();
    const out: CollectionSummary[] = [];
    for (const c of await listCollections(lib.root)) {
      const q: BrowseQuery = c.query
        ? { scope: 'library', text: c.query.text, filters: c.query.filters as Filters, includeSupport: c.query.includeSupport }
        : { scope: 'all', text: '', filters: {}, collectionId: c.id };
      const page = lib.queries.assets(q, 'relevance', 0, 4);
      out.push({
        id: c.id,
        name: c.name,
        description: c.description,
        kind: c.kind,
        count: page.total,
        samples: page.rows.map((r) => ({ packId: r.packId, ref: r.ref, ext: r.ext, kind: r.kind, type: r.type })),
        updatedAt: c.updatedAt,
        query: c.query,
      });
    }
    return out;
  }

  async createCollection(name: string, init: { description?: string; items?: CollectionItem[]; query?: SmartQuery | null }): Promise<string> {
    const c = await createCollection(this.require().root, name.trim() || 'Untitled', init);
    await this.collectionsChanged();
    return c.id;
  }

  async changeCollection(id: string, change: CollectionChange): Promise<void> {
    const root = this.require().root;
    if (change.delete) await deleteCollection(root, id);
    else
      await updateCollection(root, id, (c) => {
        let next = { ...c };
        if (change.name !== undefined) next.name = change.name.trim() || c.name;
        if (change.description !== undefined) next.description = change.description;
        if (change.add) next = withItems(next, change.add);
        if (change.remove) next = withoutItems(next, change.remove);
        return next;
      });
    await this.collectionsChanged();
  }

  private async collectionsChanged(): Promise<void> {
    await this.reloadCollections();
    this.d.onIndexChanged();
  }

  /** What adding these paths would create, with likely duplicates marked. */
  async planImport(paths: string[], eachInside: boolean): Promise<ImportItem[]> {
    const lib = this.require();
    const items = await planImport(paths, eachInside);
    for (const item of items) {
      if (item.sources.length !== 1) continue;
      item.duplicateOf = lib.queries.findDownload(basename(item.sources[0]!), item.size, item.kind === 'folder');
    }
    return items;
  }

  async import(items: ImportItem[], skipInboxWhenSure: boolean): Promise<ImportResult> {
    const lib = this.require();
    this.busyWriting++;
    const job = this.d.jobs.start(items.length === 1 ? `Adding ${items[0]!.name}` : `Adding ${items.length} packs`);
    try {
      const result = await runImport(items, {
        root: lib.root,
        index: lib.index,
        skipInboxWhenSure,
        onProgress: (done, total, current) => job.update(total ? done / total : null, current),
      });
      const inbox = result.added.filter((a) => a.status === 'inbox').length;
      job.done(`${result.added.length} added${inbox ? `, ${inbox} in the Inbox` : ''}${result.failed.length ? `, ${result.failed.length} failed` : ''}`);
      return result;
    } catch (e) {
      job.fail(e);
      throw e;
    } finally {
      this.busyWriting--;
      this.d.onIndexChanged();
    }
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
