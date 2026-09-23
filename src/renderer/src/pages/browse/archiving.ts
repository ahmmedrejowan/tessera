import { call } from '../../api';
import { failed, notify } from '../../notices/store';
import { useNav } from '../../state/nav';

/**
 * Put a pack away, or bring it back. Putting one away takes it out of browsing, so the message
 * says where it went and offers the way there.
 */
export async function archivePack(id: string, on: boolean): Promise<void> {
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
