/**
 * Filing: stars, collections, licences, tags, and moving a pack out of Review.
 */
import { z } from 'zod';
import { assetPath } from '@shared/assets';
import { NO_RULES } from '@shared/collection';
import { LICENCES } from '@shared/licences';
import { missingForLibrary } from '@shared/pack';
import type { PackEdit } from '@shared/pack';
import type { CollectionItem } from '@shared/collection';
import { define } from './shared';
import type { Tool } from './shared';

export const ORGANISE: Tool[] = [

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
];
