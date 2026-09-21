import type { EventChannel, Events, InvokeChannel, Invokes } from '@shared/ipc';

/** An error from the main process. `code` is stable and safe to branch on; `message` is for people. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Call the main process. Resolves with the handler's value or rejects with an `ApiError`. */
export async function call<K extends InvokeChannel>(channel: K, ...args: Parameters<Invokes[K]>): Promise<Awaited<ReturnType<Invokes[K]>>> {
  const wire = await window.tessera.invoke(channel, ...args);
  if (wire.ok) return wire.value;
  throw new ApiError(wire.error.code, wire.error.message);
}

/** Listen for an event from the main process; returns the unsubscribe function. */
export function on<K extends EventChannel>(channel: K, listener: (payload: Events[K]) => void): () => void {
  return window.tessera.on(channel, listener);
}

export const platform = window.tessera.platform;
