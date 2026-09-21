import { BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import type { RenderJob, RenderResult } from '@shared/types';
import { log } from '../log';

const JOB_TIMEOUT = 30_000;

interface Waiting {
  resolve: (data: Uint8Array) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * A hidden window that draws thumbnails with the same web engine the app shows them in: three.js
 * for models, canvas for images, fonts and waveforms. It's created on first use and recreated if
 * it ever crashes; a job that hangs or crashes it fails alone.
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
      }, JOB_TIMEOUT);
      this.waiting.set(job.id, { resolve, reject, timer });
      win.webContents.send('render:job', job);
    });
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
