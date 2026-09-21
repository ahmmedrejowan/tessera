import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

interface Props {
  count: number;
  /** Tiles are at least this wide; spare width is shared out so rows fill the width. */
  minItemWidth: number;
  /** Height of a tile given its actual width. */
  itemHeight: (width: number) => number;
  gap?: number;
  padding?: number;
  render: (index: number, width: number) => ReactNode;
  /** Called with the first and last visible item index, for loading data. */
  onRangeChange?: (start: number, end: number) => void;
  /** Called with the column count, for keyboard navigation. */
  onColumns?: (columns: number) => void;
  scrollRef?: RefObject<HTMLDivElement | null>;
  /** Bring this item into view when it changes. */
  scrollToIndex?: number | null;
  footer?: ReactNode;
}

function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** A grid that only renders the rows in view, so a hundred thousand tiles scroll as smoothly as ten. */
export function VirtualGrid({ count, minItemWidth, itemHeight, gap = 12, padding = 24, render, onRangeChange, onColumns, scrollRef, scrollToIndex, footer }: Props) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = scrollRef ?? ownRef;
  const width = useWidth(ref);
  const inner = Math.max(0, width - padding * 2);
  const columns = Math.max(1, Math.floor((inner + gap) / (minItemWidth + gap)));
  const itemWidth = columns > 0 ? Math.floor((inner - gap * (columns - 1)) / columns) : minItemWidth;
  const rowHeight = itemHeight(itemWidth) + gap;
  const rows = Math.ceil(count / columns);

  const v = useVirtualizer({ count: rows, getScrollElement: () => ref.current, estimateSize: () => rowHeight, overscan: 4, paddingStart: padding, paddingEnd: padding });
  useEffect(() => {
    v.measure();
  }, [rowHeight, columns, v]);
  useEffect(() => {
    onColumns?.(columns);
  }, [columns, onColumns]);

  const items = v.getVirtualItems();
  const firstRow = items[0]?.index ?? 0;
  const lastRow = items.at(-1)?.index ?? 0;
  useEffect(() => {
    onRangeChange?.(firstRow * columns, Math.min(count - 1, (lastRow + 1) * columns - 1));
  }, [firstRow, lastRow, columns, count, onRangeChange]);

  useEffect(() => {
    if (scrollToIndex != null && scrollToIndex >= 0) v.scrollToIndex(Math.floor(scrollToIndex / columns), { align: 'auto' });
  }, [scrollToIndex, columns, v]);

  return (
    <div ref={ref} style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
      <div style={{ height: v.getTotalSize(), position: 'relative' }}>
        {width > 0 &&
          items.map((row) => (
            <div
              key={row.key}
              style={{ position: 'absolute', top: 0, left: padding, right: padding, height: rowHeight - gap, transform: `translateY(${row.start}px)`, display: 'flex', gap }}
            >
              {Array.from({ length: columns }, (_, c) => {
                const i = row.index * columns + c;
                return i < count ? (
                  <div key={i} style={{ width: itemWidth, flexShrink: 0 }}>
                    {render(i, itemWidth)}
                  </div>
                ) : null;
              })}
            </div>
          ))}
      </div>
      {footer}
    </div>
  );
}
