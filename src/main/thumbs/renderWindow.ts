import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import type { RenderJob, RenderResult } from '@shared/types';
import { log } from '../log';

const JOB_TIMEOUT = 30_000;

/**
 * A job that never got its turn, because the window it was queued on had to be thrown away.
 *
 * Worth its own type: it is the one drawing failure that says nothing about the file, so it must
 * not be written down as a file that cannot be drawn.
 */
export class RecycledError extends Error {
  constructor() {
    super('the drawing window was restarted before this could be drawn');
    this.name = 'RecycledError';
  }
}

interface Waiting {
  resolve: (data: Uint8Array) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * A hidden window that draws thumbnails with the same web engine the app shows them in: three.js
 * for models, canvas for images, fonts and waveforms. It's created on first use, and recreated if
 * it crashes or stops answering.
 *
 * A crash was handled and a hang was not, and the difference mattered. Some model parsers loop for
 * ever on a malformed file: twelve bytes of nonsense with a .3ds name is enough. The window is
 * then alive, so nothing fired, and it draws one thing at a time, so every later job sat behind
 * the stuck one and timed out too, and each of those was written down as a file that cannot be
 * drawn. One bad file in a pack could cost a whole library its previews until somebody cleared
 * them by hand. So a job that stops answering now takes the window with it.
 */
export class RenderWindow {
  private win: BrowserWindow | null = null;
  private ready: Promise<BrowserWindow> | null = null;
  private readonly waiting = new Map<string, Waiting>();

  constructor() {
    ipcMain.on('render:result', (event, result: RenderResult) => {
      if (!this.win || event.sender !== this.win.webContents) return;
      const w = this.waiting.get(result.id);
      if (!w) return;
      this.waiting.delete(result.id);
      clearTimeout(w.timer);
      if (result.data) w.resolve(result.data);
      else w.reject(new Error(result.error ?? 'could not draw'));
    });
  }

  private open(): Promise<BrowserWindow> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const win = new BrowserWindow({
        show: false,
        width: 512,
        height: 512,
        webPreferences: {
          preload: join(import.meta.dirname, '../preload/worker.cjs'),
          sandbox: true,
          contextIsolation: true,
          // Hidden windows are throttled by default; this one does its work hidden.
          backgroundThrottling: false,
        },
      });
      win.webContents.on('render-process-gone', (_e, details) => {
        log.warn('thumbs', 'render window stopped', details);
        this.failAll(new Error(`the render window stopped (${details.reason})`));
        this.win = null;
        this.ready = null;
      });
      win.webContents.on('console-message', (e) => {
        if (e.level === 'error') log.warn('render', e.message);
      });
      if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/worker.html`);
      else await win.loadFile(join(import.meta.dirname, '../renderer/worker.html'));
      this.win = win;
      return win;
    })();
    this.ready.catch(() => {
      this.ready = null;
    });
    return this.ready;
  }

  async render(job: RenderJob): Promise<Uint8Array> {
    const win = await this.open();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(job.id);
        reject(new Error('took too long to draw'));
        // The window draws one thing at a time, so a job that never answers has wedged it and
        // everything behind it is waiting on a thread that is not coming back. Throw it away.
        this.recycle();
      }, JOB_TIMEOUT);
      this.waiting.set(job.id, { resolve, reject, timer });
      win.webContents.send('render:job', job);
    });
  }

  /**
   * Throw away a window that stopped answering, so the next job gets a fresh one.
   *
   * Anything still queued on it is failed as `Recycled`, which the caller treats as "try again
   * later" rather than "this file cannot be drawn": those jobs were waiting behind the stuck one
   * and were never given a chance.
   */
  private recycle(): void {
    const win = this.win;
    this.win = null;
    this.ready = null;
    this.failAll(new RecycledError());
    win?.destroy();
    log.warn('render', 'a drawing job stopped answering, so the drawing window was restarted');
  }

  private failAll(e: Error): void {
    for (const [id, w] of this.waiting) {
      clearTimeout(w.timer);
      w.reject(e);
      this.waiting.delete(id);
    }
  }

  close(): void {
    this.failAll(new Error('closed'));
    this.win?.destroy();
    this.win = null;
    this.ready = null;
  }
}
