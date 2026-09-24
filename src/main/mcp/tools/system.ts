/**
 * The app itself: its libraries, its settings, and the jobs it can be asked to run. Off until
 * the owner allows it.
 */
import { z } from 'zod';
import { define, absolute } from './shared';
import type { Tool } from './shared';

export const SYSTEM: Tool[] = [

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
      const state = await ctx.app.openLibrary(absolute([args.path])[0]!);
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
      const state = await ctx.app.createLibrary(absolute([args.path])[0]!, args.name);
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
];
