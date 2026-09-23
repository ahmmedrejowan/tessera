import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The store is part of the window, so it needs a window: the bridge and localStorage stand in. */
const store = new Map<string, string>();
vi.stubGlobal('window', { tessera: { platform: 'darwin' } });
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const load = async () => {
  vi.resetModules();
  return import('../../src/renderer/src/notices/store');
};

describe('what Tessera has told you', () => {
  beforeEach(() => store.clear());

  it('keeps messages between runs, without the buttons that cannot be written down', async () => {
    const first = await load();
    first.notify.success('Added 3 packs', { body: 'Mini Arcade, and two more', action: { label: 'Browse', run: () => undefined } });
    expect(first.useNotices.getState().history).toHaveLength(1);

    const again = await load();
    const kept = again.useNotices.getState().history;
    expect(kept.map((n) => n.title)).toEqual(['Added 3 packs']);
    expect(kept[0]!.action).toBeUndefined();
    expect(kept[0]!.body).toBe('Mini Arcade, and two more');
  });

  it('archives a message once it is read, and leaves the rest recent', async () => {
    const { notify, useNotices, isArchived } = await load();
    const id = notify.warning('Backup is old');
    notify.info('Downloaded a pack');
    expect(useNotices.getState().history.filter((n) => !isArchived(n))).toHaveLength(2);

    useNotices.getState().markRead(id);
    const after = useNotices.getState().history;
    expect(after.filter(isArchived).map((n) => n.title)).toEqual(['Backup is old']);

    useNotices.getState().markAllRead();
    expect(useNotices.getState().history.every(isArchived)).toBe(true);
    useNotices.getState().clearArchive();
    expect(useNotices.getState().history).toEqual([]);
  });

  it('archives anything from an earlier day, read or not', async () => {
    const { useNotices, isArchived } = await load();
    const yesterday = Date.now() - 36 * 60 * 60 * 1000;
    expect(isArchived({ id: 1, level: 'info', title: 'Old news', count: 1, at: yesterday })).toBe(true);
    expect(isArchived({ id: 2, level: 'info', title: 'Today', count: 1, at: Date.now() })).toBe(false);
    expect(useNotices.getState().history).toEqual([]);
  });
});
