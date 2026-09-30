// Render build/social.svg to build/social.png (1280 by 640) with Electron itself, so no image
// tools are needed. That PNG is what goes into the repository's Settings, Social preview.
//   npx electron scripts/make-social.cjs
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

// Defaults to the repository's social preview; any other drawing can be given on the command line.
//   npx electron scripts/make-social.cjs build/itch-cover.svg build/itch-cover.png 630 500
// A last argument of "transparent" keeps the page background clear, for drawings meant to sit on
// top of something else.
//   npx electron scripts/make-social.cjs build/itch-logo.svg build/itch-logo.png 1200 320 transparent
const [inSvg = 'build/social.svg', outPng = 'build/social.png', width = '1280', height = '640', mode = ''] = process.argv.slice(2);
const clear = mode === 'transparent';
const W = Number(width);
const H = Number(height);

app.whenReady().then(async () => {
  const svg = readFileSync(join(__dirname, '..', inSvg), 'utf8');
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    frame: false,
    transparent: clear,
    backgroundColor: clear ? '#00000000' : '#ffffff',
    webPreferences: { offscreen: true },
  });
  await win.loadURL(`data:text/html,<html><body style="margin:0">${encodeURIComponent(svg)}</body></html>`);
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
  writeFileSync(join(__dirname, '..', outPng), image.resize({ width: W, height: H }).toPNG());
  console.log(`${outPng} written`);
  app.quit();
});
