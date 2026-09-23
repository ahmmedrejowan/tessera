import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

/** How long a press has to last before it counts as "pick this one" rather than "open it". */
const HOLD = 400;
/** A press that wanders this far is a drag, not a hold. */
const SLIP = 8;

/**
 * Press and hold to pick something out of a grid. Returns the handlers for a tile, and a way to
 * ask whether the click that follows was the end of a hold, so it does not also open the thing.
 */
export function useHold(onHold: () => void) {
  const timer = useRef<NodeJS.Timeout | null>(null);
  const from = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    from.current = null;
  };

  return {
    /** True when the click that just happened ended a hold. */
    wasHeld: () => {
      const was = held.current;
      held.current = false;
      return was;
    },
    handlers: {
      onPointerDown: (e: ReactPointerEvent) => {
        if (e.button !== 0) return;
        held.current = false;
        from.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          held.current = true;
          stop();
          onHold();
        }, HOLD);
      },
      onPointerMove: (e: ReactPointerEvent) => {
        const start = from.current;
        if (start && (Math.abs(e.clientX - start.x) > SLIP || Math.abs(e.clientY - start.y) > SLIP)) stop();
      },
      onPointerUp: stop,
      onPointerLeave: stop,
      onContextMenu: (e: ReactMouseEvent) => {
        // The mouse's way of saying the same thing.
        e.preventDefault();
        held.current = true;
        onHold();
      },
    },
  };
}
