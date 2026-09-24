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
];
