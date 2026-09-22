import type { ComponentType, ReactNode } from 'react';
import { create } from 'zustand';
import { useNotices, type Level } from './store';

export type Tone = 'error' | 'warning' | 'info' | 'question';

export interface DialogAction<T> {
  label: string;
  value: T;
  /** `primary` is the filled button (one per dialog); `danger` is for actions that lose something. */
  kind?: 'primary' | 'danger' | 'text';
}

/** A message that needs an answer before the user carries on. */
export interface DialogSpec<T> {
  tone: Tone;
  title: string;
  body?: ReactNode;
  icon?: ComponentType<{ sx?: object }>;
  /** Technical text, folded away under "Details". */
  details?: string;
  actions: DialogAction<T>[];
  /** Extra content under the body (a checkbox, a list). */
  extra?: ReactNode;
  /** Keep a record in the message history (on by default for errors and warnings). */
  record?: boolean;
}

interface Open {
  id: number;
  spec: DialogSpec<unknown>;
  resolve: (value: unknown) => void;
}

interface DialogState {
  queue: Open[];
  close(id: number, value: unknown): void;
}

export const useDialogs = create<DialogState>((set, get) => ({
  queue: [],
  close(id, value) {
    get()
      .queue.find((d) => d.id === id)
      ?.resolve(value);
    set((s) => ({ queue: s.queue.filter((d) => d.id !== id) }));
  },
}));

let nextId = 1;
const LEVEL: Record<Tone, Level> = { error: 'error', warning: 'warning', info: 'info', question: 'info' };

/**
 * Ask the user something, one dialog at a time. Resolves with the chosen action's value, or null
 * when the dialog is dismissed (Escape, or a click outside).
 */
export function ask<T>(spec: DialogSpec<T>): Promise<T | null> {
  if (spec.record ?? (spec.tone === 'error' || spec.tone === 'warning')) {
    useNotices.getState().push({ level: LEVEL[spec.tone], title: spec.title, ...(typeof spec.body === 'string' ? { body: spec.body } : {}), ...(spec.details ? { details: spec.details } : {}) }, false);
  }
  return new Promise((resolve) => {
    const open: Open = { id: nextId++, spec: spec as DialogSpec<unknown>, resolve: resolve as (v: unknown) => void };
    useDialogs.setState((s) => ({ queue: [...s.queue, open] }));
  });
}

/** Show a serious problem with a single way to acknowledge it. */
export async function alertError(title: string, body?: string, details?: string): Promise<void> {
  await ask({ tone: 'error', title, ...(body ? { body } : {}), ...(details ? { details } : {}), actions: [{ label: 'OK', value: true, kind: 'primary' }] });
}
