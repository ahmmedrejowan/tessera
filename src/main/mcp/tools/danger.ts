/**
 * The two things that cannot be undone. Off until the owner allows them.
 */
import { z } from 'zod';
import { define } from './shared';
import type { Tool } from './shared';

export const DANGER: Tool[] = [

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
