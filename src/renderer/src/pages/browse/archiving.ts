import { call } from '../../api';
import { ask } from '../../notices/dialogs';
import { failed, notify } from '../../notices/store';
import { useNav } from '../../state/nav';
import { usedIn } from './deleting';

/**
 * Put a pack away, or bring it back. Putting one away takes it out of browsing, so the message
 * says where it went and offers the way there.
 */
export async function archivePack(id: string, on: boolean): Promise<void> {
  if (on) {
    // A game using it is worth saying out loud, though it never stops the archiving.
    const used = await usedIn([id]);
    if (
      used &&
      !(await ask<boolean>({
        tone: 'warning',
        title: 'Archive this pack?',
        body: `It keeps everything and simply isn’t browsed.${used}`,
        actions: [
          { label: 'Cancel', value: false, kind: 'text' },
          { label: 'Archive', value: true, kind: 'primary' },
        ],
      }))
    ) {
      return;
    }
  }
  try {
    await call('pack:archive', id, on);
    if (on) {
      notify.success('Archived. It keeps everything; it just isn’t browsed.', {
        action: { label: 'Show the archive', run: () => useNav.getState().go({ to: 'archive' }) },
      });
    } else {
      notify.success('Back in the library.');
    }
  } catch (e) {
    failed(e);
  }
}
