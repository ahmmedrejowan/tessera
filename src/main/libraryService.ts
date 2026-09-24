import { createHash } from 'node:crypto';
import { readdirSync, watch, type Dirent, type FSWatcher } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { isIgnored } from '@shared/assets';
import { missingForLibrary, type PackEdit, type PackStatus } from '@shared/pack';
import { FAVOURITES, refuses, type CollectionItem, type CollectionRules, type CollectionSummary, type SmartQuery } from '@shared/collection';
import type { BrowseQuery, Filters, PackRow } from '@shared/query';
import type { BinEntry, CollectionChange, CollectionResult, Detected, FolderKind, ImportItem, ImportResult, LibraryState, PackSuggestions, SiteRule } from '@shared/types';
import { UserError } from './errors';
import { listPackFiles, parseRef } from './index/files';
import { LibraryIndex } from './index/indexer';
import { planImport } from './import/plan';
import { copyTree, runImport } from './import/run';
import { LibraryQueries } from './index/query';
import type { Jobs } from './jobs';
import { createCollection, deleteCollection, favourites, listCollections, updateCollection, withItems, withoutItems, withPacks, withoutPacks } from './library/collections';
import { detectPack, partLicences, packTexts } from './library/detect';
import { suggestDetails } from './import/suggest';
import { createLibrary, DIRS, inspectFolder, MARKER, PACK_DIRS, readLibraryInfo } from './library/layout';
import { safeFolderName, uniqueName } from './library/names';
import { binFiles, binPack, emptyBin, readBin, restoreFromBin, sweepBin } from './library/bin';
import { editPack, readPack, writePack, type PackRecord } from './library/packs';
import { writeJson } from './fsx';
import { log } from './log';

interface Deps {
  dataDir: string;
  jobs: Jobs;
  onState: (state: LibraryState) => void;
  /** The index changed: anything showing library data should reload. */
  onIndexChanged: () => void;
  /** The user's own rules for sites, read whenever a pack's licence is worked out. */
  siteRules: () => SiteRule[];
  /** How long deleted things wait in the library's bin before they go for good; 0 keeps them. */
  binKeepDays: () => number;
}

interface Open {
  root: string;
  index: LibraryIndex;
  queries: LibraryQueries;
}

/**
 * The library that is open: its folder, its index, and keeping the two in step: on opening,
 * whenever files in the folder change, and after the app itself changes something.
 */
export class LibraryService {
  private state: LibraryState = { status: 'none' };
  private current: Open | null = null;
  private watcher: FSWatcher | null = null;
  /** Where a whole tree cannot be watched at once, one watcher per folder instead. */
  private watchers: FSWatcher[] = [];
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

  /** Give the open library a new name (its folder keeps its own). */
  async rename(name: string): Promise<LibraryState> {
    if (this.state.status !== 'ready') throw new UserError('no-library', 'No library is open.');
    const clean = name.trim();
    if (!clean) throw new UserError('no-name', 'Give the library a name.');
    if (clean.length > 120) throw new UserError('long-name', 'That name is too long.');
    const root = this.state.library.path;
    const info = await readLibraryInfo(root);
    await writeJson(join(root, MARKER), { ...info, name: clean });
    this.setState({ ...this.state, library: { ...this.state.library, name: clean } });
    return this.state;
  }

  close(): void {
    this.watcher?.close();
    this.watcher = null;
    for (const w of this.watchers.splice(0)) w.close();
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
        // Anything sitting in the bin longer than the user allows goes for good, and what is left
        // decides which files are hidden.
        await sweepBin(lib.root, this.d.binKeepDays()).catch(() => 0);
        lib.index.setHidden((await readBin(lib.root)).filter((e) => e.kind === 'file' && e.hiddenOnly).map((e) => ({ packId: e.packId, ref: e.ref })));
        job.done(result.changed || result.removed ? `${result.changed} changed, ${result.removed} removed` : 'Up to date');
        if (this.state.status === 'ready') this.setState({ ...this.state, problems: result.problems });
        if (result.changed || result.removed || collectionsChanged) this.d.onIndexChanged();
        // Where each folder is watched on its own, a pack that has just appeared needs watching too.
        if (this.watchers.length && (result.changed || result.removed)) this.startWatching(lib.root);
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

  /**
   * Notice files changing under the library. macOS and Windows can watch a whole tree at once;
   * Linux cannot, so there each pack folder is watched, and the packs folder itself, which is
   * where a new pack appears. Either way the answer is the same: read the library again, once the
   * changes have stopped coming.
   */
  private startWatching(root: string): void {
    const soon = () => {
      if (this.watchTimer) clearTimeout(this.watchTimer);
      this.watchTimer = setTimeout(() => (this.busyWriting ? undefined : void this.sync()), 1500);
    };
    const watchOne = (dir: string, recursive: boolean): FSWatcher | null => {
      try {
        const w = watch(dir, { recursive }, soon);
        w.on('error', (e) => log.warn('library', `watching ${dir} stopped`, e));
        return w;
      } catch (e) {
        log.info('library', `could not watch ${dir}`, e);
        return null;
      }
    };
    for (const w of this.watchers.splice(0)) w.close();
    const whole = this.watcher ?? (process.platform === 'linux' ? null : watchOne(root, true));
    if (whole) {
      this.watcher = whole;
      return;
    }
    // One watcher for the library, one for the packs folder, and one for each pack in it.
    const dirs = [root, join(root, DIRS.packs), join(root, DIRS.collections)];
    let packs: Dirent[] = [];
    try {
      packs = readdirSync(join(root, DIRS.packs), { withFileTypes: true });
    } catch {
      // A library with no packs folder yet: the watcher on the library itself will see it appear.
    }
    for (const entry of packs) if (entry.isDirectory()) dirs.push(join(root, DIRS.packs, entry.name));
    this.watchers = dirs.map((d) => watchOne(d, false)).filter((w): w is FSWatcher => !!w);
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
    return detectPack(pack.dir, files, { rules: this.d.siteRules(), url: pack.meta.source.url });
  }

  /** Licence files inside a pack: parts of it that may come under terms of their own. */
  async partLicences(id: string): Promise<{ path: string; licence: string; from: string }[]> {
    const pack = await this.packRecord(id);
    const { files } = await listPackFiles(pack.dir);
    return partLicences(pack.dir, files);
  }

  /**
   * What was found in a pack and what it suggests, for the add page: the licence and source (as
   * detected, with where from) and details worth filling in (name, version, description, style, tags).
   */
  async details(id: string): Promise<{ detected: Detected; suggestions: PackSuggestions }> {
    const pack = await this.packRecord(id);
    const { files } = await listPackFiles(pack.dir);
    const download = (await readdir(join(pack.dir, PACK_DIRS.original)).catch(() => [] as string[])).find((n) => !n.startsWith('.')) ?? pack.meta.name;
    const [detected, texts] = await Promise.all([detectPack(pack.dir, files, { downloadName: download, rules: this.d.siteRules(), url: pack.meta.source.url }), packTexts(pack.dir, files)]);
    return { detected, suggestions: suggestDetails({ files, texts, downloadName: download }) };
  }

  /**
   * Forget a pack that was only just added (the add page's Cancel): its copy is deleted outright,
   * as the user's own download is where it always was. Only packs not yet in the library.
   */
  async discardPack(id: string): Promise<void> {
    const lib = this.require();
    const pack = await this.packRecord(id);
    if (pack.meta.status !== 'inbox') throw new UserError('pack-in-library', 'That pack is already in the library.');
    this.busyWriting++;
    try {
      await rm(pack.dir, { recursive: true, force: true });
      lib.index.removePack(id);
    } finally {
      this.busyWriting--;
    }
    this.d.onIndexChanged();
  }

  /** Keep a file made for a pack (a snapshot of its download page, say) with its licence proof. */
  async saveProof(id: string, name: string, data: Buffer, note?: string): Promise<string> {
    const lib = this.require();
    const pack = await this.packRecord(id);
    const dir = join(pack.dir, PACK_DIRS.licence);
    await mkdir(dir, { recursive: true });
    const taken = new Set((await readdir(dir)).map((n) => n.toLowerCase()));
    const ext = extname(name);
    const file = uniqueName(safeFolderName(basename(name, ext)), (c) => taken.has(`${c}${ext}`.toLowerCase())) + ext;
    await writeFile(join(dir, file), data);
    const fresh = await this.packRecord(id);
    const notes = note ? [fresh.meta.licence.notes, note].filter(Boolean).join('\n') : fresh.meta.licence.notes;
    const meta = await writePack(fresh.dir, { ...fresh.meta, licence: { ...fresh.meta.licence, notes, proof: [...new Set([...fresh.meta.licence.proof, file])] } });
    await lib.index.syncPack({ ...fresh, meta }, lib.index.known(id));
    this.d.onIndexChanged();
    return file;
  }

  /** Add a line to a pack's licence notes (where an archived copy of its page is, say). */
  async addLicenceNote(id: string, line: string): Promise<void> {
    const lib = this.require();
    const pack = await this.packRecord(id);
    const meta = await writePack(pack.dir, { ...pack.meta, licence: { ...pack.meta.licence, notes: [pack.meta.licence.notes, line].filter(Boolean).join('\n') } });
    await lib.index.syncPack({ ...pack, meta }, lib.index.known(id));
    this.d.onIndexChanged();
  }

  // ---- collections ----

  private collectionsSig = '';

  /** Mirror collections into the index; true when they differ from last time. */
  private async reloadCollections(): Promise<boolean> {
    const lib = this.current;
    if (!lib) return false;
    const all = await listCollections(lib.root);
    // What they hold, not when they were touched: two changes in the same millisecond are still
    // two changes, and the one that starred a pack must not be the one that goes unnoticed.
    const sig = createHash('sha1').update(JSON.stringify(all.map((c) => [c.id, c.name, c.items, c.packs, c.rules, c.query, c.projectId]))).digest('hex');
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
        ? { scope: 'library', text: c.query.text, filters: c.query.filters as Filters, includeSupport: c.query.includeSupport, favourites: c.query.favourites }
        : { scope: 'all', text: '', filters: {}, collectionId: c.id };
      const page = lib.queries.assets(q, 'relevance', 0, 4);
      const samples = page.rows.map((r) => ({ packId: r.packId, ref: r.ref, ext: r.ext, kind: r.kind, type: r.type }));
      // A collection of whole packs shows their covers, so its card isn't blank.
      if (samples.length < 4 && c.packs.length) {
        for (const pack of lib.queries.packs({ scope: 'all', text: '', filters: {}, collectionId: c.id }, 'name', 0, 4 - samples.length).rows) {
          const cover = pack.samples[0];
          if (cover) samples.push({ packId: pack.id, ref: pack.coverRef ?? cover.ref, ext: cover.ext, kind: cover.kind, type: cover.type });
        }
      }
      out.push({
        id: c.id,
        name: c.name,
        description: c.description,
        kind: c.kind,
        count: page.total,
        packCount: c.query ? 0 : c.packs.length,
        // What it really holds: the loose assets plus everything inside its packs.
        assets: page.total + (c.query ? 0 : lib.queries.packs({ scope: 'all', text: '', filters: {}, collectionId: c.id }, 'name', 0, 500).rows.reduce((n, p) => n + p.assetCount, 0)),
        rules: c.rules,
        projectId: c.projectId,
        samples,
        updatedAt: c.updatedAt,
        query: c.query,
      });
    }
    return out;
  }

  /**
   * The collections a pack, or one of its files, belongs to. Saved searches are left out: they
   * hold whatever matches them at the time, so there is nothing to take a thing out of.
   */
  async collectionsHolding(packId: string, ref?: string): Promise<{ id: string; name: string }[]> {
    const out: { id: string; name: string }[] = [];
    for (const c of await listCollections(this.require().root)) {
      if (c.kind === 'smart') continue;
      const holds = ref ? c.items.some((i) => i.packId === packId && i.ref === ref) : c.packs.includes(packId);
      if (holds) out.push({ id: c.id, name: c.name });
    }
    return out;
  }

  async createCollection(name: string, init: { description?: string; items?: CollectionItem[]; packs?: string[]; query?: SmartQuery | null; rules?: CollectionRules; projectId?: string | null }): Promise<string> {
    const c = await createCollection(this.require().root, name.trim() || 'Untitled', init);
    await this.collectionsChanged();
    return c.id;
  }

  async changeCollection(id: string, change: CollectionChange): Promise<CollectionResult> {
    const root = this.require().root;
    const result: CollectionResult = { added: 0, addedPacks: 0, refused: [] };
    if (change.delete) await deleteCollection(root, id);
    else
      await updateCollection(root, id, (c) => {
        let next = { ...c };
        if (change.name !== undefined) next.name = change.name.trim() || c.name;
        if (change.description !== undefined) next.description = change.description;
        if (change.rules) next.rules = change.rules;
        if (change.projectId !== undefined) next.projectId = change.projectId;
        // The rules the collection will have after this change are the ones that judge what joins.
        const sift = this.sifter(next.rules);
        if (change.add) {
          const { taken, refused } = sift.assets(change.add);
          result.added = taken.length;
          result.refused.push(...refused);
          next = withItems(next, taken);
        }
        if (change.remove) next = withoutItems(next, change.remove);
        if (change.addPacks) {
          const { taken, refused } = sift.packs(change.addPacks);
          result.addedPacks = taken.length;
          result.refused.push(...refused);
          next = withPacks(next, taken);
        }
        if (change.removePacks) next = withoutPacks(next, change.removePacks);
        return next;
      });
    await this.collectionsChanged();
    return result;
  }

  /** Judges what a collection's rules will take, packs and assets alike. */
  private sifter(rules: CollectionRules) {
    const lib = this.require();
    const packOf = new Map<string, PackRow | null>();
    const pack = (id: string) => {
      if (!packOf.has(id)) packOf.set(id, lib.queries.pack(id));
      return packOf.get(id) ?? null;
    };
    return {
      packs: (ids: string[]) => {
        const taken: string[] = [];
        const refused: { name: string; why: string }[] = [];
        for (const id of ids) {
          const p = pack(id);
          if (!p) continue;
          const why = refuses(rules, { name: p.name, licence: p.licence, creator: p.creator, styles: p.styles, tags: p.tags, types: Object.keys(p.types) });
          if (why) refused.push({ name: p.name, why });
          else taken.push(id);
        }
        return { taken, refused };
      },
      assets: (items: CollectionItem[]) => {
        const taken: CollectionItem[] = [];
        const refused: { name: string; why: string }[] = [];
        for (const item of items) {
          const p = pack(item.packId);
          const a = lib.queries.assetByRef(item.packId, item.ref);
          if (!p || !a) {
            taken.push(item);
            continue;
          }
          // An asset carries the licence of the part of the pack it is in, which may not be the pack's.
          const why = refuses(rules, { name: a.name, licence: a.licence, creator: p.creator, styles: p.styles, tags: p.tags, types: [a.type] });
          if (why) refused.push({ name: a.name, why });
          else taken.push(item);
        }
        return { taken, refused };
      },
    };
  }

  /** Star assets, or take the star off: they go in and out of the built-in Favourites collection. */
  async favouriteAssets(items: CollectionItem[], on: boolean): Promise<void> {
    const root = this.require().root;
    await favourites(root);
    await updateCollection(root, FAVOURITES, (c) => (on ? withItems(c, items) : withoutItems(c, items)));
    await this.collectionsChanged();
  }

  /** Star a pack: it joins the built-in Favourites collection, as a starred asset does. */
  async favouritePack(id: string, on: boolean): Promise<void> {
    const root = this.require().root;
    await favourites(root);
    await updateCollection(root, FAVOURITES, (c) => (on ? withPacks(c, [id]) : withoutPacks(c, [id])));
    await this.collectionsChanged();
  }

  /** Put a pack away, or bring it back: kept in full either way, just out of the way of browsing. */
  async archivePack(id: string, on: boolean): Promise<void> {
    const lib = this.require();
    const pack = await this.packRecord(id);
    if (pack.meta.archived === on) return;
    const meta = await writePack(pack.dir, { ...pack.meta, archived: on });
    await lib.index.syncPack({ ...pack, meta }, lib.index.known(id));
    this.d.onIndexChanged();
  }

  private async collectionsChanged(): Promise<void> {
    await this.reloadCollections();
    this.d.onIndexChanged();
  }

  /** What adding these paths would create, with likely duplicates marked. */
  async planImport(paths: string[], eachInside: boolean | 'auto'): Promise<ImportItem[]> {
    const lib = this.require();
    const items = await planImport(paths, eachInside);
    for (const item of items) {
      if (item.sources.length !== 1) continue;
      item.duplicateOf = lib.queries.findDownload(basename(item.sources[0]!), item.size, item.kind === 'folder');
    }
    return items;
  }

  async import(items: ImportItem[], skipInboxWhenSure: boolean, stage = false): Promise<ImportResult> {
    const lib = this.require();
    this.busyWriting++;
    const job = this.d.jobs.start(items.length === 1 ? `Adding ${items[0]!.name}` : `Adding ${items.length} packs`);
    try {
      const result = await runImport(items, {
        root: lib.root,
        index: lib.index,
        skipInboxWhenSure,
        siteRules: this.d.siteRules(),
        stage,
        onProgress: (done, total, current) => job.update(total ? done / total : null, current),
      });
      const inbox = result.added.filter((a) => a.status === 'inbox').length;
      job.done(`${result.added.length} added${inbox ? `, ${inbox} to review` : ''}${result.failed.length ? `, ${result.failed.length} failed` : ''}`);
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

  /**
   * Put more files into a pack that is already in the library: the thing a person wants when a
   * download turns out to be missing a piece, or when they made something that belongs with it.
   * The files are copied in as they are, under `into` if one is given, and the pack is read again.
   */
  async addFilesToPack(id: string, paths: string[], into?: string): Promise<{ added: number; names: string[] }> {
    const lib = this.require();
    const pack = await this.packRecord(id);
    if (!paths.length) return { added: 0, names: [] };
    const folder = (into ?? '').split('/').filter((p) => p && p !== '.' && p !== '..').map(safeFolderName).join('/');
    const dir = join(pack.dir, PACK_DIRS.original, folder);
    await mkdir(dir, { recursive: true });
    const taken = new Set((await readdir(dir).catch(() => [])).map((n) => n.toLowerCase()));
    const names: string[] = [];
    this.busyWriting++;
    try {
      for (const src of paths) {
        const ext = extname(src);
        const stem = basename(src, ext);
        // Two files of the same name can both belong here, so the second one is numbered.
        const name = uniqueName(stem, (c) => taken.has(`${c}${ext}`.toLowerCase())) + ext;
        await copyTree(src, join(dir, name), () => undefined);
        taken.add(name.toLowerCase());
        names.push(folder ? `${folder}/${name}` : name);
      }
    } finally {
      this.busyWriting--;
    }
    if (names.length) {
      await lib.index.syncPack(await this.packRecord(id), lib.index.known(id));
      this.d.onIndexChanged();
    }
    return { added: names.length, names };
  }

  /** The folders inside a pack, so files can be put where they belong. */
  async packFolders(id: string): Promise<string[]> {
    const pack = await this.packRecord(id);
    const root = join(pack.dir, PACK_DIRS.original);
    const out: string[] = [];
    const walk = async (dir: string, prefix: string, depth: number): Promise<void> => {
      if (depth > 3) return;
      for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (!e.isDirectory() || isIgnored(e.name)) continue;
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        out.push(rel);
        await walk(join(dir, e.name), rel, depth + 1);
      }
    };
    await walk(root, '', 0);
    return out.sort((a, b) => a.localeCompare(b));
  }

  async proofPath(id: string, name: string): Promise<string> {
    const pack = await this.packRecord(id);
    if (name.includes('/') || name.includes('\\') || name.startsWith('.')) throw new UserError('bad-name', 'That file is not in the pack.');
    return join(pack.dir, PACK_DIRS.licence, name);
  }

  /** Take a pack out of the library, into the library's own bin, where it waits to be put back. */
  async removePack(id: string): Promise<string> {
    const lib = this.require();
    const pack = await this.packRecord(id);
    const row = lib.queries.pack(id);
    this.busyWriting++;
    try {
      await binPack(lib.root, id, pack.meta.name, basename(pack.dir), pack.dir, row?.size ?? 0);
      lib.index.removePack(id);
    } finally {
      this.busyWriting--;
    }
    await this.binChanged();
    return pack.meta.name;
  }

  /**
   * Take single files out of their packs, into the library's bin so they can be put back. A
   * file that lives inside a pack's archive can't be taken out on its own and is left alone; the
   * count of those comes back so the window can say so.
   */
  async removeFiles(items: { packId: string; ref: string }[]): Promise<{ removed: number; inArchive: number; failed: number }> {
    const lib = this.require();
    const byPack = new Map<string, { ref: string; size: number; inArchive: boolean }[]>();
    let inArchive = 0;
    for (const { packId, ref } of items) {
      const inside = parseRef(ref).inside.length > 0;
      if (inside) inArchive++;
      const list = byPack.get(packId) ?? [];
      // A file inside an archive is recorded by its own ref; a loose one by the file on disk.
      list.push({ ref: inside ? ref : parseRef(ref).file, size: lib.queries.assetByRef(packId, ref)?.size ?? 0, inArchive: inside });
      byPack.set(packId, list);
    }
    let removed = 0;
    let failed = 0;
    this.busyWriting++;
    try {
      for (const [packId, refs] of byPack) {
        const pack = await this.packRecord(packId);
        const done: typeof refs = [];
        for (const r of refs) {
          try {
            // Moving happens one at a time so one unreadable file doesn't stop the rest.
            await binFiles(lib.root, pack.dir, packId, pack.meta.name, [r]);
            done.push(r);
            if (!r.inArchive) removed++;
          } catch {
            failed++;
          }
        }
        if (done.some((r) => !r.inArchive)) await lib.index.syncPack(pack, lib.index.known(packId));
      }
    } finally {
      this.busyWriting--;
    }
    await this.binChanged();
    return { removed: removed + inArchive - failed, inArchive, failed };
  }

  /** What is waiting in the library's bin, newest first. */
  bin(): Promise<BinEntry[]> {
    return readBin(this.require().root);
  }

  /** Put something back where it came from. */
  async restoreFromBin(id: string): Promise<BinEntry | null> {
    const lib = this.require();
    this.busyWriting++;
    let entry: BinEntry | null = null;
    try {
      entry = await restoreFromBin(lib.root, id, (packId) => join(lib.root, DIRS.packs, this.folderOf(packId)), join(lib.root, DIRS.packs));
    } finally {
      this.busyWriting--;
    }
    if (entry) {
      await this.sync();
      await this.binChanged();
    }
    return entry;
  }

  /** Throw away what is in the bin, for good. */
  async emptyBin(ids?: string[]): Promise<number> {
    const n = await emptyBin(this.require().root, ids);
    if (n) await this.binChanged();
    return n;
  }

  /** The folder of a pack that may no longer be in the index (it is in the bin). */
  private folderOf(packId: string): string {
    return this.require().queries.pack(packId)?.folder ?? packId;
  }

  /** Tell the index what is hidden (files in the bin that couldn't be moved) and the window to reload. */
  private async binChanged(): Promise<void> {
    const lib = this.require();
    lib.index.setHidden((await readBin(lib.root)).filter((e) => e.kind === 'file' && e.hiddenOnly).map((e) => ({ packId: e.packId, ref: e.ref })));
    this.d.onIndexChanged();
  }

  async editPack(id: string, edit: PackEdit): Promise<void> {
    const lib = this.require();
    const updated = await editPack(await this.packRecord(id), edit);
    await lib.index.syncPack(updated, lib.index.known(id));
    this.d.onIndexChanged();
  }
}
