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
    group: 'read',
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
    group: 'read',
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
      afterDownload: z.enum(['add', 'review', 'ask']).optional().describe('add: straight into the library when the licence is clear. review: always to Review. ask: leave it in Downloads.'),
      // The same bound the setting itself has. It used to accept ten years, which the setting
      // then threw away and replaced with the default of 30, so asking for a longer bin quietly
      // made it shorter and the tool still said it had changed it.
      binKeepDays: z.number().int().min(0).max(365).optional().describe('Days to keep deleted things, up to 365. 0 keeps them until you empty the bin.'),
      updateCheck: z.boolean().optional(),
      siteRules: z
        .array(z.object({ host: z.string(), licence: z.string().nullable(), creator: z.string().nullable().default(null) }))
        .optional()
        .describe('What to assume for a site you download from. Replaces the list.'),
      downloadsAtOnce: z.number().int().min(1).max(5).optional().describe('How many downloads run at the same time.'),
      autoInstallUpdates: z.boolean().optional().describe('Whether a new version installs itself when it is ready.'),
      moveIntoLibrary: z.boolean().optional().describe('Whether adding a pack removes the original once its copy is in.'),
      confirmCopyToGame: z.boolean().optional().describe('Whether the window asks before writing into a game.'),
    }),
    run: async (args, ctx) => {
      const patch = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      if (!Object.keys(patch).length) throw new Error('Nothing to change.');
      await ctx.app.updateSettings(patch as Partial<import('@shared/types').Settings>);
      ctx.note('An agent changed Tessera’s settings', Object.keys(patch).join(', '));
      // What was stored, not what was asked for. A setting can refuse a value and keep its own,
      // and an agent that reports "changed" when nothing changed is worse than one that fails.
      const now = ctx.settings() as unknown as Record<string, unknown>;
      const stored = Object.fromEntries(Object.keys(patch).map((k) => [k, now[k]]));
      // Some settings are stored with more than they were given: a site rule gains the day it was
      // added. Comparing whole values reported every successful siteRules change as refused, so
      // an agent told the person it had failed. Only flat values are compared.
      const flat = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
      const refused = Object.keys(patch).filter((k) => flat(patch[k]) && JSON.stringify(now[k]) !== JSON.stringify(patch[k]));
      return { changed: Object.keys(patch), stored, ...(refused.length ? { notStoredAsAsked: refused } : {}) };
    },
  }),
  define({
    name: 'get_library_settings',
    group: 'read',
    title: 'This library’s own settings',
    summary: 'The preferences that belong to the open library rather than to the app: its name, its folder, and whether a pack with a clear licence skips Review.',
    input: z.object({}),
    run: async (_args, ctx) => {
      const prefs = ctx.app.libraryPrefs();
      if (!prefs) throw new Error('No library is open.');
      return prefs;
    },
  }),
  define({
    name: 'set_library_settings',
    group: 'system',
    title: 'Change this library’s settings',
    summary: 'Rename the open library, or change whether a pack whose licence is certain goes straight in rather than waiting in Review. Say what you changed.',
    input: z.object({
      name: z.string().min(1).optional(),
      skipInboxWhenSure: z.boolean().optional().describe('true: a pack with a clear licence and a known source goes straight into the library.'),
    }),
    run: async (args, ctx) => {
      const patch = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      if (!Object.keys(patch).length) throw new Error('Nothing to change.');
      await ctx.app.setLibraryPrefs(patch);
      ctx.note('An agent changed this library’s settings', Object.keys(patch).join(', '));
      return { changed: Object.keys(patch) };
    },
  }),
  define({
    name: 'how_it_is_kept',
    group: 'read',
    title: 'Backups, syncing and the programs they need',
    summary:
      'Whether this library is backed up and synced, when the last backup ran and whether it failed, which computers are paired, and whether kopia, rclone and Syncthing are installed. Reading only: setting any of it up is done in the window.',
    input: z.object({}),
    run: async (_args, ctx) => {
      const { backup, sync } = await ctx.app.keeping();
      const previews = await ctx.app.previews.cost();
      return {
        previews: {
          bytes: previews.bytes,
          count: previews.count,
          byKind: previews.byKind,
          couldNotBeDrawn: previews.failed,
          drawingNow: ctx.app.previews.building(),
        },
        backup: {
          setUp: !!backup.target,
          where: backup.target?.provider ?? null,
          every: backup.intervalHours ? `${backup.intervalHours} hours` : 'only when asked',
          lastBackupAt: backup.lastBackupAt,
          lastError: backup.lastError,
          runningNow: backup.running,
        },
        sync: {
          on: sync.enabled,
          mode: sync.mode,
          runningNow: sync.running,
          thisComputer: sync.myId,
          computers: sync.devices.map((d) => ({ name: d.name, connected: d.connected, sharing: d.shared, caughtUp: d.completion })),
          folder: sync.folder,
        },
        programs: {
          kopia: backup.available ? (backup.bundled ? 'fetched by Tessera' : 'already on this computer') : 'not installed',
          rclone: backup.rclone ? 'installed' : 'not installed',
          syncthing: sync.available ? (sync.bundled ? 'fetched by Tessera' : 'already on this computer') : 'not installed',
          keychain: backup.keychain,
        },
      };
    },
  }),
  define({
    name: 'read_library_again',
    group: 'organise',
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
    name: 'sync_status',
    group: 'read',
    title: 'How syncing stands',
    summary:
      'Whether Syncthing is here, whether this library syncs, which way, this computer’s device ID, the computers it is paired with and whether each is connected, and anything waiting to be accepted.',
    input: z.object({}),
    run: async (_args, ctx) => {
      const s = await ctx.app.sync.status();
      return {
        syncthing: s.available ? (s.bundled ? 'fetched by Tessera' : 'already on this computer') : 'not installed',
        on: s.enabled,
        mode: s.mode,
        keepsGoingWhileAnotherLibraryIsOpen: s.whileClosed,
        runningNow: s.running,
        thisComputer: s.myId,
        computers: s.devices.map((d) => ({ id: d.id, name: d.name, connected: d.connected, hasThisLibrary: d.shared, caughtUp: d.completion })),
        thisLibrary: s.folder,
        waitingToBeAccepted: { computers: s.pendingDevices, libraries: s.pendingFolders },
      };
    },
  }),
  define({
    name: 'set_up_sync',
    group: 'system',
    title: 'Set up syncing',
    summary:
      'Get Syncthing if it is not here, then turn syncing on for this library. Gives back this computer’s device ID, which is what the other computer needs. Do this on both computers, then pair them and share the library.',
    input: z.object({
      mode: z
        .enum(['push', 'pull', 'full'])
        .default('push')
        .describe('push: this computer only sends. pull: it only receives. full: both ways. Start with push on the computer that holds the library.'),
    }),
    run: async (args, ctx) => {
      const before = await ctx.app.sync.status();
      const fetched = before.available ? null : await ctx.app.sync.install();
      await ctx.app.sync.enable(args.mode);
      const after = await ctx.app.sync.status();
      ctx.note(`An agent turned syncing on (${args.mode})`);
      return {
        syncthing: fetched ? `fetched ${fetched}` : 'already here',
        on: after.enabled,
        mode: after.mode,
        thisComputer: after.myId,
        next: 'Give thisComputer to the other computer and run pair_computer there with it, then pair_computer here with theirs. Then share_library_with on the computer that holds the library.',
      };
    },
  }),
  define({
    name: 'pair_computer',
    group: 'system',
    title: 'Pair a computer',
    summary:
      'Tell this computer about another one, by the device ID that computer shows, AND offer it the open library. This is not only an introduction: the other computer can accept the library straight afterwards, so only pair with a computer the person owns and has asked you to pair with. Run it on both computers, each with the other’s ID.',
    input: z.object({
      deviceId: z.string().min(1).describe('The other computer’s device ID, as sync_status there gives it (XXXXXXX-XXXXXXX-…).'),
      name: z.string().default('').describe('What to call it, for the person reading the list.'),
    }),
    run: async (args, ctx) => {
      await ctx.app.sync.pair(args.deviceId, args.name);
      ctx.note(`An agent paired with ${args.name || 'a computer'}`);
      return { paired: true, name: args.name || null };
    },
  }),
  define({
    name: 'share_library_with',
    group: 'system',
    title: 'Share this library with a computer',
    summary:
      'Offer the open library to a computer that is already paired. It waits there until somebody on that computer accepts it. Run this on the computer that holds the library.',
    input: z.object({
      deviceId: z.string().min(1).describe('A paired computer’s device ID, from sync_status.'),
    }),
    run: async (args, ctx) => {
      const s = await ctx.app.sync.status();
      const known = s.devices.find((d) => d.id === args.deviceId);
      if (!known) throw new Error('That computer is not paired yet. Run pair_computer with its device ID first.');
      if (known.shared) return { alreadyShared: true, name: known.name };
      await ctx.app.sync.pair(args.deviceId, known.name);
      ctx.note(`An agent shared this library with ${known.name || 'a computer'}`);
      return { offered: true, name: known.name, next: 'Somebody on that computer has to accept it, in its window or with accept_shared_library.' };
    },
  }),
  define({
    name: 'accept_shared_library',
    group: 'system',
    title: 'Accept a library another computer is offering',
    summary: 'Take a library that a paired computer has offered, into a folder on this computer. sync_status lists what is waiting.',
    input: z.object({
      folderId: z.string().min(1).describe('From waitingToBeAccepted.libraries in sync_status.'),
      offeredBy: z.string().min(1).describe('The device ID that offered it.'),
      label: z.string().default('').describe('What that library is called.'),
      path: z.string().min(1).describe('An empty folder on this computer to put it in.'),
      mode: z.enum(['push', 'pull', 'full']).default('pull').describe('pull is the usual choice on a second computer.'),
    }),
    run: async (args, ctx) => {
      await ctx.app.sync.acceptFolder(args.folderId, args.offeredBy, args.label, args.path, args.mode);
      ctx.note(`An agent accepted the library ${args.label || ''} from another computer`);
      return { accepted: true, into: args.path };
    },
  }),
  define({
    name: 'change_sync',
    group: 'system',
    title: 'Change or stop syncing',
    summary: 'Which way this library syncs, whether it keeps going while another library is open, and turning it off. Turning it off leaves paired computers paired for your other libraries.',
    input: z.object({
      mode: z.enum(['push', 'pull', 'full']).optional().describe('push: send only. pull: receive only. full: both ways.'),
      whileClosed: z.boolean().optional().describe('Keep syncing while another library is open, as long as Tessera is running.'),
      off: z.boolean().optional().describe('Turn syncing off for this library.'),
      unpair: z.string().optional().describe('A device ID to forget entirely, for every library.'),
    }),
    run: async (args, ctx) => {
      const did: string[] = [];
      if (args.mode) { await ctx.app.sync.setMode(args.mode); did.push(`mode ${args.mode}`); }
      if (args.whileClosed !== undefined) { await ctx.app.sync.setWhileClosed(args.whileClosed); did.push(`while another library is open: ${args.whileClosed}`); }
      if (args.off) { await ctx.app.sync.disable(); did.push('off'); }
      if (args.unpair) { await ctx.app.sync.unpair(args.unpair); did.push('unpaired a computer'); }
      if (!did.length) throw new Error('Say what to change: mode, whileClosed, off or unpair.');
      ctx.note(`An agent changed syncing: ${did.join(', ')}`);
      return { changed: did };
    },
  }),
  define({
    name: 'show_my_device_id',
    group: 'system',
    title: 'Show this computer’s device ID',
    summary: 'Start Syncthing far enough to have an ID, without turning syncing on for any library. This is the ID the other computer needs to pair with.',
    input: z.object({}),
    run: async (_args, ctx) => {
      let s = await ctx.app.sync.status();
      if (!s.available) await ctx.app.sync.install();
      if (!s.myId) {
        await ctx.app.sync.receive();
        // Syncthing takes a moment to come up and tell us who it is.
        for (let i = 0; i < 20 && !s.myId; i++) {
          await new Promise((r) => setTimeout(r, 500));
          s = await ctx.app.sync.status();
        }
      }
      if (!s.myId) throw new Error('Syncthing has not started yet. Try again in a moment.');
      return { thisComputer: s.myId };
    },
  }),
  define({
    name: 'draw_previews',
    group: 'organise',
    title: 'Draw previews',
    summary:
      'Draw the small pictures Tessera shows for files, for named packs or for the whole library. Normally they are drawn as tiles come into view; do this before going offline, or after clearing them. It runs in the background and can be stopped.',
    input: z.object({
      packIds: z.array(z.string()).optional().describe('Only these packs. Leave out for every pack in the library.'),
      stop: z.boolean().optional().describe('Stop the drawing that is in flight instead of starting one.'),
    }),
    run: async (args, ctx) => {
      if (args.stop) {
        ctx.app.previews.stop();
        return { stopping: true };
      }
      if (ctx.app.previews.building()) return { alreadyRunning: true };
      ctx.app.previews.build(args.packIds?.length ? args.packIds : null);
      ctx.note(args.packIds?.length ? `An agent asked for previews of ${args.packIds.length} pack(s)` : 'An agent asked for every preview to be drawn');
      return { started: true };
    },
  }),
  define({
    name: 'clear_previews',
    group: 'organise',
    title: 'Clear previews',
    summary:
      'Throw away the drawn previews, for named packs or the ones that would not draw. Nothing in the library is touched: previews are drawn again when they are next needed.',
    input: z.object({
      packIds: z.array(z.string()).optional().describe('Only these packs. Leave out with failedOnly to clear the markers for files that would not draw.'),
      failedOnly: z.boolean().optional().describe('Only the markers left where drawing failed, so those files are tried once more.'),
    }),
    run: async (args, ctx) => {
      if (!args.packIds?.length && !args.failedOnly) throw new Error('Say which packs, or failedOnly. Clearing every preview is done in the window.');
      const removed = await ctx.app.previews.clear({ packs: args.packIds, failedOnly: args.failedOnly });
      ctx.note(`An agent cleared ${removed} preview(s)`);
      return { removed };
    },
  }),
  define({
    name: 'back_up_now',
    group: 'system',
    title: 'Back up now',
    summary: 'Make a backup of the open library at once, if backups are set up for it.',
    input: z.object({}),
    run: async (_args, ctx) => {
      const ran = await ctx.app.backUpNow();
      if (ran) ctx.note('An agent backed up the library');
      return ran === false
        ? { done: false, why: 'A backup of this library was already running, so nothing new was started. It will finish on its own.' }
        : { done: true };
    },
  }),
];
