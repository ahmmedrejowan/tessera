/**
 * What an agent can look at. Nothing here changes anything.
 */
import { z } from 'zod';
import { assetPath } from '@shared/assets';
import type { AssetSort, BrowseQuery, PackSort } from '@shared/query';
import { define, scope, filters, packOut, assetOut, ASSET_SORTS, PACK_SORTS, query } from './shared';
import type { Tool } from './shared';

export const READ: Tool[] = [

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
    summary: 'Everything deleted from this library, waiting to be put back or emptied. Emptying it for good needs a tool the owner has to allow first.',
    input: z.object({}),
    run: async (_args, ctx) => ctx.library.bin(),
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
  define({
    name: 'list_downloads',
    group: 'read',
    title: 'Downloads',
    summary: 'What is being fetched, what is waiting and what went wrong.',
    input: z.object({}),
    run: async (_args, ctx) => ctx.downloads.list().map((d) => ({ id: d.id, url: d.url, name: d.name, state: d.state, received: d.received, total: d.total, error: d.error })),
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
  define({
    name: 'pack_folders',
    group: 'read',
    title: 'The folders in a pack',
    summary: 'The folders inside a pack, so files can be added where they belong.',
    input: z.object({ packId: z.string() }),
    run: async (args, ctx) => ({ folders: await ctx.library.packFolders(args.packId) }),
  }),
];
