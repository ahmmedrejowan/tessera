import type { ProjectUse } from '@shared/project';
import type { BinEntry } from '@shared/types';
import { call } from '../../api';
import { ask } from '../../notices/dialogs';
import { failed, notify } from '../../notices/store';

type Items = { packId: string; ref: string }[];

/** One question, worded for what is about to go. */
const confirm = (title: string, body: string, yes: string) =>
  ask<boolean>({
    tone: 'warning',
    title,
    body,
    actions: [
      { label: 'Cancel', value: false, kind: 'text' },
      { label: yes, value: true, kind: 'danger' },
    ],
  });

/**
 * A line about the games using these things. Nothing is blocked: the copies in a game stay where
 * they are, and Tessera writes the pack's licence and proof beside them before anything goes.
 */
export async function usedIn(packIds: string[], refs?: { packId: string; ref: string }[]): Promise<string> {
  const use = await call('projects:usage', packIds, refs).catch(() => [] as ProjectUse[]);
  if (!use.length) return '';
  const names = use.map((u) => `${u.name} (${u.files} file${u.files === 1 ? '' : 's'})`).join(', ');
  return `\n\nIn use by ${names}. Those copies stay where they are, and their licence and proof are kept beside them in the game.`;
}

/** Put back everything a delete put in the bin, newest first. */
async function putBack(ids: string[]): Promise<void> {
  try {
    for (const id of ids) await call('bin:restore', id);
    notify.success(ids.length === 1 ? 'Back where it was.' : `${ids.length} things are back where they were.`);
  } catch (e) {
    failed(e);
  }
}

/** The bin entries made since `before`, which are the ones this delete put there. */
async function madeNow(before: Set<string>): Promise<string[]> {
  const now = await call('bin:list').catch(() => [] as BinEntry[]);
  return now.filter((e) => !before.has(e.id)).map((e) => e.id);
}

/**
 * Delete files: into the library's own bin, so a mistake can be put back. One file asks once; a
 * pile asks twice, because it can be the whole of a search.
 */
export async function removeAssets(items: () => Promise<Items>, count: number, name?: string): Promise<boolean> {
  const many = count > 1;
  const refs = await items();
  const used = await usedIn([], refs);
  const first = await confirm(
    many ? `Delete ${count.toLocaleString()} assets?` : `Delete ${name ?? 'this asset'}?`,
    many
      ? `Their files move to the library’s bin, where they wait until you empty it. Emptying the bin is what deletes them for good. The packs they came from stay as they are.${used}`
      : `Its file moves to the library’s bin, where it waits until you empty it. Emptying the bin is what deletes it for good. The pack it came from stays as it is.${used}`,
    'Delete',
  );
  if (!first) return false;
  if (many && !(await confirm(`Really delete ${count.toLocaleString()} assets?`, 'That is every one of them, in one go. They will be in the bin until you empty it, and anything already copied into a game stays where it is.', 'Delete them'))) return false;

  try {
    const before = new Set((await call('bin:list').catch(() => [] as BinEntry[])).map((e) => e.id));
    const { removed, inArchive, failed: bad } = await call('assets:remove', refs);
    const undo = await madeNow(before);
    if (removed) {
      notify.success(removed === 1 ? 'In the bin.' : `${removed.toLocaleString()} things are in the bin.`, {
        ...(undo.length ? { action: { label: 'Put it back', run: () => void putBack(undo) } } : {}),
      });
    }
    if (inArchive) {
      notify.info(
        inArchive === 1
          ? 'That file lives inside its pack’s archive, so it is hidden rather than moved. The bin can put it back.'
          : `${inArchive.toLocaleString()} of them live inside their pack’s archive, so they are hidden rather than moved. The bin can put them back.`,
      );
    }
    if (bad) notify.warning(bad === 1 ? 'One file could not be moved to the bin.' : `${bad.toLocaleString()} files could not be moved to the bin.`);
    return removed > 0;
  } catch (e) {
    failed(e);
    return false;
  }
}

/** Delete whole packs, folders and all, into the library's bin. A pile asks twice. */
export async function removePacks(ids: string[], name?: string): Promise<boolean> {
  const many = ids.length > 1;
  const used = await usedIn(ids);
  const first = await confirm(
    many ? `Delete ${ids.length} packs?` : `Delete ${name ?? 'this pack'}?`,
    many
      ? `Their folders move to the library’s bin, licences and all, where they wait until you empty it. Emptying the bin is what deletes them for good.${used}`
      : `Its folder moves to the library’s bin, licence and all, where it waits until you empty it. Emptying the bin is what deletes it for good.${used}`,
    'Delete',
  );
  if (!first) return false;
  if (many && !(await confirm(`Really delete ${ids.length} packs?`, 'Every file in them goes to the bin at once, and the library forgets them until they are put back.', 'Delete them'))) return false;

  const before = new Set((await call('bin:list').catch(() => [] as BinEntry[])).map((e) => e.id));
  let gone = 0;
  for (const id of ids) {
    try {
      await call('pack:remove', id);
      gone++;
    } catch (e) {
      failed(e);
    }
  }
  const undo = await madeNow(before);
  if (gone) {
    notify.success(gone === 1 ? 'The pack is in the bin.' : `${gone} packs are in the bin.`, {
      ...(undo.length ? { action: { label: 'Put it back', run: () => void putBack(undo) } } : {}),
    });
  }
  return gone > 0;
}
