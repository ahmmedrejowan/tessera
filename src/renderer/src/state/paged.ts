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
  const [visible, setVisible] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const first = useQuery({
    queryKey: [...key, 0],
    queryFn: () => fetchPage(0, PAGE_SIZE),
    enabled,
    placeholderData: keepPreviousData,
  });
  const total = first.data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const pages = useMemo(() => {
    const from = Math.min(Math.floor(visible.start / PAGE_SIZE), lastPage);
    const to = Math.min(Math.floor(visible.end / PAGE_SIZE), lastPage);
    const out: number[] = [];
    for (let p = Math.max(1, from); p <= to; p++) out.push(p);
    return out;
  }, [visible.start, visible.end, lastPage]);
  const more = useQueries({
    queries: pages.map((p) => ({
      queryKey: [...key, p],
      queryFn: () => fetchPage(p * PAGE_SIZE, PAGE_SIZE),
      enabled: enabled && !first.isPlaceholderData,
    })),
  });
  const loaded = useMemo(() => {
    const m = new Map<number, T[]>();
    if (first.data) m.set(0, first.data.rows);
    pages.forEach((p, i) => {
      const rows = more[i]?.data?.rows;
      if (rows) m.set(p, rows);
    });
    return m;
  }, [first.data, pages, more]);
  const get = useCallback((index: number): T | undefined => loaded.get(Math.floor(index / PAGE_SIZE))?.[index % PAGE_SIZE], [loaded]);
  const setRange = useCallback((start: number, end: number) => {
    setVisible((v) => (v.start === start && v.end === end ? v : { start, end }));
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
