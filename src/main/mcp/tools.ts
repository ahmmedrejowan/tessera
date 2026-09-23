import { z } from 'zod';
import { assetPath } from '@shared/assets';
import { linksIn } from '@shared/links';
import { NO_RULES, type CollectionItem } from '@shared/collection';
import { LICENCES } from '@shared/licences';
import type { PackEdit } from '@shared/pack';
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
      return { done: true, stillNeeds: [] };
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
      const rules = pack.meta.licences.filter((r) => r.path.toLowerCase() !== args.path.toLowerCase());
      await ctx.library.editPack(args.packId, {
        licences: [...rules, { path: args.path, licence: { id: args.licence, attribution: args.creditLine, proof: [], notes: '' } }].sort((a, b) => a.path.localeCompare(b.path)),
      });
      ctx.note(`An agent set the licence for ${args.path}`);
      return { done: true };
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
      ctx.note(args.on ? `An agent archived ${args.packIds.length} pack(s)` : `An agent brought ${args.packIds.length} pack${args.packIds.length === 1 ? '' : 's'} back`);
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
      for (const packId of args.packIds) for (const f of ctx.library.require().queries.packFiles(packId)) items.push({ packId: f.packId, ref: f.ref });
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
