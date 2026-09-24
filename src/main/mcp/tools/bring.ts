/**
 * Bringing things in: files from this computer, links from the web, and downloads in hand.
 */
import { z } from 'zod';
import { linksIn } from '@shared/links';
import { define, absolute } from './shared';
import type { Tool } from './shared';

export const BRING: Tool[] = [

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
      const items = await ctx.library.planImport(absolute(args.paths), args.eachInside);
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
      const done = await ctx.library.addFilesToPack(args.packId, absolute(args.paths), args.into);
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
];
