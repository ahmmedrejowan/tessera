import { z } from 'zod';
import { assetPath } from '@shared/assets';
import { linksIn } from '@shared/links';
import { NO_RULES, type CollectionItem } from '@shared/collection';
import { LICENCES } from '@shared/licences';
import { missingForLibrary, type PackEdit } from '@shared/pack';
import type { AssetSort, BrowseQuery, Facet, PackSort } from '@shared/query';
import type { ToolGroup } from '@shared/mcp';

/**
 * What an agent can do with a library. Each tool is written once here: the server registers it,
 * the tools page lists it and the skill file is written from it, so the three can't drift apart.
 *
 * The descriptions carry the rules of the place, because that is what makes an agent competent:
 * a pack needs a licence and a source before it leaves Review, deleting means the bin, archiving
 * keeps everything, and linking copies files into a game's folder.
 */

/** Everything a tool is given to do its work: the same services the window's own calls use. */
export interface ToolContext {
  library: import('../libraryService').LibraryService;
  projects: import('../projects/service').ProjectService;
  downloads: import('../downloads/service').DownloadService;
  copySource: () => import('../projects/copy').CopySource;
  libraryId: () => string;
  /** Write what an agent did into the library's activity, so it can always be seen. */
  note: (text: string, detail?: string) => void;
  settings: () => import('@shared/types').Settings;
  /** The app itself: the libraries it knows, its settings, and what has been happening. */
  app: {
    libraries: () => Promise<import('@shared/types').LibrarySummary[]>;
    openLibrary: (path: string) => Promise<import('@shared/types').LibraryState>;
    createLibrary: (path: string, name: string) => Promise<import('@shared/types').LibraryState>;
    closeLibrary: () => Promise<void>;
    updateSettings: (patch: Partial<import('@shared/types').Settings>) => Promise<import('@shared/types').Settings>;
    activity: (limit: number) => Promise<import('@shared/types').ActivityEntry[]>;
    backUpNow: () => Promise<unknown>;
    reindex: () => Promise<void>;
  };
}

export interface Tool<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  group: ToolGroup;
  title: string;
  /** What it does and when to reach for it, in the app's own words. */
  summary: string;
  input: T;
  run: (args: z.infer<T>, ctx: ToolContext) => Promise<unknown>;
}

const define = <T extends z.ZodTypeAny>(tool: Tool<T>): Tool => tool as unknown as Tool;

const scope = z.enum(['library', 'inbox', 'all']).default('library').describe('library: what you can browse. inbox: packs waiting in Review. all: both.');
const filters = z
  .record(z.string(), z.array(z.string()))
  .optional()
  .describe('Narrow by facet: type, format, source, creator, licence, genre, style, tag. Values within a facet are ORed, facets are ANDed.');

/** A pack as an agent sees it: enough to decide, not the whole record. */
const packOut = (p: import('@shared/query').PackRow) => ({
  id: p.id,
  name: p.name,
  licence: p.licence,
  creator: p.creator,
  source: p.source,
  assets: p.assetCount,
  files: p.fileCount,
  bytes: p.size,
  kinds: p.types,
  tags: p.tags,
  styles: p.styles,
  starred: p.fav,
  archived: p.archived,
  status: p.status,
});

const assetOut = (a: import('@shared/query').AssetRow) => ({
  id: a.id,
  name: a.name,
  packId: a.packId,
  pack: a.packName,
  path: assetPath(a.ref),
  ref: a.ref,
  type: a.type,
  format: a.ext,
  formats: a.formats,
  bytes: a.size,
  licence: a.licence,
  starred: a.fav,
});

const ASSET_SORTS: AssetSort[] = ['relevance', 'name', 'added', 'size', 'pack', 'type'];
const PACK_SORTS: PackSort[] = ['name', 'added', 'size', 'count'];

/** The files of a pack as the window counts them: its assets, not the archive that holds them. */
const packAssets = (ctx: ToolContext, packId: string): { packId: string; ref: string }[] =>
  ctx.library
    .require()
    .queries.assets({ scope: 'all', text: '', filters: {}, packIds: [packId] }, 'name', 0, 100_000)
    .rows.map((a) => ({ packId: a.packId, ref: a.ref }));

const query = (args: { text?: string; filters?: Record<string, string[]>; scope?: 'library' | 'inbox' | 'all'; starred?: boolean }): BrowseQuery => ({
  scope: args.scope ?? 'library',
  text: args.text ?? '',
  filters: (args.filters ?? {}) as Partial<Record<Facet, string[]>>,
  ...(args.starred ? { favourites: true } : {}),
});

export const TOOLS: Tool[] = [
  // ---- Looking ----
  define({
    name: 'library_status',
    group: 'read',
    title: 'Library status',
    summary: 'Which library is open, what is in it, and what needs attention. Call this first: every other tool works on the open library.',
    input: z.object({}),
    run: async (_args, ctx) => {
      const state = ctx.library.getState();
      if (state.status !== 'ready') return { open: false, state: state.status };
      const stats = ctx.library.require().queries.stats();
      const health = ctx.library.require().queries.health();
      return {
        open: true,
        name: state.library.name,
        path: state.library.path,
        packs: stats.packs,
        assets: stats.assets,
        bytes: stats.size,
        archived: stats.archived,
        waitingInReview: stats.inbox,
        needsAttention: { noLicence: health.noLicence.length, noSource: health.noSource.length, noCreditLine: health.noCreditLine.length },
      };
    },
  }),
  define({
    name: 'search',
    group: 'read',
    title: 'Search the library',
    summary: 'Find packs or assets by words, with the same search the app uses. Words match file names, folders and the pack\'s own words.',
    input: z.object({
      text: z.string().default('').describe('What to look for. Empty lists everything that matches the filters.'),
      of: z.enum(['assets', 'packs']).default('assets').describe('Whether to look for single files or whole packs.'),
      filters,
      scope,
      starred: z.boolean().default(false).describe('Only what the owner starred.'),
      sort: z.string().default('relevance').describe('assets: relevance, name, added, size, pack, type. packs: name, added, size, count.'),
      limit: z.number().int().min(1).max(200).default(20),
      offset: z.number().int().min(0).default(0),
    }),
    run: async (args, ctx) => {
      const q = ctx.library.require().queries;
      if (args.of === 'packs') {
        // "relevance" is the default for assets and means nothing for packs: fall back by name.
        const sort = (PACK_SORTS.includes(args.sort as PackSort) ? args.sort : 'name') as PackSort;
        const page = q.packs(query(args), sort, args.offset, args.limit);
        return { total: page.total, packs: page.rows.map(packOut) };
      }
      const sort = (ASSET_SORTS.includes(args.sort as AssetSort) ? args.sort : 'relevance') as AssetSort;
      const page = q.assets(query(args), sort, args.offset, args.limit);
      return { total: page.total, assets: page.rows.map(assetOut) };
    },
  }),
  define({
    name: 'get_pack',
    group: 'read',
    title: 'One pack in full',
    summary: 'Everything recorded about a pack: its licence (and any part of it under different terms), where it came from, its description, tags and proof files.',
    input: z.object({ packId: z.string() }),
    run: async (args, ctx) => {
      const pack = ctx.library.require().queries.pack(args.packId);
      if (!pack) throw new Error(`No pack with id ${args.packId}.`);
      const proof = await ctx.library.proofFiles(args.packId).catch(() => []);
      return {
        ...packOut(pack),
        folder: pack.folder,
        version: pack.meta.version,
        description: pack.meta.description,
        notes: pack.meta.notes,
        addedAt: pack.addedAt,
        sourceUrl: pack.meta.source.url,
        creditLine: pack.meta.licence.attribution,
        partsWithTheirOwnLicence: pack.meta.licences.map((r) => ({ path: r.path, licence: r.licence.id, creditLine: r.licence.attribution })),
        proof: proof.map((f) => f.name),
        problems: pack.problems,
      };
    },
  }),
  define({
    name: 'list_files',
    group: 'read',
    title: 'The files in a pack',
    summary: 'Every file of one pack, one by one, with the licence covering each. Use it when you need a particular file rather than the pack.',
    input: z.object({
      packId: z.string(),
      only: z.enum(['assets', 'everything']).default('assets').describe('assets: the files that count as assets. everything: supporting files and documents too.'),
      limit: z.number().int().min(1).max(2000).default(200),
      offset: z.number().int().min(0).default(0),
    }),
    run: async (args, ctx) => {
      const all = ctx.library.require().queries.packFiles(args.packId);
      const wanted = args.only === 'assets' ? all.filter((f) => f.role === 'main') : all;
      return { total: wanted.length, files: wanted.slice(args.offset, args.offset + args.limit).map(assetOut) };
    },
  }),
  define({
    name: 'get_asset',
    group: 'read',
    title: 'One file in full',
    summary: 'What is known about a single file, including which pack it belongs to and the licence covering it.',
    input: z.object({ assetId: z.number().int().describe('From a search result.') }),
    run: async (args, ctx) => {
      const asset = ctx.library.require().queries.asset(args.assetId);
      if (!asset) throw new Error(`No file with id ${args.assetId}.`);
      const variants = ctx.library.require().queries.variants(args.assetId);
      return { ...assetOut(asset), otherFormats: variants.filter((v) => v.id !== asset.id).map(assetOut) };
    },
  }),
  define({
    name: 'list_facets',
    group: 'read',
    title: 'What the library is filed under',
    summary: 'The kinds, formats, sources, creators, licences, genres, styles and tags in use, with how many things carry each. Use it to pick filter values that exist.',
    input: z.object({ of: z.enum(['assets', 'packs']).default('assets'), text: z.string().default(''), filters, scope }),
    run: async (args, ctx) => ctx.library.require().queries.facets(query(args), args.of),
  }),
  define({
    name: 'list_collections',
    group: 'read',
    title: 'Collections',
    summary: 'The collections in this library: what each holds, the rules it insists on, and the game it is for.',
    input: z.object({}),
    run: async (_args, ctx) => (await ctx.library.collections()).map((c) => ({ id: c.id, name: c.name, description: c.description, kind: c.kind, packs: c.packCount, assets: c.assets, rules: c.rules, forGame: c.projectId })),
  }),
  define({
    name: 'list_projects',
    group: 'read',
    title: 'Games',
    summary: 'The games this library links assets into, with how much each has taken.',
    input: z.object({}),
    run: async (_args, ctx) => (await ctx.projects.list(ctx.libraryId())).map((p) => ({ id: p.id, name: p.name, engine: p.engine, path: p.path, assets: p.assets, packs: p.packs, exists: p.exists })),
  }),
  define({
    name: 'usage',
    group: 'read',
    title: 'Where a pack is used',
    summary: 'Which games have files from these packs, and how many. Worth checking before archiving or deleting one.',
    input: z.object({ packIds: z.array(z.string()).min(1) }),
    run: async (args, ctx) => ctx.projects.usage(ctx.libraryId(), args.packIds),
  }),
  define({
    name: 'list_review',
    group: 'read',
    title: 'What is waiting in Review',
    summary: 'Packs that cannot join the library yet, and what each still needs. A pack needs both a licence and a source.',
    input: z.object({}),
    run: async (_args, ctx) => {
      const page = ctx.library.require().queries.packs({ scope: 'inbox', text: '', filters: {} }, 'added', 0, 200);
      return page.rows.map((p) => ({ ...packOut(p), needs: [p.licence ? null : 'licence', p.source ? null : 'source'].filter(Boolean) }));
    },
  }),
  define({
    name: 'list_bin',
    group: 'read',
    title: 'What is in the bin',
    summary: 'Everything deleted from this library, waiting to be put back or emptied. Emptying the bin is the one thing an agent cannot do.',
    input: z.object({}),
    run: async (_args, ctx) => ctx.library.bin(),
  }),

  // ---- Filing ----
  define({
    name: 'star',
    group: 'organise',
    title: 'Star or unstar',
    summary: 'Star packs or single files so they come first everywhere and gather in the Favourites collection.',
    input: z.object({
      packIds: z.array(z.string()).default([]),
      assetIds: z.array(z.number().int()).default([]),
      on: z.boolean().default(true).describe('false takes the star off.'),
    }),
    run: async (args, ctx) => {
      for (const id of args.packIds) await ctx.library.favouritePack(id, args.on);
      if (args.assetIds.length) await ctx.library.favouriteAssets(ctx.library.require().queries.refs(args.assetIds), args.on);
      const n = args.packIds.length + args.assetIds.length;
      ctx.note(`An agent ${args.on ? 'starred' : 'took the star off'} ${n} thing${n === 1 ? '' : 's'}`);
      return { starred: args.on, packs: args.packIds.length, assets: args.assetIds.length };
    },
  }),
  define({
    name: 'create_collection',
    group: 'organise',
    title: 'Make a collection',
    summary: 'Gather packs and files for one game or one job. Rules make it refuse anything that does not fit, which is the point of them.',
    input: z.object({
      name: z.string().min(1),
      description: z.string().default(''),
      packIds: z.array(z.string()).default([]),
      assetIds: z.array(z.number().int()).default([]),
      forGame: z.string().nullable().default(null).describe('A project id: everything in it can then be linked to that game at once.'),
      rules: z
        .object({
          licences: z.array(z.string()).default([]),
          creators: z.array(z.string()).default([]),
          styles: z.array(z.string()).default([]),
          tags: z.array(z.string()).default([]),
          types: z.array(z.string()).default([]),
        })
        .optional()
        .describe('Only things that fit go in. Empty lists are not fussy.'),
    }),
    run: async (args, ctx) => {
      const items = args.assetIds.length ? ctx.library.require().queries.refs(args.assetIds) : [];
      const id = await ctx.library.createCollection(args.name, {
        description: args.description,
        items,
        packs: args.packIds,
        projectId: args.forGame,
        ...(args.rules ? { rules: { ...NO_RULES, ...args.rules } } : {}),
      });
      ctx.note(`An agent made the collection “${args.name}”`);
      return { id };
    },
  }),
  define({
    name: 'add_to_collection',
    group: 'organise',
    title: 'Add to a collection',
    summary: 'Put packs or files into a collection. A pack joins whole, not as a list of its files. Anything the collection\'s rules refuse is reported back with the reason.',
    input: z.object({ collectionId: z.string(), packIds: z.array(z.string()).default([]), assetIds: z.array(z.number().int()).default([]) }),
    run: async (args, ctx) => {
      const items: CollectionItem[] = args.assetIds.length ? ctx.library.require().queries.refs(args.assetIds) : [];
      const result = await ctx.library.changeCollection(args.collectionId, { ...(items.length ? { add: items } : {}), ...(args.packIds.length ? { addPacks: args.packIds } : {}) });
      ctx.note(`An agent added ${result.added + result.addedPacks} thing${result.added + result.addedPacks === 1 ? '' : 's'} to a collection`);
      return result;
    },
  }),
  define({
    name: 'remove_from_collection',
    group: 'organise',
    title: 'Take out of a collection',
    summary: 'Take packs or files out of a collection. They stay in the library; only their membership goes.',
    input: z.object({ collectionId: z.string(), packIds: z.array(z.string()).default([]), assetIds: z.array(z.number().int()).default([]) }),
    run: async (args, ctx) => {
      const items = args.assetIds.length ? ctx.library.require().queries.refs(args.assetIds) : [];
      await ctx.library.changeCollection(args.collectionId, { ...(items.length ? { remove: items } : {}), ...(args.packIds.length ? { removePacks: args.packIds } : {}) });
      return { done: true };
    },
  }),
  define({
    name: 'set_pack_details',
    group: 'organise',
    title: 'Record what is known about a pack',
    summary: 'Set a pack\'s licence, credit line, source, creator, tags, style or description. This is how a pack in Review becomes ready: it needs a licence and a source.',
    input: z.object({
      packId: z.string(),
      licence: z.string().nullable().optional().describe(`One of: ${LICENCES.map((l) => l.id).join(', ')}.`),
      creditLine: z.string().nullable().optional(),
      sourceUrl: z.string().nullable().optional().describe('The page it came from.'),
      sourceName: z.string().nullable().optional().describe('Where it came from when it is not a known site.'),
      creator: z.string().nullable().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      version: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      styles: z.array(z.string()).optional(),
      genres: z.array(z.string()).optional(),
      notes: z.string().optional(),
    }),
    run: async (args, ctx) => {
      const pack = ctx.library.require().queries.pack(args.packId);
      if (!pack) throw new Error(`No pack with id ${args.packId}.`);
      const edit: PackEdit = {};
      if (args.name !== undefined) edit.name = args.name;
      if (args.description !== undefined) edit.description = args.description;
      if (args.notes !== undefined) edit.notes = args.notes;
      if (args.version !== undefined) edit.version = args.version;
      if (args.tags) edit.tags = args.tags;
      if (args.styles) edit.styles = args.styles;
      if (args.genres) edit.genres = args.genres;
      if (args.licence !== undefined || args.creditLine !== undefined) {
        edit.licence = { ...pack.meta.licence, ...(args.licence !== undefined ? { id: args.licence } : {}), ...(args.creditLine !== undefined ? { attribution: args.creditLine } : {}) };
      }
      if (args.sourceUrl !== undefined || args.sourceName !== undefined || args.creator !== undefined) {
        edit.source = {
          ...pack.meta.source,
          ...(args.sourceUrl !== undefined ? { url: args.sourceUrl } : {}),
          ...(args.sourceName !== undefined ? { name: args.sourceName } : {}),
          ...(args.creator !== undefined ? { creator: args.creator } : {}),
        };
      }
      await ctx.library.editPack(args.packId, edit);
      ctx.note(`An agent edited “${pack.name}”`, Object.keys(edit).join(', '));
      // What the pack still wants before it can leave Review, read back rather than assumed.
      const after = ctx.library.require().queries.pack(args.packId);
      return { done: true, stillNeeds: after ? missingForLibrary(after.meta) : [], inReview: after?.meta.status === 'inbox' };
    },
  }),
  define({
    name: 'set_file_licence',
    group: 'organise',
    title: 'A licence for part of a pack',
    summary: 'Record that one folder or one file inside a pack came under different terms. Written as a rule on the pack; the most exact rule wins for a file.',
    input: z.object({
      packId: z.string(),
      path: z.string().describe('A folder or file inside the pack, as the app shows it (archives appear as folders).'),
      licence: z.string().nullable(),
      creditLine: z.string().nullable().default(null),
    }),
    run: async (args, ctx) => {
      const pack = ctx.library.require().queries.pack(args.packId);
      if (!pack) throw new Error(`No pack with id ${args.packId}.`);
      // A rule that covers nothing is worse than none: it reads as done and changes no file.
      const at = args.path.replace(/^\/+|\/+$/g, '').toLowerCase();
      const paths = ctx.library.require().queries.packFiles(args.packId).map((f) => assetPath(f.ref));
      const covers = paths.filter((p) => p.toLowerCase() === at || p.toLowerCase().startsWith(`${at}/`));
      if (!covers.length) {
        const folders = [...new Set(paths.map((p) => p.split('/').slice(0, -1).join('/')).filter(Boolean))].slice(0, 12);
        throw new Error(`Nothing in this pack is at “${args.path}”. Use a path as list_files shows it${folders.length ? `, for instance a folder like ${folders.slice(0, 3).map((f) => `“${f}”`).join(', ')}` : ''}.`);
      }
      const rules = pack.meta.licences.filter((r) => r.path.toLowerCase() !== at);
      await ctx.library.editPack(args.packId, {
        licences: [...rules, { path: args.path, licence: { id: args.licence, attribution: args.creditLine, proof: [], notes: '' } }].sort((a, b) => a.path.localeCompare(b.path)),
      });
      ctx.note(`An agent set the licence for ${args.path}`);
      return { done: true, files: covers.length };
    },
  }),
  define({
    name: 'move_to_library',
    group: 'organise',
    title: 'Move a pack out of Review',
    summary: 'Once a pack has a licence and a source, this moves it into the library so its assets can be browsed.',
    input: z.object({ packIds: z.array(z.string()).min(1) }),
    run: async (args, ctx) => {
      const moved: string[] = [];
      const refused: { packId: string; why: string }[] = [];
      for (const id of args.packIds) {
        try {
          await ctx.library.setStatus(id, 'library');
          moved.push(id);
        } catch (e) {
          refused.push({ packId: id, why: e instanceof Error ? e.message : String(e) });
        }
      }
      if (moved.length) ctx.note(`An agent moved ${moved.length} pack${moved.length === 1 ? '' : 's'} into the library`);
      return { moved, refused };
    },
  }),
  define({
    name: 'archive_pack',
    group: 'organise',
    title: 'Archive a pack, or bring it back',
    summary: 'Archiving keeps a pack in full and takes it out of browsing, for the ones worth keeping but rarely reached for. Nothing is lost and games that use it are unaffected.',
    input: z.object({ packIds: z.array(z.string()).min(1), on: z.boolean().default(true) }),
    run: async (args, ctx) => {
      for (const id of args.packIds) await ctx.library.archivePack(id, args.on);
      const many = args.packIds.length === 1 ? 'pack' : 'packs';
      ctx.note(args.on ? `An agent archived ${args.packIds.length} ${many}` : `An agent brought ${args.packIds.length} ${many} back`);
      return { done: true };
    },
  }),

  // ---- Into a game ----
  define({
    name: 'link_to_game',
    group: 'link',
    title: 'Link assets to a game',
    summary: 'Copy files into a game\'s folder, in the format that game prefers, with their textures, their licence papers and the credits file kept up to date. This is what "linking" means here.',
    input: z.object({
      projectId: z.string(),
      assetIds: z.array(z.number().int()).default([]),
      packIds: z.array(z.string()).default([]).describe('Every file of these packs is linked.'),
    }),
    run: async (args, ctx) => {
      const items = args.assetIds.length ? ctx.library.require().queries.refs(args.assetIds) : [];
      for (const packId of args.packIds) items.push(...packAssets(ctx, packId));
      if (!items.length) throw new Error('Nothing to link: give assetIds or packIds.');
      const n = await ctx.projects.copy(args.projectId, items, ctx.copySource());
      ctx.note(`An agent linked ${n} asset${n === 1 ? '' : 's'} to a game`);
      return { linked: n };
    },
  }),
  define({
    name: 'project_files',
    group: 'read',
    title: 'What a game has taken',
    summary: 'The assets already linked into a game, with the licence and credit line recorded for each.',
    input: z.object({ projectId: z.string() }),
    run: async (args, ctx) =>
      (await ctx.projects.entries(args.projectId, ctx.libraryId())).map((e) => ({ packId: e.packId, pack: e.packName, path: assetPath(e.ref), files: e.files, licence: e.licence, creditLine: e.attribution, copiedAt: e.copiedAt })),
  }),

  // ---- Bringing things in ----
  define({
    name: 'import_paths',
    group: 'bring',
    title: 'Add packs from this computer',
    summary: 'Add folders or archives as packs, in one go. Each becomes a pack; anything whose licence is not certain waits in Review.',
    input: z.object({
      paths: z.array(z.string()).min(1).describe('Absolute paths to folders or archive files.'),
      eachInside: z.union([z.boolean(), z.literal('auto')]).default('auto').describe('true: treat a folder as many packs, one per thing inside. auto decides from what is in it.'),
    }),
    run: async (args, ctx) => {
      const items = await ctx.library.planImport(args.paths, args.eachInside);
      const result = await ctx.library.import(items, false);
      ctx.note(`An agent added ${result.added.length} pack${result.added.length === 1 ? '' : 's'}`, args.paths.join(', '));
      return { added: result.added.map((p) => ({ id: p.id, name: p.name, status: p.status })), failed: result.failed };
    },
  }),
  define({
    name: 'add_downloads',
    group: 'bring',
    title: 'Download from links',
    summary: 'Queue web links to be fetched and added like any other pack. Paste a list; the ones that point at a page rather than a file are refused with a reason.',
    input: z.object({ links: z.string().min(1).describe('One or more links, separated by newlines or spaces.') }),
    run: async (args, ctx) => {
      const result = ctx.downloads.add(linksIn(args.links));
      ctx.note(`An agent queued ${result.added} download${result.added === 1 ? '' : 's'}`);
      return result;
    },
  }),
  define({
    name: 'list_downloads',
    group: 'read',
    title: 'Downloads',
    summary: 'What is being fetched, what is waiting and what went wrong.',
    input: z.object({}),
    run: async (_args, ctx) => ctx.downloads.list().map((d) => ({ id: d.id, url: d.url, name: d.name, state: d.state, received: d.received, total: d.total, error: d.error })),
  }),

  // ---- Removing ----
  define({
    name: 'delete_to_bin',
    group: 'remove',
    title: 'Delete to the bin',
    summary: 'Move packs or single files to the library\'s bin, where they wait until someone empties it. Nothing is lost and anything already linked into a game stays there. An agent cannot empty the bin.',
    input: z.object({ packIds: z.array(z.string()).default([]), assetIds: z.array(z.number().int()).default([]) }),
    run: async (args, ctx) => {
      const removed: string[] = [];
      for (const id of args.packIds) removed.push(await ctx.library.removePack(id));
      const files = args.assetIds.length ? await ctx.library.removeFiles(ctx.library.require().queries.refs(args.assetIds)) : { removed: 0, inArchive: 0, failed: 0 };
      ctx.note(`An agent deleted ${removed.length} pack${removed.length === 1 ? '' : 's'} and ${files.removed} file${files.removed === 1 ? '' : 's'} to the bin`);
      return { packs: removed, files };
    },
  }),
  define({
    name: 'restore_from_bin',
    group: 'remove',
    title: 'Put something back',
    summary: 'Take something out of the bin and put it back where it came from.',
    input: z.object({ ids: z.array(z.string()).min(1).describe('Entry ids from list_bin.') }),
    run: async (args, ctx) => {
      const back = [];
      for (const id of args.ids) back.push(await ctx.library.restoreFromBin(id));
      ctx.note(`An agent put ${back.filter(Boolean).length} thing${back.filter(Boolean).length === 1 ? '' : 's'} back from the bin`);
      return { restored: back.filter(Boolean).length };
    },
  }),

  // ---- Everything in the library, for an agent that wants the lot ----
  define({
    name: 'list_packs',
    group: 'read',
    title: 'Every pack',
    summary: 'All the packs in the library, a page at a time, as a short line each. Use this to work through a whole library; use search when you know what you are after.',
    input: z.object({
      scope,
      limit: z.number().int().min(1).max(1000).default(200),
      offset: z.number().int().min(0).default(0),
      sort: z.string().default('name').describe('name, added, size or count.'),
    }),
    run: async (args, ctx) => {
      const sort = (PACK_SORTS as string[]).includes(args.sort) ? (args.sort as PackSort) : 'name';
      const page = ctx.library.require().queries.packs(query(args), sort, args.offset, args.limit);
      return {
        total: page.total,
        offset: args.offset,
        packs: page.rows.map((p) => ({ id: p.id, name: p.name, licence: p.licence, creator: p.creator, assets: p.assetCount, bytes: p.size, kinds: p.types, status: p.status, archived: p.archived })),
      };
    },
  }),
  define({
    name: 'list_assets',
    group: 'read',
    title: 'Every file',
    summary: 'All the files in the library, a page at a time, as a short line each. A big library holds a hundred thousand: ask for a page, work through it, ask for the next.',
    input: z.object({
      scope,
      packId: z.string().optional().describe('Only the files of this pack.'),
      limit: z.number().int().min(1).max(1000).default(200),
      offset: z.number().int().min(0).default(0),
      sort: z.string().default('name'),
    }),
    run: async (args, ctx) => {
      const sort = (ASSET_SORTS as string[]).includes(args.sort) ? (args.sort as AssetSort) : 'name';
      const q: BrowseQuery = { ...query(args), ...(args.packId ? { packIds: [args.packId] } : {}) };
      const page = ctx.library.require().queries.assets(q, sort, args.offset, args.limit);
      return {
        total: page.total,
        offset: args.offset,
        assets: page.rows.map((a) => ({ id: a.id, name: a.name, packId: a.packId, path: assetPath(a.ref), type: a.type, format: a.ext, bytes: a.size, licence: a.licence })),
      };
    },
  }),
  define({
    name: 'list_activity',
    group: 'read',
    title: 'What has been happening',
    summary: 'The library’s own record: packs added, downloads, reviews finished, backups, links to games, and what agents have done.',
    input: z.object({ limit: z.number().int().min(1).max(200).default(20) }),
    run: async (args, ctx) => (await ctx.app.activity(args.limit)).map((e) => ({ at: e.at, kind: e.kind, text: e.text, detail: e.detail ?? null })),
  }),

  // ---- Filing, continued ----
  define({
    name: 'edit_collection',
    group: 'organise',
    title: 'Change a collection',
    summary: 'Rename a collection, describe it, set what it will accept, or tie it to a game so linking knows where things go.',
    input: z.object({
      collectionId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      projectId: z.string().nullable().optional().describe('The game this collection is for, or null to untie it.'),
      rules: z
        .object({
          licences: z.array(z.string()).default([]),
          needsCreditLine: z.boolean().default(false),
          types: z.array(z.string()).default([]),
        })
        .partial()
        .optional()
        .describe('What may go in. Anything that does not fit is refused, with a reason.'),
    }),
    run: async (args, ctx) => {
      const change: import('@shared/types').CollectionChange = {};
      if (args.name !== undefined) change.name = args.name;
      if (args.description !== undefined) change.description = args.description;
      if (args.projectId !== undefined) change.projectId = args.projectId;
      if (args.rules) change.rules = { ...NO_RULES, ...args.rules } as import('@shared/collection').CollectionRules;
      await ctx.library.changeCollection(args.collectionId, change);
      ctx.note('An agent changed a collection');
      return { done: true };
    },
  }),
  define({
    name: 'delete_collection',
    group: 'organise',
    title: 'Delete a collection',
    summary: 'Take a collection away. The packs and files in it stay in the library; only the gathering goes.',
    input: z.object({ collectionId: z.string() }),
    run: async (args, ctx) => {
      await ctx.library.changeCollection(args.collectionId, { delete: true });
      ctx.note('An agent deleted a collection');
      return { done: true };
    },
  }),
  define({
    name: 'set_pack_cover',
    group: 'organise',
    title: 'Choose a pack’s cover',
    summary: 'Pick the picture shown for a pack, by the path of a file inside it, or null to let Tessera choose.',
    input: z.object({ packId: z.string(), path: z.string().nullable() }),
    run: async (args, ctx) => {
      await ctx.library.editPack(args.packId, { cover: args.path });
      ctx.note('An agent set a pack’s cover');
      return { done: true };
    },
  }),

  // ---- Bringing things in, continued ----
  define({
    name: 'add_files_to_pack',
    group: 'bring',
    title: 'Add files to a pack',
    summary: 'Put more files into a pack that is already in the library, copied in as they are. Use it when a download was missing a piece, or when something you made belongs with it.',
    input: z.object({
      packId: z.string(),
      paths: z.array(z.string()).min(1).describe('Absolute paths to files or folders on this computer.'),
      into: z.string().optional().describe('A folder inside the pack to put them in; made if it is not there. Leave it out for the top of the pack.'),
      licence: z.string().nullable().optional().describe('Terms for these files alone, when they are not the pack’s own. Written as a rule for each file added.'),
      creditLine: z.string().nullable().optional(),
    }),
    run: async (args, ctx) => {
      const done = await ctx.library.addFilesToPack(args.packId, args.paths, args.into);
      if (args.licence !== undefined && done.names.length) {
        const pack = ctx.library.require().queries.pack(args.packId);
        const rules = (pack?.meta.licences ?? []).filter((r) => !done.names.includes(r.path));
        await ctx.library.editPack(args.packId, {
          licences: [...rules, ...done.names.map((path) => ({ path, licence: { id: args.licence ?? null, attribution: args.creditLine ?? null, proof: [], notes: '' } }))].sort((a, b) => a.path.localeCompare(b.path)),
        });
      }
      ctx.note(`An agent added ${done.added} file${done.added === 1 ? '' : 's'} to a pack`, done.names.slice(0, 6).join(', '));
      return done;
    },
  }),
  define({
    name: 'pack_folders',
    group: 'read',
    title: 'The folders in a pack',
    summary: 'The folders inside a pack, so files can be added where they belong.',
    input: z.object({ packId: z.string() }),
    run: async (args, ctx) => ({ folders: await ctx.library.packFolders(args.packId) }),
  }),
  define({
    name: 'download_control',
    group: 'bring',
    title: 'Manage a download',
    summary: 'Pause, resume, retry or cancel one download, or tidy the finished ones away.',
    input: z.object({
      what: z.enum(['pause', 'resume', 'again', 'cancel', 'remove', 'retryFailed', 'clear']),
      id: z.string().optional().describe('Which download, from list_downloads. Not needed for retryFailed or clear.'),
    }),
    run: async (args, ctx) => {
      const d = ctx.downloads;
      if (args.what === 'retryFailed') d.retryFailed();
      else if (args.what === 'clear') d.clear();
      else {
        if (!args.id) throw new Error('Which download? Give the id from list_downloads.');
        if (args.what === 'pause') d.pause(args.id);
        if (args.what === 'resume') d.resume(args.id);
        if (args.what === 'again') d.again(args.id);
        if (args.what === 'cancel') d.cancel(args.id);
        if (args.what === 'remove') d.remove(args.id);
      }
      return { done: true };
    },
  }),

  // ---- Games ----
  define({
    name: 'add_game',
    group: 'link',
    title: 'Set up a game',
    summary: 'Tell Tessera where a game folder is, so assets can be linked into it. The engine and the folder assets go in are read from the project itself.',
    input: z.object({
      path: z.string().describe('The game’s folder on this computer.'),
      name: z.string().optional().describe('What to call it; the folder’s name by default.'),
    }),
    run: async (args, ctx) => {
      const probe = await ctx.projects.probe(args.path);
      const project = await ctx.projects.add({ ...probe, ...(args.name ? { name: args.name } : {}) });
      ctx.note(`An agent set up the game “${project.name}”`);
      return { id: project.id, name: project.name, engine: project.engine, target: project.target, notes: probe.notes };
    },
  }),
  define({
    name: 'edit_game',
    group: 'link',
    title: 'Change a game',
    summary: 'Rename a game, or change the folder assets are linked into and the file its credits are written to.',
    input: z.object({ projectId: z.string(), name: z.string().optional(), target: z.string().optional(), creditsFile: z.string().optional() }),
    run: async (args, ctx) => {
      const { projectId, ...patch } = args;
      await ctx.projects.update(projectId, patch);
      ctx.note('An agent changed a game');
      return { done: true };
    },
  }),
  define({
    name: 'unlink_from_game',
    group: 'link',
    title: 'Take assets out of a game',
    summary: 'Remove files this library linked into a game, from the game’s folder and from its credits. The library keeps them.',
    input: z.object({ projectId: z.string(), assetIds: z.array(z.number().int()).default([]), packIds: z.array(z.string()).default([]) }),
    run: async (args, ctx) => {
      const items = args.assetIds.length ? ctx.library.require().queries.refs(args.assetIds) : [];
      for (const packId of args.packIds) items.push(...packAssets(ctx, packId));
      if (!items.length) throw new Error('Nothing to take out: give assetIds or packIds.');
      const n = await ctx.projects.remove(args.projectId, items, ctx.libraryId());
      ctx.note(`An agent took ${n} asset${n === 1 ? '' : 's'} out of a game`);
      return { removed: n };
    },
  }),
  define({
    name: 'forget_game',
    group: 'link',
    title: 'Forget a game',
    summary: 'Stop tracking a game. Its folder and everything already linked into it are left exactly as they are.',
    input: z.object({ projectId: z.string() }),
    run: async (args, ctx) => {
      await ctx.projects.unlink(args.projectId);
      ctx.note('An agent stopped tracking a game');
      return { done: true };
    },
  }),

  // ---- The app itself ----
  define({
    name: 'list_libraries',
    group: 'system',
    title: 'Every library',
    summary: 'The libraries this computer knows, most recently opened first, and which one is open now.',
    input: z.object({}),
    run: async (_args, ctx) => {
      const state = ctx.library.getState();
      return {
        open: state.status === 'ready' ? { id: state.library.id, name: state.library.name, path: state.library.path } : null,
        libraries: (await ctx.app.libraries()).map((l) => ({ id: l.id, name: l.name, path: l.path, lastOpenedAt: l.lastOpenedAt ?? null })),
      };
    },
  }),
  define({
    name: 'open_library',
    group: 'system',
    title: 'Open a library',
    summary: 'Switch to another library by its folder. Everything else works on whichever is open, so say what you have switched to.',
    input: z.object({ path: z.string().describe('The library’s folder, from list_libraries.') }),
    run: async (args, ctx) => {
      const state = await ctx.app.openLibrary(args.path);
      if (state.status !== 'ready') throw new Error(state.status === 'error' ? state.message : `The library did not open (${state.status}).`);
      ctx.note(`An agent opened the library “${state.library.name}”`);
      return { open: true, name: state.library.name, path: state.library.path };
    },
  }),
  define({
    name: 'create_library',
    group: 'system',
    title: 'Make a library',
    summary: 'Make a new, empty library in a folder, and open it.',
    input: z.object({ path: z.string().describe('An empty folder, or one that does not exist yet.'), name: z.string() }),
    run: async (args, ctx) => {
      const state = await ctx.app.createLibrary(args.path, args.name);
      if (state.status !== 'ready') throw new Error(state.status === 'error' ? state.message : 'The library was not made.');
      ctx.note(`An agent made the library “${state.library.name}”`);
      return { made: true, name: state.library.name, path: state.library.path };
    },
  }),
  define({
    name: 'close_library',
    group: 'system',
    title: 'Close the library',
    summary: 'Close whatever library is open. Nothing is lost; the window goes back to the start.',
    input: z.object({}),
    run: async (_args, ctx) => {
      await ctx.app.closeLibrary();
      ctx.note('An agent closed the library');
      return { closed: true };
    },
  }),
  define({
    name: 'get_settings',
    group: 'system',
    title: 'Read Tessera’s settings',
    summary: 'Everything in Settings that is not a secret: theme, what happens to downloads, the rules for sites, the bin, and what agents may do.',
    input: z.object({}),
    run: async (_args, ctx) => {
      const s = ctx.settings();
      const { libraries: _libraries, ...rest } = s;
      return rest;
    },
  }),
  define({
    name: 'set_settings',
    group: 'system',
    title: 'Change Tessera’s settings',
    summary: 'Change the app’s own settings: theme, colour, what happens when a download finishes, how long the bin keeps things, and the licence rules for sites. Say what you changed.',
    input: z.object({
      theme: z.enum(['system', 'light', 'dark']).optional(),
      seedColor: z.string().optional().describe('A hex colour, like #3f6f8f.'),
      afterDownload: z.enum(['ask', 'review', 'sure']).optional(),
      binKeepDays: z.number().int().min(0).max(3650).optional().describe('0 keeps things until you empty the bin.'),
      updateCheck: z.boolean().optional(),
      siteRules: z
        .array(z.object({ host: z.string(), licence: z.string().nullable(), creditLine: z.string().nullable().default(null), note: z.string().default('') }))
        .optional()
        .describe('What to assume for a site you download from. Replaces the list.'),
    }),
    run: async (args, ctx) => {
      const patch = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      if (!Object.keys(patch).length) throw new Error('Nothing to change.');
      await ctx.app.updateSettings(patch as Partial<import('@shared/types').Settings>);
      ctx.note('An agent changed Tessera’s settings', Object.keys(patch).join(', '));
      return { changed: Object.keys(patch) };
    },
  }),
  define({
    name: 'read_library_again',
    group: 'system',
    title: 'Read the library again',
    summary: 'Read every pack from scratch. Worth it after files have been moved about by hand; Tessera normally notices on its own.',
    input: z.object({}),
    run: async (_args, ctx) => {
      await ctx.app.reindex();
      ctx.note('An agent read the library again');
      return { done: true };
    },
  }),
  define({
    name: 'back_up_now',
    group: 'system',
    title: 'Back up now',
    summary: 'Make a backup of the open library at once, if backups are set up for it.',
    input: z.object({}),
    run: async (_args, ctx) => {
      await ctx.app.backUpNow();
      ctx.note('An agent backed up the library');
      return { done: true };
    },
  }),

  // ---- What cannot be undone ----
  define({
    name: 'empty_bin',
    group: 'danger',
    title: 'Empty the bin',
    summary: 'Delete what is in the library’s bin from the disk, for good. There is no putting it back. Check list_bin first, and say plainly what is about to go.',
    input: z.object({ ids: z.array(z.string()).default([]).describe('Entries from list_bin, or leave it out for everything in the bin.') }),
    run: async (args, ctx) => {
      const gone = await ctx.library.emptyBin(args.ids.length ? args.ids : undefined);
      ctx.note(`An agent emptied ${gone} thing${gone === 1 ? '' : 's'} from the bin, for good`);
      return { gone };
    },
  }),
  define({
    name: 'discard_review_pack',
    group: 'danger',
    title: 'Throw away a pack in Review',
    summary: 'Delete a pack that is still waiting in Review, straight from the disk. It never reached the library, so there is no bin to catch it.',
    input: z.object({ packId: z.string() }),
    run: async (args, ctx) => {
      const pack = ctx.library.require().queries.pack(args.packId);
      await ctx.library.discardPack(args.packId);
      ctx.note(`An agent threw away “${pack?.name ?? 'a pack'}” from Review`);
      return { done: true };
    },
  }),
];


export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** The catalogue as the window and the skill file see it. */
export const toolCatalogue = () =>
  TOOLS.map((t) => ({
    name: t.name,
    group: t.group,
    title: t.title,
    summary: t.summary,
    schema: z.toJSONSchema(t.input, { io: 'input' }) as Record<string, unknown>,
  }));
