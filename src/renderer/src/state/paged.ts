import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type { Page } from '@shared/query';

export const PAGE_SIZE = 200;

/**
 * Rows of a large result, fetched a page at a time as they scroll into view. The first page
 * also gives the total, which sizes the scroll area; while a new query loads, the previous
 * result stays on screen instead of flashing empty.
 */
export function usePagedRows<T>(key: readonly unknown[], fetchPage: (offset: number, limit: number) => Promise<Page<T>>, enabled = true) {
  // Which pages are on screen, not which rows. The grid reports a new range every row the scroll
  // crosses, and each one used to set state, re-render the page and re-render every tile on it.
  // Only the page numbers are ever read, and those change once every two hundred rows.
  const [visible, setVisible] = useState<{ from: number; to: number }>({ from: 0, to: 0 });
  const first = useQuery({
    queryKey: [...key, 0],
    queryFn: () => fetchPage(0, PAGE_SIZE),
    enabled,
    placeholderData: keepPreviousData,
  });
  const total = first.data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const pages = useMemo(() => {
    const from = Math.min(visible.from, lastPage);
    const to = Math.min(visible.to, lastPage);
    const out: number[] = [];
    for (let p = Math.max(1, from); p <= to; p++) out.push(p);
    return out;
  }, [visible.from, visible.to, lastPage]);
  const more = useQueries({
    queries: pages.map((p) => ({
      queryKey: [...key, p],
      queryFn: () => fetchPage(p * PAGE_SIZE, PAGE_SIZE),
      enabled: enabled && !first.isPlaceholderData,
      // The same as the first page, and for the same reason. Without it, anything that changes
      // the key (starring one thing bumps the whole index) emptied every page but the first,
      // so a grid scrolled past two hundred rows blanked and refilled under the pointer.
      placeholderData: keepPreviousData,
    })),
  });
  // useQueries hands back a new array every render, so depending on it rebuilt this map, and the
  // get() below it, on every render: a new get() re-renders every tile on screen. The data behind
  // it only changes when a page arrives, which is what this signature tracks.
  const fetched = more.map((m) => m.dataUpdatedAt).join(',');
  const loaded = useMemo(() => {
    const m = new Map<number, T[]>();
    if (first.data) m.set(0, first.data.rows);
    pages.forEach((p, i) => {
      const rows = more[i]?.data?.rows;
      if (rows) m.set(p, rows);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fetched` stands in for `more`.
  }, [first.data, pages, fetched]);
  const get = useCallback((index: number): T | undefined => loaded.get(Math.floor(index / PAGE_SIZE))?.[index % PAGE_SIZE], [loaded]);
  const setRange = useCallback((start: number, end: number) => {
    const from = Math.floor(start / PAGE_SIZE);
    const to = Math.floor(end / PAGE_SIZE);
    setVisible((v) => (v.from === from && v.to === to ? v : { from, to }));
  }, []);
  return {
    total,
    get,
    setVisibleRange: setRange,
    loading: first.isLoading,
    /** A new query is loading while the old result is shown. */
    stale: first.isPlaceholderData,
    error: first.error,
  };
}
