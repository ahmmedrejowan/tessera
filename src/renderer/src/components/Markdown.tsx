import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { md, SHAPE } from '../theme';

/**
 * Markdown, drawn.
 *
 * Small on purpose. The only markdown Tessera shows is a credits file, which is headings, lists,
 * links and the odd line of emphasis, and the person may have edited it by hand. Everything is
 * built as elements rather than set as HTML, so a file that happens to contain a script tag is
 * text on the screen and nothing else. What it does not understand it shows as it was written,
 * which for a credits file is the right answer anyway.
 */

/** Emphasis, code and links, in the order they appear. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Code first: what is inside backticks is never anything else.
  const pattern = /`([^`]+)`|\[([^\]]*)\]\(([^)\s]+)[^)]*\)|(\*\*|__)(.+?)\4|(\*|_)(.+?)\6|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s)<]+)/g;
  let at = 0;
  let n = 0;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    if (m.index > at) out.push(text.slice(at, m.index));
    const id = `${key}-${n++}`;
    if (m[1] !== undefined) {
      out.push(
        <code key={id} style={{ background: md('surfaceContainerHighest'), borderRadius: SHAPE.xs, padding: '1px 5px', fontSize: '0.9em' }}>
          {m[1]}
        </code>,
      );
    } else if (m[3] !== undefined) {
      out.push(
        <a key={id} href={m[3]} target="_blank" rel="noreferrer" style={{ color: md('primary') }}>
          {m[2] || m[3]}
        </a>,
      );
    } else if (m[5] !== undefined) {
      out.push(<strong key={id}>{inline(m[5], id)}</strong>);
    } else if (m[7] !== undefined) {
      out.push(<em key={id}>{inline(m[7], id)}</em>);
    } else {
      const url = m[8] ?? m[9]!;
      out.push(
        <a key={id} href={url} target="_blank" rel="noreferrer" style={{ color: md('primary') }}>
          {url}
        </a>,
      );
    }
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

const HEADING = ['headlineSmall', 'titleLarge', 'titleMedium', 'titleSmall', 'titleSmall', 'titleSmall'] as const;

export function Markdown({ text }: { text: string }): ReactNode {
  const lines = text.split(/\r?\n/);
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  /** The lines of a fenced code block, while one is open. Held in an object so its type survives
      the closure below. */
  const fence: { lines: string[] | null } = { lines: null };
  const flushList = () => {
    if (!list.length) return;
    out.push(
      <ul key={`ul-${out.length}`} style={{ margin: '0 0 12px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {list}
      </ul>,
    );
    list = [];
  };
  lines.forEach((line, i) => {
    if (fence.lines !== null) {
      if (/^\s*```/.test(line)) {
        out.push(
          <pre key={`pre-${i}`} style={{ margin: '0 0 12px', padding: 12, borderRadius: SHAPE.md, background: md('surfaceContainerHighest'), overflowX: 'auto', fontSize: 13 }}>
            {fence.lines.join('\n')}
          </pre>,
        );
        fence.lines = null;
      } else fence.lines.push(line);
      return;
    }
    if (/^\s*```/.test(line)) {
      flushList();
      fence.lines = [];
      return;
    }
    // A comment is how the credits file says it is written by Tessera; it is not for reading here.
    if (/^\s*<!--/.test(line)) return;
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1]!.length;
      out.push(
        <Typography key={`h-${i}`} variant={HEADING[level - 1]!} component={`h${Math.min(level + 1, 6)}` as 'h2'} sx={{ color: md('onSurface'), mt: out.length ? 2 : 0, mb: 1 }}>
          {inline(heading[2]!, `h-${i}`)}
        </Typography>,
      );
      return;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flushList();
      out.push(<hr key={`hr-${i}`} style={{ border: 0, borderTop: `1px solid ${md('outlineVariant')}`, margin: '16px 0' }} />);
      return;
    }
    const item = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      list.push(
        <li key={`li-${i}`}>
          <Typography variant="bodyMedium" component="span" sx={{ color: md('onSurface') }}>
            {inline(item[1]!, `li-${i}`)}
          </Typography>
        </li>,
      );
      return;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushList();
      out.push(
        <Typography key={`q-${i}`} variant="bodyMedium" sx={{ color: md('onSurfaceVariant'), borderLeft: `3px solid ${md('outlineVariant')}`, pl: 1.5, mb: 1.5 }}>
          {inline(quote[1]!, `q-${i}`)}
        </Typography>,
      );
      return;
    }
    if (!line.trim()) {
      flushList();
      return;
    }
    flushList();
    out.push(
      <Typography key={`p-${i}`} variant="bodyMedium" component="p" sx={{ color: md('onSurface'), m: '0 0 12px' }}>
        {inline(line, `p-${i}`)}
      </Typography>,
    );
  });
  flushList();
  // A fence nobody closed is still text somebody wrote, so it is shown rather than dropped.
  if (fence.lines?.length) {
    out.push(
      <pre key="pre-end" style={{ margin: '0 0 12px', padding: 12, borderRadius: SHAPE.md, background: md('surfaceContainerHighest'), overflowX: 'auto', fontSize: 13 }}>
        {fence.lines.join('\n')}
      </pre>,
    );
  }
  return <div style={{ minWidth: 0 }}>{out}</div>;
}
