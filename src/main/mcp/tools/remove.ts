/**
 * Deleting to the library’s bin, and putting things back. Nothing here is permanent.
 */
import { z } from 'zod';
import { define } from './shared';
import type { Tool } from './shared';

export const REMOVE: Tool[] = [

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
