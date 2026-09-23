import { call } from '../../api';
import { failed, notify } from '../../notices/store';
import { useBrowse } from '../../state/browse';

/**
 * Put a pack away, or bring it back. Putting one away takes it out of browsing, so the message
 * says where it went and offers the way there.
 */
export async function archivePack(id: string, on: boolean): Promise<void> {
  try {
    await call('pack:archive', id, on);
    if (on) {
      notify.success('Put away. It keeps everything; it just isn’t browsed.', {
        action: { label: 'Show what’s put away', run: () => useBrowse.getState().setArchived(true) },
      });
    } else {
      notify.success('Back in the library.');
    }
  } catch (e) {
    failed(e);
  }
}
