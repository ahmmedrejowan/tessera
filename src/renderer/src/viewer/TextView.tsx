import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { md, SHAPE } from '../theme';

const MAX = 512 * 1024;

/** Plain text: readmes, licences, spritesheet maps. Long files are cut, with a note. */
export function TextView({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [cut, setCut] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => {
        if (cancelled) return;
        setCut(b.byteLength > MAX);
        setText(new TextDecoder().decode(b.slice(0, MAX)));
      })
      .catch(() => !cancelled && setText(''));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px 48px' }}>
      <pre
        style={{
          margin: '0 auto',
          maxWidth: 900,
          padding: 24,
          borderRadius: SHAPE.md,
          background: md('surfaceContainerLow'),
          color: md('onSurface'),
          font: '13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          userSelect: 'text',
        }}
      >
        {text ?? 'Loading…'}
      </pre>
      {cut && (
        <Typography variant="bodySmall" sx={{ color: md('onSurfaceVariant'), textAlign: 'center', mt: 2 }}>
          Only the first 512 KB is shown.
        </Typography>
      )}
    </div>
  );
}
