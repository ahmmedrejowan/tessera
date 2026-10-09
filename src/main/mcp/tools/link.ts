/**
 * Games: setting one up, putting assets into it, and taking them back out.
 */
import { z } from 'zod';
import { define, packAssets, absolute } from './shared';
import type { Tool } from './shared';

export const LINK: Tool[] = [

  // ---- Into a game ----
  define({
    name: 'link_to_game',
    group: 'link',
    title: 'Link assets to a game',
    summary: 'Copy files into a game\'s folder, in the format that game prefers, with their textures, their license papers and the credits file kept up to date. This is what "linking" means here.',
    input: z.object({
      projectId: z.string().describe("The game's id, as list_projects gives it in `id`. Called projectId though the tools say game."),
      assetIds: z.array(z.number().int()).default([]),
      packIds: z.array(z.string()).default([]).describe('Every file of these packs is linked.'),
      ifNameTaken: z
        .enum(['skip', 'overwrite', 'rename'])
        .default('skip')
        .describe('What to do where the game already has a different file under a name this copy wants. A file with exactly the same contents is never a clash and is always left alone. "skip" keeps the game\'s file, "overwrite" replaces it, "rename" brings the library\'s in beside it.'),
    }),
    run: async (args, ctx) => {
      const items = args.assetIds.length ? ctx.library.require().queries.refs(args.assetIds) : [];
      for (const packId of args.packIds) items.push(...packAssets(ctx, packId));
      if (!items.length) throw new Error('Nothing to link: give assetIds or packIds.');
      // The window will not copy without showing what is wrong with the licenses first: a pack
      // with none recorded, one that forbids commercial use, one that needs a credit line, one
      // still in Review. An agent was told none of it, which is the one thing this application
      // exists to prevent. The same plan the window uses is read here and handed back.
      const src = ctx.copySource();
      const plan = await ctx.projects.plan(args.projectId, items, src);
      const n = await ctx.projects.copy(args.projectId, items, src, args.ifNameTaken);
      ctx.note(`An agent linked ${n} asset${n === 1 ? '' : 's'} to a game`);
      return {
        linked: n,
        ...(plan.warnings.length ? { licenseWarnings: plan.warnings } : {}),
        ...(plan.identical ? { alreadyThereUnchanged: plan.identical } : {}),
        ...(plan.overwriting.length ? { nameTakenByADifferentFile: plan.overwriting, whatWasDone: args.ifNameTaken } : {}),
        ...(plan.warnings.length ? { tellThePerson: 'Say these out loud. They were copied anyway, and the person may want to undo it.' } : {}),
      };
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
      const probe = await ctx.projects.probe(absolute([args.path])[0]!);
      const project = await ctx.projects.add({ ...probe, ...(args.name ? { name: args.name } : {}) });
      ctx.note(`An agent set up the game “${project.name}”`);
      return { id: project.id, name: project.name, engine: project.engine, target: project.target, notes: probe.notes };
    },
  }),
  define({
    name: 'edit_game',
    group: 'link',
    title: 'Change a game',
    summary: 'Rename a game, or change the folder assets are linked into and the file its credits are written to. Pass creditsFile null to stop writing credits for it.',
    input: z.object({
      projectId: z.string().describe("The game's id, as list_projects gives it in `id`. Called projectId though the tools say game."),
      name: z.string().optional(),
      target: z.string().optional(),
      // Null, because a game can keep no credits file at all and the window has always allowed
      // that. Without it an agent could turn a credits file on and never turn it off again.
      creditsFile: z.string().nullable().optional().describe('Where the credits are written, relative to the game. Null to write none.'),
    }),
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
    input: z.object({ projectId: z.string().describe("The game's id, as list_projects gives it in `id`. Called projectId though the tools say game."), assetIds: z.array(z.number().int()).default([]), packIds: z.array(z.string()).default([]) }),
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
    name: 'find_assets_already_in_game',
    group: 'link',
    title: 'Find assets a game already has',
    summary:
      'Look through a folder of a game for assets this library already knows, matching by content rather than by name. Reads only: nothing is copied, moved or recorded. Use it before linking into a game that is not new, so the same asset is not copied in a second time under a different path.',
    input: z.object({
      projectId: z.string().describe("The game's id, as list_projects gives it in `id`. Called projectId though the tools say game."),
      folder: z.string().default('').describe('A folder inside the project, e.g. "Assets" or "Content". Leave out for the folder copies normally go to.'),
    }),
    run: async (args, ctx) => {
      const scan = await ctx.projects.findAlreadyHere(
        args.projectId,
        args.folder,
        ctx.copySource(),
        (size) => ctx.library.require().queries.bySize(size),
        (sha) => ctx.library.require().queries.byHash(sha),
      );
      return {
        looked: scan.looked,
        found: scan.matches.length,
        packs: scan.packs,
        // The paths are what `record_assets_already_in_game` takes back, so they come out whole.
        matches: scan.matches,
        note: 'Nothing has been recorded. Call record_assets_already_in_game with these matches to write them into the game’s record and its credits.',
      };
    },
  }),
  define({
    name: 'record_assets_already_in_game',
    group: 'link',
    title: 'Record assets a game already has',
    summary:
      'Write what find_assets_already_in_game found into the game’s record, pointing at the paths the game already uses. Nothing is copied and no file moves; the credits file is written again so it covers them.',
    input: z.object({
      projectId: z.string().describe("The game's id, as list_projects gives it in `id`. Called projectId though the tools say game."),
      matches: z
        .array(z.object({ packId: z.string(), packName: z.string().default(''), ref: z.string(), path: z.string(), size: z.number().int().nonnegative().default(0) }))
        .min(1)
        .describe('Straight from find_assets_already_in_game.'),
    }),
    run: async (args, ctx) => {
      const n = await ctx.projects.adopt(args.projectId, args.matches, ctx.copySource());
      ctx.note(`An agent recorded ${n} asset${n === 1 ? '' : 's'} a game already had`);
      return { recorded: n };
    },
  }),
  define({
    name: 'forget_game',
    group: 'link',
    title: 'Forget a game',
    summary: 'Stop tracking a game. Its folder and everything already linked into it are left exactly as they are.',
    input: z.object({ projectId: z.string().describe("The game's id, as list_projects gives it in `id`. Called projectId though the tools say game.") }),
    run: async (args, ctx) => {
      await ctx.projects.unlink(args.projectId);
      ctx.note('An agent stopped tracking a game');
      return { done: true };
    },
  }),
];
