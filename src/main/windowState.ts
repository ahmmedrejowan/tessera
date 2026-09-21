import { screen, type BrowserWindow, type Rectangle } from 'electron';
import { join } from 'node:path';
import { z } from 'zod';
import { readJson, writeJson } from './fsx';

const schema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().min(400),
  height: z.number().int().min(300),
  maximized: z.boolean(),
});
type WindowState = z.infer<typeof schema>;

const DEFAULT = { width: 1360, height: 860 };

/** The window's last position and size, if it still fits on a connected display. */
export async function loadWindowState(dataDir: string): Promise<(Partial<Rectangle> & { maximized: boolean }) | null> {
  const parsed = schema.safeParse(await readJson(join(dataDir, 'window.json')).catch(() => null));
  if (!parsed.success) return null;
  const s = parsed.data;
  // A display that was unplugged would leave the window off-screen: fall back to the default.
  const visible = screen.getAllDisplays().some(({ workArea: a }) =>
    s.x + 80 < a.x + a.width && s.x + s.width - 80 > a.x && s.y >= a.y - 20 && s.y + 40 < a.y + a.height);
  return visible ? s : { ...DEFAULT, maximized: s.maximized };
}

export function defaultSize() {
  return DEFAULT;
}

/** Remember the window's position and size whenever it's moved, resized or closed. */
export function trackWindowState(win: BrowserWindow, dataDir: string): void {
  let timer: NodeJS.Timeout | null = null;
  const save = () => {
    if (win.isDestroyed()) return;
    const b = win.getNormalBounds();
    const state: WindowState = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() };
    void writeJson(join(dataDir, 'window.json'), state).catch(() => undefined);
  };
  const later = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 500);
  };
  win.on('resize', later);
  win.on('move', later);
  win.on('close', save);
}
