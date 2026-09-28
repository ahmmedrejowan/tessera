import { create } from 'zustand';
import type { PackMeta } from '@shared/pack';
import { missingForLibrary } from '@shared/pack';
import type { PackRow } from '@shared/query';
import { sourceFromUrl, sourceInfo } from '@shared/sources';
import type { Detected, ImportItem, PackSuggestions } from '@shared/types';
import { call } from '../api';
import { failed, notify } from '../notices/store';
import { useNav } from './nav';

/** Where a filled-in value came from: read in the pack (sure) or worked out (a guess to check). */
export interface Found {
  from: string;
  sure: boolean;
}

/** What the add page shows for one pack: its details, as the user will save them. */
export interface AddForm {
  name: string;
  licence: string | null;
  attribution: string;
  site: string | null;
  url: string;
  /** "I don't know" / "I made it", or another place with no link. */
  sourceName: string | null;
  creator: string;
  description: string;
  version: string;
  styles: string[];
  tags: string[];
  /** Keep a record of the download page: a snapshot, and a copy on archive.org. */
  snapshot: boolean;
  archive: boolean;
}

/**
 * What adding does with the files.
 *
 * `copy` is the default and the right answer for a download. `move` frees the disk. `keep` is for
 * somebody who already has hundreds of gigabytes where they want them: the library takes the
 * record and reads the files where they are, and never writes in that folder.
 */
export type AddMode = 'copy' | 'move' | 'keep';

export type FoundField = 'name' | 'licence' | 'source' | 'creator' | 'description' | 'version' | 'styles' | 'tags';

export interface Draft {
  item: ImportItem;
  /** The pack, once copied in (it waits, unfinished, until the user decides). */
  packId: string | null;
  state: 'copying' | 'ready' | 'failed';
  error?: string;
  row?: PackRow;
  meta?: PackMeta;
  form: AddForm;
  found: Partial<Record<FoundField, Found>>;
}

export const I_DONT_KNOW = 'Unknown';
export const I_MADE_IT = 'Made by me';

/** Licence and source are what a pack needs to go into the library. */
export const isReady = (f: AddForm) => !!f.licence && (!!f.site || !!f.url.trim() || !!f.sourceName);

const blank = (item: ImportItem): AddForm => ({ name: item.name, licence: null, attribution: '', site: null, url: '', sourceName: null, creator: '', description: '', version: '', styles: [], tags: [], snapshot: true, archive: true });

/** The form as the pack's record and what its files suggest fill it in, with where each came from. */
function filled(item: ImportItem, meta: PackMeta, detected: Detected, s: PackSuggestions): Pick<Draft, 'form' | 'found'> {
  const found: Draft['found'] = {};
  const form = blank(item);
  form.name = meta.name;
  if (s.name?.sure) {
    form.name = s.name.value;
    found.name = { from: s.name.from, sure: true };
  } else found.name = { from: 'the file name', sure: false };
  form.licence = meta.licence.id;
  form.attribution = meta.licence.attribution ?? '';
  if (meta.licence.id && detected.licenceFrom) found.licence = { from: detected.licenceFrom, sure: !!detected.licenceSure };
  form.site = meta.source.site;
  form.url = meta.source.url ?? '';
  form.sourceName = meta.source.name;
  if (meta.source.url && detected.url) found.source = { from: detected.urlFrom ?? 'a link in the pack', sure: detected.urlFrom !== 'the file name' };
  else if (meta.source.site) found.source = { from: `${sourceInfo(meta.source.site)?.name ?? 'the site'}, recognised from the pack`, sure: true };
  form.creator = meta.source.creator ?? s.creator?.value ?? '';
  if (form.creator) found.creator = s.creator ? { from: s.creator.from, sure: s.creator.sure } : { from: 'the site', sure: true };
  form.description = meta.description || s.description?.value || '';
  if (!meta.description && s.description) found.description = { from: s.description.from, sure: s.description.sure };
  form.version = meta.version ?? s.version?.value ?? '';
  if (!meta.version && s.version) found.version = { from: s.version.from, sure: s.version.sure };
  form.styles = meta.styles.length ? meta.styles : (s.styles?.value ?? []);
  if (!meta.styles.length && s.styles) found.styles = { from: s.styles.from, sure: false };
  form.tags = meta.tags.length ? meta.tags : (s.tags?.value ?? []);
  if (!meta.tags.length && s.tags) found.tags = { from: s.tags.from, sure: false };
  return { form, found };
}

interface AddingState {
  drafts: Draft[];
  /** Items left out because the library seems to have them already. */
  skipped: ImportItem[];
  /** The packs picked in the list (several for filling in at once); the first is the one shown. */
  selected: string[];
  /** When the packs came from one folder of downloads, that folder (to take it as one pack instead). */
  folder: string | null;
  busy: boolean;
  /** The user picked in the list: the page stops choosing for them. */
  touched: boolean;
  /**
   * Let go of the files these packs were made from, once they are kept.
   *
   * Starts from the setting and can be changed for this batch alone. Nothing is removed until a
   * pack is actually saved, so cancelling always leaves the originals where they are.
   */
  move: boolean;
  setMove(on: boolean): void;
  /**
   * What happens to the files: the library takes a copy, takes them over, or reads them where
   * they are. Chosen before anything is written, because it decides what writing even happens.
   */
  mode: AddMode;
  setMode(mode: AddMode): Promise<void>;
  /** `urls`: where each path was downloaded from, when Tessera fetched it. */
  start(paths: string[], eachInside: boolean | 'auto', urls?: Record<string, string>): Promise<void>;
  addAnyway(item: ImportItem): Promise<void>;
  select(ids: string[]): void;
  edit(itemId: string, patch: Partial<AddForm>, found?: Draft['found']): void;
  /** Change the same fields on every selected pack. */
  editSelected(patch: Partial<AddForm>, found?: Draft['found']): void;
  /** Save these packs: complete ones into the library, the rest (or all, with `later`) to Review. */
  save(itemIds: string[], opts?: { later?: boolean }): Promise<void>;
  /** Save whatever is left for Review (leaving the page). */
  finishLater(): Promise<void>;
  cancel(): Promise<void>;
  treatAsOnePack(): Promise<void>;
  /**
   * The other way: one pack becomes one per folder inside it, with anything loose gathered into
   * a pack of its own. A folder with both subfolders and stray files is read as one pack,
   * because guessing wrong there is worse than asking, so there has to be a way to say otherwise.
   */
  splitIntoPacks(): Promise<void>;
  restart(paths: string[], eachInside: boolean): Promise<void>;
  /** What `start` was last given, kept so the mode can be changed after staging. */
  staged: { paths: string[]; eachInside: boolean | 'auto'; urls?: Record<string, string> } | null;
}

/**
 * Packs have just joined the library, and a game may already be shipping them.
 *
 * Whoever links their game first and adds their packs second would otherwise have to know that
 * "find assets already here" exists and think to go back for it. The other order prompts itself,
 * because the game is right there when the pack is linked; this is the same prompt for people who
 * arrive the other way round.
 */
async function offerToLookInGames(added: number): Promise<void> {
  const games = await call('projects:list').catch(() => []);
  const here = games.filter((g) => g.exists);
  if (!here.length) return;
  const one = here.length === 1 ? here[0]! : null;
  notify.info(
    one
      ? `${one.name} may already have some of ${added === 1 ? 'it' : 'them'}.`
      : `Your games may already have some of ${added === 1 ? 'it' : 'them'}.`,
    {
      body: 'Tessera can look, and record what it finds where the game already keeps it, instead of copying anything.',
      action: {
        label: one ? 'Look in it' : 'Open Projects',
        run: () => useNav.getState().go(one ? { to: 'project', id: one.id } : { to: 'projects' }),
      },
    },
  );
}

/** Copy the items in (waiting, unfinished), then fill each form from what was found. */
async function stage(items: ImportItem[], set: (fn: (s: AddingState) => Partial<AddingState>) => void, mode: AddMode = 'copy') {
  try {
    const result = await call('import:run', items, { stage: true, keep: mode === 'keep' });
    for (const f of result.failed) {
      // By id, not by name: two downloads can land on the same name, and marking the wrong draft
      // left the one that really failed stuck on "Copying into the library" for ever.
      set((s) => ({ drafts: s.drafts.map((d) => (d.item.id === f.item ? { ...d, state: 'failed', error: f.error } : d)) }));
    }
    await Promise.all(
      result.added.map(async (a) => {
        const item = items.find((i) => i.id === a.item)!;
        const [row, details] = await Promise.all([call('pack:get', a.id), call('pack:details', a.id)]);
        if (!row) return;
        const { form, found } = filled(item, row.meta, details.detected, details.suggestions);
        set((s) => ({
          drafts: s.drafts.map((d) => {
            if (d.item.id !== item.id) return d;
            // Anything the user already typed while it was copying wins.
            const typed = Object.fromEntries(Object.entries(d.form).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(blank(item)[k as keyof AddForm])));
            return { ...d, packId: a.id, state: 'ready', row, meta: row.meta, form: { ...form, ...typed }, found };
          }),
        }));
      }),
    );
  } catch (e) {
    failed(e, 'Couldn’t add the packs');
    set((s) => ({ drafts: s.drafts.map((d) => (d.state === 'copying' ? { ...d, state: 'failed', error: e instanceof Error ? e.message : String(e) } : d)) }));
  }
}

/** Write the form to the pack, and move it into the library when asked and complete. */
async function write(d: Draft, toLibrary: boolean, move: boolean): Promise<'library' | 'review'> {
  if (!d.packId || !d.meta) return 'review';
  const f = d.form;
  const site = f.site ?? (f.url ? (sourceFromUrl(f.url)?.id ?? null) : null);
  await call('pack:edit', d.packId, {
    name: f.name.trim() || d.meta.name,
    version: f.version.trim() || null,
    description: f.description.trim(),
    styles: f.styles,
    tags: f.tags,
    licence: { ...d.meta.licence, id: f.licence, attribution: f.attribution.trim() || null },
    source: { ...d.meta.source, site, url: f.url.trim() || null, name: f.sourceName, creator: f.creator.trim() || null },
  });
  const complete = !missingForLibrary({ licence: { ...d.meta.licence, id: f.licence }, source: { ...d.meta.source, site, url: f.url.trim() || null, name: f.sourceName } }).length;
  if (f.url.trim() && (f.snapshot || f.archive)) void call('pack:recordPage', d.packId, { snapshot: f.snapshot, archive: f.archive }).catch(() => undefined);
  // Kept, either in the library or in Review, so whatever it was made from may go now. It could
  // not go earlier: until this point the person could still cancel and get nothing.
  if (move) await call('import:takeOriginals', d.packId).catch(() => undefined);
  if (toLibrary && complete) {
    await call('pack:status', d.packId, 'library');
    return 'library';
  }
  return 'review';
}

const summary = (library: number, review: number) =>
  [library && `${library} added to the library`, review && `${review} waiting in Review`].filter(Boolean).join(', ') + '.';

export const useAdding = create<AddingState>((set, get) => ({
  drafts: [],
  skipped: [],
  selected: [],
  folder: null,
  busy: false,
  touched: false,
  // Starts from the app setting; the choice on the page wins for this batch.
  move: false,
  setMove: (on) => set({ move: on, mode: on ? 'move' : 'copy' }),
  mode: 'copy',
  async setMode(mode) {
    const before = get().mode;
    if (before === mode) return;
    set({ mode, move: mode === 'move' });
    // Copy and move put the same thing in the same place; they differ only at the end, when the
    // original is let go of. Nothing on disk has to change, so nothing does.
    if ((before === 'keep') === (mode === 'keep')) return;
    // Crossing into or out of "in place" does change what was written, so it is written again.
    // In place, without leaving the page: cancelling used to navigate away and back, which threw
    // the whole window about for what is meant to be a choice between three words.
    const items = get().drafts.map((d) => d.item);
    if (!items.length) return;
    // Read before the drafts are cleared, or there is nothing left to say what to throw away.
    const written = get().drafts.map((d) => d.packId).filter((id): id is string => !!id);
    set({ busy: true, drafts: get().drafts.map((d) => ({ ...d, packId: null, state: 'copying' as const })) });
    for (const id of written) await call('pack:discard', id).catch(() => undefined);
    await stage(items, set, mode);
    set({ busy: false });
  },
  /** What `start` was given, so the mode can still be changed after staging. */
  staged: null,

  async start(paths, eachInside, urls) {
    if (!paths.length) return;
    // Packs still open here from before are kept for Review first.
    if (get().drafts.length) await get().finishLater();
    let items: ImportItem[];
    try {
      const planned = await call('import:plan', paths, eachInside);
      // A downloaded pack knows the link it came from.
      items = urls ? planned.map((i) => ({ ...i, ...(urls[i.sources[0] ?? ''] ? { url: urls[i.sources[0]!]! } : {}) })) : planned;
    } catch (e) {
      failed(e);
      return;
    }
    if (!items.length) {
      notify.info('Nothing to add there.');
      return;
    }
    const fresh = items.filter((i) => !i.duplicateOf);
    const skipped = items.filter((i) => i.duplicateOf);
    if (!fresh.length) {
      // Nothing new: say so, rather than open an empty page.
      notify.info(skipped.length === 1 ? `“${skipped[0]!.name}” is already in your library.` : `These ${skipped.length} packs are already in your library.`, {
        action: {
          label: 'Add anyway',
          run: () => {
            set({ drafts: [], skipped: [], selected: [], folder: null, touched: false });
            useNav.getState().go({ to: 'adding' });
            for (const item of skipped) void get().addAnyway(item);
          },
        },
      });
      return;
    }
    const folders = new Set(fresh.map((i) => i.folder ?? ''));
    set({
      drafts: fresh.map((item) => ({ item, packId: null, state: 'copying', form: blank(item), found: {} })),
      skipped,
      selected: fresh[0] ? [fresh[0].id] : [],
      folder: folders.size === 1 && fresh[0]?.folder ? fresh[0].folder : null,
      touched: false,
    });
    set({ staged: { paths, eachInside, urls } });
    useNav.getState().go({ to: 'adding' });
    if (fresh.length) await stage(fresh, set, get().mode);
    // Start with the first pack that needs something, unless the user already picked one.
    const first = get().drafts.find((d) => d.state === 'ready' && !isReady(d.form));
    if (first && !get().touched) set({ selected: [first.item.id] });
  },

  async addAnyway(item) {
    set((s) => ({ skipped: s.skipped.filter((i) => i.id !== item.id), drafts: [...s.drafts, { item, packId: null, state: 'copying', form: blank(item), found: {} }], selected: [item.id] }));
    await stage([item], set);
  },

  select: (ids) => set({ selected: ids, touched: true }),

  edit(itemId, patch, found) {
    set((s) => ({ drafts: s.drafts.map((d) => (d.item.id === itemId ? { ...d, form: { ...d.form, ...patch }, found: { ...d.found, ...found } } : d)) }));
  },

  editSelected(patch, found) {
    const ids = new Set(get().selected);
    set((s) => ({ drafts: s.drafts.map((d) => (ids.has(d.item.id) ? { ...d, form: { ...d.form, ...patch }, found: { ...d.found, ...found } } : d)) }));
  },

  async save(itemIds, opts = {}) {
    const ids = new Set(itemIds);
    const going = get().drafts.filter((d) => ids.has(d.item.id) && d.state === 'ready');
    if (!going.length) return;
    set({ busy: true });
    let library = 0;
    let review = 0;
    try {
      for (const d of going) {
        if ((await write(d, !opts.later, get().move)) === 'library') library++;
        else review++;
      }
      const left = get().drafts.filter((d) => !going.some((g) => g.item.id === d.item.id));
      set({ drafts: left, selected: left[0] ? [left[0].item.id] : [] });
      notify.success(summary(library, review), review ? { action: { label: 'Review', run: () => useNav.getState().go({ to: 'inbox' }) } } : {});
      if (library) void offerToLookInGames(library);
      if (!left.some((d) => d.state !== 'failed')) {
        set({ drafts: [], skipped: [], folder: null });
        useNav.getState().goBack();
      }
    } catch (e) {
      failed(e, 'Couldn’t save the packs');
    } finally {
      set({ busy: false });
    }
  },

  async finishLater() {
    const left = get().drafts.filter((d) => d.state === 'ready');
    set({ drafts: [], skipped: [], selected: [], folder: null });
    let n = 0;
    for (const d of left) {
      try {
        await write(d, false, get().move);
        n++;
      } catch {
        // It's in Review with what it had.
      }
    }
    if (n) notify.info(`${n} pack${n === 1 ? '' : 's'} waiting in Review.`, { action: { label: 'Review', run: () => useNav.getState().go({ to: 'inbox' }) } });
  },

  async cancel() {
    const all = get().drafts;
    set({ drafts: [], skipped: [], selected: [], folder: null, busy: true });
    for (const d of all) if (d.packId) await call('pack:discard', d.packId).catch(() => undefined);
    set({ busy: false });
    useNav.getState().goBack();
  },

  async treatAsOnePack() {
    const folder = get().folder;
    if (!folder) return;
    await get().restart([folder], false);
  },

  async splitIntoPacks() {
    // The single pack came from one folder, so that folder is what gets split.
    const only = get().drafts;
    const from = get().folder ?? (only.length === 1 && only[0]!.item.kind === 'folder' ? only[0]!.item.sources[0] : null);
    if (!from) return;
    await get().restart([from], true);
  },

  /** Throw away what was staged and plan the same paths a different way. */
  async restart(paths: string[], eachInside: boolean) {
    const all = get().drafts;
    set({ drafts: [], busy: true });
    for (const d of all) if (d.packId) await call('pack:discard', d.packId).catch(() => undefined);
    set({ busy: false });
    await get().start(paths, eachInside);
  },
}));
