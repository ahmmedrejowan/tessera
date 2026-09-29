import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { md, SHAPE } from '../theme';

/**
 * What to show while something is on its way.
 *
 * A spinner says only "wait", and it says it exactly as convincingly after five minutes as after
 * five milliseconds, which is how an app that is stuck and an app that is working came to look
 * identical. The shape of the page arrives first instead: a heading, a line of facts, a grid of
 * tiles, all in the colours the real thing will use. That reads as "this is nearly here", and it
 * also stops the window jumping when the content lands, because the space is already the right
 * size.
 */

const wave = { animation: 'wave' } as const;

/** The head of a page: something the size of a title, and something the size of a line about it. */
function HeaderBones() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '20px 32px 12px' }}>
      <Skeleton variant="rounded" width={72} height={72} sx={{ borderRadius: `${SHAPE.md}px`, flexShrink: 0 }} {...wave} />
      <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
        <Skeleton variant="text" width="34%" height={34} {...wave} />
        <Skeleton variant="text" width="52%" height={20} {...wave} />
      </div>
    </div>
  );
}

/**
 * The shape of a page while it arrives: a head, then a grid of tiles the size the real ones will
 * be. `tiles` is how many to draw, which is a screenful for a page of assets and fewer for a page
 * that is mostly words.
 */
export function PageSkeleton({ tiles = 12 }: { tiles?: number }) {
  return (
    <div aria-hidden style={{ height: '100%', overflow: 'hidden' }}>
      <HeaderBones />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, padding: '12px 32px' }}>
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i}>
            <Skeleton variant="rounded" height={128} sx={{ borderRadius: `${SHAPE.md}px` }} {...wave} />
            <Skeleton variant="text" width="70%" height={18} sx={{ mt: 0.5 }} {...wave} />
            <Skeleton variant="text" width="40%" height={14} {...wave} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** How long a library may take to open before the window says something about it. */
const SAY_SOMETHING = 6000;

/**
 * The library opening.
 *
 * Almost always a beat, so it is the page's own shape rather than a message. When it is not a
 * beat, the usual reason is that the operating system has put a question in front of the person
 * and the window cannot see it: macOS asks once for the folder the library lives in, and until
 * that is answered nothing here can read anything. A spinner in that situation looks exactly like
 * a hang, so after a few seconds this says what to look for.
 */
export function OpeningLibrary() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SAY_SOMETHING);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <PageSkeleton />
      </div>
      {slow && (
        <div style={{ padding: '16px 32px 28px', textAlign: 'center' }}>
          <Typography variant="bodyMedium" sx={{ color: md('onSurfaceVariant') }}>
            Still opening your library.
          </Typography>
          <Typography variant="bodySmall" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5, opacity: 0.85 }}>
            If your computer has asked for permission to read the folder it is in, answer that and this will carry on.
          </Typography>
        </div>
      )}
    </div>
  );
}
