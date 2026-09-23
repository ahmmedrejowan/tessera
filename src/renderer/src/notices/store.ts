import { create } from 'zustand';
import { ApiError } from '../api';

export type Level = 'info' | 'success' | 'warning' | 'error';

export interface NoticeAction {
  label: string;
  run: () => void;
}

/** A message that doesn't need an answer: shown as a toast, then kept in the history. */
export interface Notice {
  id: number;
  level: Level;
  title: string;
  body?: string;
  action?: NoticeAction;
  /** Technical text behind the message, shown on request. */
  details?: string;
  /** How many times the same message arrived while it was showing. */
  count: number;
  at: number;
  /** Opened, or marked as read: it belongs in the archive. */
  read?: boolean;
}

export type NoticeInput = Omit<Notice, 'id' | 'count' | 'at'>;

const MAX_VISIBLE = 3;
const MAX_HISTORY = 200;
/** Where the messages are kept between runs; actions are left out, as they cannot be written down. */
const KEPT = 'tessera.notices';

const startOfToday = () => new Date(new Date().toDateString()).getTime();

/** A message belongs in the archive once it has been read, or once the day it arrived is over. */
export const isArchived = (n: Notice): boolean => !!n.read || n.at < startOfToday();

function load(): Notice[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEPT) ?? '[]') as Notice[];
    return Array.isArray(raw) ? raw.filter((n) => n && typeof n.title === 'string').slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function keep(history: Notice[]): void {
  try {
    localStorage.setItem(KEPT, JSON.stringify(history.map(({ action: _action, ...rest }) => rest).slice(0, MAX_HISTORY)));
  } catch {
    // A full or blocked store is not worth a message of its own.
  }
}

interface NoticeState {
  visible: Notice[];
  history: Notice[];
  /** Messages that arrived since the history was last looked at. */
  unseen: number;
  /** Pixels to keep clear at the bottom of the window, for a bar floating there. */
  lift: number;
  push(input: NoticeInput, show?: boolean): number;
  dismiss(id: number): void;
  markSeen(): void;
  /** One message has been opened, or ticked off: it moves to the archive. */
  markRead(id: number): void;
  /** Everything showing now moves to the archive. */
  markAllRead(): void;
  clearHistory(): void;
  /** Forget what is already archived, keeping what is still recent. */
  clearArchive(): void;
  setLift(px: number): void;
}

const kept = load();
let nextId = Math.max(0, ...kept.map((n) => n.id)) + 1;
const same = (a: NoticeInput, b: NoticeInput) => a.level === b.level && a.title === b.title && a.body === b.body;

export const useNotices = create<NoticeState>((set) => ({
  visible: [],
  history: kept,
  unseen: 0,
  lift: 0,
  push(input, show = true) {
    const now = Date.now();
    let id = nextId++;
    set((s) => {
      const dupe = s.visible.find((n) => same(n, input));
      if (dupe) {
        // The same message again: count it rather than stack a copy. `at` changing restarts its timer.
        id = dupe.id;
        const bumped = { ...dupe, ...input, id: dupe.id, count: dupe.count + 1, at: now };
        return { visible: s.visible.map((n) => (n.id === dupe.id ? bumped : n)), history: s.history.map((n) => (n.id === dupe.id ? bumped : n)) };
      }
      const notice: Notice = { ...input, id, count: 1, at: now };
      const history = [notice, ...s.history].slice(0, MAX_HISTORY);
      keep(history);
      return {
        visible: show ? [...s.visible, notice].slice(-MAX_VISIBLE) : s.visible,
        history,
        unseen: s.unseen + 1,
      };
    });
    return id;
  },
  dismiss: (id) => set((s) => ({ visible: s.visible.filter((n) => n.id !== id) })),
  markSeen: () => set({ unseen: 0 }),
  markRead(id) {
    set((s) => {
      const history = s.history.map((n) => (n.id === id ? { ...n, read: true } : n));
      keep(history);
      return { history };
    });
  },
  markAllRead() {
    set((s) => {
      const history = s.history.map((n) => ({ ...n, read: true }));
      keep(history);
      return { history, unseen: 0 };
    });
  },
  clearHistory: () => {
    keep([]);
    set({ history: [], unseen: 0 });
  },
  clearArchive() {
    set((s) => {
      const history = s.history.filter((n) => !isArchived(n));
      keep(history);
      return { history };
    });
  },
  setLift: (lift) => set({ lift }),
}));

type Extra = Partial<Pick<Notice, 'body' | 'action' | 'details'>>;
const post = (level: Level) => (title: string, extra: Extra = {}) => useNotices.getState().push({ level, title, ...extra });

/** Show a toast. Info and success fade on their own; warnings and errors stay until closed. */
export const notify = {
  info: post('info'),
  success: post('success'),
  warning: post('warning'),
  error: post('error'),
};

/**
 * Report a failed action as an error toast. Errors the app anticipated carry a message written for
 * people and are shown as they are; anything else gets a plain title, with the raw text as details.
 */
export function failed(e: unknown, title?: string, extra: Extra = {}): void {
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof ApiError && e.code !== 'internal') {
    notify.error(title ?? message, { ...(title ? { body: message } : {}), ...extra });
    return;
  }
  notify.error(title ?? 'Something went wrong', { body: 'That didn’t work. Details are in the log, and in the error report if you send one.', details: message, ...extra });
}
