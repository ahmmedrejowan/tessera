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
}

export type NoticeInput = Omit<Notice, 'id' | 'count' | 'at'>;

const MAX_VISIBLE = 3;
const MAX_HISTORY = 50;

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
  clearHistory(): void;
  setLift(px: number): void;
}

let nextId = 1;
const same = (a: NoticeInput, b: NoticeInput) => a.level === b.level && a.title === b.title && a.body === b.body;

export const useNotices = create<NoticeState>((set) => ({
  visible: [],
  history: [],
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
      return {
        visible: show ? [...s.visible, notice].slice(-MAX_VISIBLE) : s.visible,
        history: [notice, ...s.history].slice(0, MAX_HISTORY),
        unseen: s.unseen + 1,
      };
    });
    return id;
  },
  dismiss: (id) => set((s) => ({ visible: s.visible.filter((n) => n.id !== id) })),
  markSeen: () => set({ unseen: 0 }),
  clearHistory: () => set({ history: [], unseen: 0 }),
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
