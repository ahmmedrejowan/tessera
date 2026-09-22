import type { ErrorInput } from '@shared/types';
import { ApiError, call } from '../api';

const MAX_PER_SESSION = 50;
let captured = 0;

/** Errors that say nothing about Tessera, which browsers raise now and then. */
const NOISE = [/ResizeObserver loop/i, /^Script error\.?$/];

/** Hand an unexpected error in the window to the main process, which keeps it (and sends it, with consent). */
export function capture(e: unknown, kind: ErrorInput['kind'], context?: Record<string, string>): void {
  // Errors from the main process were recorded there already, or were meant for people.
  if (e instanceof ApiError) return;
  const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : 'Non-error value thrown');
  if (NOISE.some((re) => re.test(err.message)) || captured >= MAX_PER_SESSION) return;
  captured++;
  void call('reports:capture', { source: 'window', kind, name: err.name, message: err.message, ...(err.stack ? { stack: err.stack } : {}), ...(context ? { context } : {}) }).catch(() => undefined);
}

export function installCapture(): void {
  window.addEventListener('error', (event) => capture(event.error ?? event.message, 'exception'));
  window.addEventListener('unhandledrejection', (event) => capture(event.reason, 'rejection'));
}
