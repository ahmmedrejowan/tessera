import { ipcMain, type BrowserWindow } from 'electron';
import type { EventChannel, Events, InvokeChannel, Invokes, Wire } from '@shared/ipc';
import { UserError } from './errors';
import { log } from './log';

export { UserError };

type Handler<K extends InvokeChannel> = (...args: Parameters<Invokes[K]>) => ReturnType<Invokes[K]> | Promise<ReturnType<Invokes[K]>>;

let internalError: (channel: string, e: unknown) => void = () => undefined;

/**
 * Whether a call may be answered at all, by who is asking.
 *
 * `ipcMain.handle` answers every window in the app, and one of them is the hidden window that
 * parses untrusted models, fonts and images out of somebody's downloaded pack. It has no way to
 * call this today, because its bridge offers only "here is a job" and "here is the picture", but
 * the whole of the app's surface sitting one renderer bug away from that parser is not a thing to
 * leave to the preload alone. Open by default so tests and tools that call handlers directly are
 * unaffected; the app closes it to its own windows on start.
 */
let allowed: (event: Electron.IpcMainInvokeEvent) => boolean = () => true;

/** Say which senders may be answered. Called once, by the app, with its own windows. */
export function onlyAnswer(fn: (event: Electron.IpcMainInvokeEvent) => boolean): void {
  allowed = fn;
}

/** Called with every error a handler didn't anticipate (not a `UserError`). */
export function onInternalError(fn: (channel: string, e: unknown) => void): void {
  internalError = fn;
}

/** Register the handler for one channel. Errors are logged and sent back as data (see `Wire`). */
export function handle<K extends InvokeChannel>(channel: K, handler: Handler<K>): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<Wire<Awaited<ReturnType<Invokes[K]>>>> => {
    if (!allowed(event)) {
      log.warn('ipc', `${channel} was asked for by a window that may not ask`);
      return { ok: false, error: { code: 'not-allowed', message: 'That cannot be asked for from here.' } };
    }
    try {
      const value = await handler(...(args as Parameters<Invokes[K]>));
      return { ok: true, value: value as Awaited<ReturnType<Invokes[K]>> };
    } catch (e) {
      if (e instanceof UserError) return { ok: false, error: { code: e.code, message: e.message } };
      log.error('ipc', `${channel} failed`, e);
      internalError(channel, e);
      return { ok: false, error: { code: 'internal', message: e instanceof Error ? e.message : String(e) } };
    }
  });
}

/** Push an event to every open window. */
export function broadcast<K extends EventChannel>(windows: () => BrowserWindow[], channel: K, payload: Events[K]): void {
  for (const w of windows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
}
