// Render build/social.svg to build/social.png (1280 by 640) with Electron itself, so no image
// tools are needed. That PNG is what goes into the repository's Settings, Social preview.
//   npx electron scripts/make-social.cjs
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const W = 1280;
const H = 640;

app.whenReady().then(async () => {
  const svg = readFileSync(join(__dirname, '..', 'build', 'social.svg'), 'utf8');
  const win = new BrowserWindow({ width: W, height: H, show: false, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html,<html><body style="margin:0">${encodeURIComponent(svg)}</body></html>`);
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
  writeFileSync(join(__dirname, '..', 'build', 'social.png'), image.resize({ width: W, height: H }).toPNG());
  console.log('build/social.png written');
  app.quit();
});
