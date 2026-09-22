import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import type { MenuCommand } from '@shared/types';

/**
 * The application menu. Standard editing and window items come from Electron's roles (so they
 * follow each platform's conventions); Tessera's own commands are sent to the focused window.
 */
export function installMenu(focused: () => BrowserWindow | undefined, logsDir: string): void {
  const send = (command: MenuCommand) => () => focused()?.webContents.send('menu:command', command);
  const mac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(mac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { label: 'Settings…', accelerator: 'Cmd+,', click: send('settings') },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Add Downloads…', accelerator: 'CmdOrCtrl+O', click: send('add') },
        { label: 'Add a Folder as One Pack…', click: send('addFolder') },
        { label: 'Add a Folder of Packs…', accelerator: 'CmdOrCtrl+Shift+O', click: send('addFolderOfPacks') },
        { type: 'separator' },
        { label: 'Link a Game Project…', click: send('linkProject') },
        { type: 'separator' },
        ...(mac ? [{ role: 'close' } as const] : [{ label: 'Settings', accelerator: 'Ctrl+,', click: send('settings') }, { type: 'separator' } as const, { role: 'quit' } as const]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: send('find') },
        { label: 'Search or Go To…', accelerator: 'CmdOrCtrl+K', click: send('palette') },
        { type: 'separator' },
        { label: 'Home', accelerator: 'CmdOrCtrl+1', click: send('home') },
        { label: 'Browse', accelerator: 'CmdOrCtrl+2', click: send('browse') },
        { label: 'Collections', accelerator: 'CmdOrCtrl+3', click: send('collections') },
        { label: 'Projects', accelerator: 'CmdOrCtrl+4', click: send('projects') },
        { label: 'Inbox', accelerator: 'CmdOrCtrl+5', click: send('inbox') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' } as const, { role: 'reload' } as const, { role: 'toggleDevTools' } as const]),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Report a Problem…', click: send('reportProblem') },
        { label: 'Show Logs', click: () => void shell.openPath(logsDir) },
        { label: 'Tessera on GitHub', click: () => void shell.openExternal('https://github.com/ahmmedrejowan/tessera') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
