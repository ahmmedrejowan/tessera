import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** How fast the text slides past, in pixels a second. Slow enough to read. */
const SPEED = 55;

/**
 * A line that is cut off where it runs out of room, and slides itself along while the pointer is
 * on it so the rest can be read. It goes back where it was as soon as the pointer leaves, and
 * anything that fits doesn't move at all.
 */
export function Scrolling({ children, title, style }: { children: ReactNode; title?: string; style?: CSSProperties }) {
  const inner = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(0);
  const [on, setOn] = useState(false);

  const enter = () => {
    const el = inner.current;
    const hidden = el ? el.scrollWidth - el.clientWidth : 0;
    setOver(Math.max(0, hidden));
    setOn(true);
  };

  return (
    <span
      onMouseEnter={enter}
      onMouseLeave={() => setOn(false)}
      {...(title ? { title } : {})}
      style={{ display: 'block', overflow: 'hidden', minWidth: 0, ...style }}
    >
      <span
        ref={inner}
        style={{
          display: 'block',
          overflow: 'hidden',
          textOverflow: on && over ? 'clip' : 'ellipsis',
          whiteSpace: 'nowrap',
          // Away at reading pace, back briskly: waiting to see the start again is annoying.
          transition: `transform ${on && over ? Math.max(0.5, over / SPEED) : 0.25}s linear`,
          transform: on && over ? `translateX(-${over}px)` : 'none',
        }}
      >
        {children}
      </span>
    </span>
  );
}
