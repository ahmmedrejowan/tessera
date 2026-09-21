import { ipcMain, type BrowserWindow } from 'electron';
import type { EventChannel, Events, InvokeChannel, Invokes, Wire } from '@shared/ipc';
import { log } from './log';

/** An error whose message is meant for the person using the app, with a stable code for the UI. */
export class UserError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'UserError';
  }
}

type Handler<K extends InvokeChannel> = (...args: Parameters<Invokes[K]>) => ReturnType<Invokes[K]> | Promise<ReturnType<Invokes[K]>>;

/** Register the handler for one channel. Errors are logged and sent back as data (see `Wire`). */
export function handle<K extends InvokeChannel>(channel: K, handler: Handler<K>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<Wire<Awaited<ReturnType<Invokes[K]>>>> => {
    try {
      const value = await handler(...(args as Parameters<Invokes[K]>));
      return { ok: true, value: value as Awaited<ReturnType<Invokes[K]>> };
    } catch (e) {
      if (e instanceof UserError) return { ok: false, error: { code: e.code, message: e.message } };
      log.error('ipc', `${channel} failed`, e);
      return { ok: false, error: { code: 'internal', message: e instanceof Error ? e.message : String(e) } };
    }
  });
}

/** Push an event to every open window. */
export function broadcast<K extends EventChannel>(windows: () => BrowserWindow[], channel: K, payload: Events[K]): void {
  for (const w of windows()) if (!w.isDestroyed()) w.webContents.send(channel, payload);
}
