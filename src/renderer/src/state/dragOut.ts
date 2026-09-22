import type { DragEvent, MouseEvent } from 'react';

type Items = { packId: string; ref: string }[];

/**
 * Props that let an element be dragged out to other apps (an engine, Blender, a file manager).
 * Files are made ready on mouse-down, so by the time the drag starts they're usually on disk.
 */
export function dragOutProps(items: () => Items | Promise<Items>) {
  let ready: Promise<string[]> | null = null;
  return {
    draggable: true,
    onMouseDown: (e: MouseEvent) => {
      if (e.button !== 0) return;
      ready = Promise.resolve(items()).then((list) => window.tessera.prepareDrag(list));
    },
    onDragStart: (e: DragEvent) => {
      e.preventDefault();
      const pending = ready ?? Promise.resolve(items()).then((list) => window.tessera.prepareDrag(list));
      void pending.then((paths) => paths.length && window.tessera.startDrag(paths));
    },
  };
}
