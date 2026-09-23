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
 * Delete files: to the system wastebasket, so a mistake can be put back. One file asks once; a
 * pile asks twice, because it can be the whole of a search.
 */
export async function removeAssets(items: () => Promise<Items>, count: number, name?: string): Promise<boolean> {
  const many = count > 1;
  const first = await confirm(
    many ? `Delete ${count.toLocaleString()} assets?` : `Delete ${name ?? 'this asset'}?`,
    many
      ? 'Their files go to the system wastebasket. The packs they came from stay, with their licences and credit lines as they are.'
      : 'Its file goes to the system wastebasket. The pack it came from stays, with its licence and credit line as they are.',
    'Delete',
  );
  if (!first) return false;
  if (many && !(await confirm(`Really delete ${count.toLocaleString()} assets?`, 'That is every one of them, in one go. Anything already copied into a game stays where it is.', 'Delete them'))) return false;

  try {
    const { removed, inArchive, failed: bad } = await call('assets:remove', await items());
    if (removed) notify.success(removed === 1 ? 'The file is in the wastebasket.' : `${removed.toLocaleString()} files are in the wastebasket.`);
    if (inArchive) {
      notify.info(
        inArchive === 1
          ? 'That file lives inside its pack’s archive, so it stayed. Remove the whole pack to be rid of it.'
          : `${inArchive.toLocaleString()} of them live inside their pack’s archive, so they stayed. Remove the whole pack to be rid of those.`,
      );
    }
    if (bad) notify.warning(bad === 1 ? 'One file could not be moved to the wastebasket.' : `${bad.toLocaleString()} files could not be moved to the wastebasket.`);
    return removed > 0;
  } catch (e) {
    failed(e);
    return false;
  }
}

/** Delete whole packs, folders and all, to the wastebasket. A pile asks twice. */
export async function removePacks(ids: string[], name?: string): Promise<boolean> {
  const many = ids.length > 1;
  const first = await confirm(
    many ? `Delete ${ids.length} packs?` : `Delete ${name ?? 'this pack'}?`,
    many
      ? 'Their folders go to the system wastebasket, licences and all. Anything already copied into a game stays where it is.'
      : 'Its folder goes to the system wastebasket, licence and all. Anything already copied into a game stays where it is.',
    'Delete',
  );
  if (!first) return false;
  if (many && !(await confirm(`Really delete ${ids.length} packs?`, 'Every file in them goes at once, and the library forgets them.', 'Delete them'))) return false;

  let gone = 0;
  for (const id of ids) {
    try {
      await call('pack:remove', id);
      gone++;
    } catch (e) {
      failed(e);
    }
  }
  if (gone) notify.success(gone === 1 ? 'The pack is in the wastebasket.' : `${gone} packs are in the wastebasket.`);
  return gone > 0;
}
