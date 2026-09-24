/**
 * Games: where they are, what they have taken, and putting assets into them.
 *
 * Every handler here answers one channel of the contract in src/shared/ipc.ts. What it needs is
 * given to it; nothing in this file reaches for a service of its own.
 */
import { BrowserWindow, dialog, shell } from 'electron';
import { join } from 'node:path';
import { handle } from '../ipc';
import type { IpcContext } from './context';

type Deps = Pick<IpcContext, 'activity' | 'copySource' | 'libraryId' | 'libraryNameOf' | 'projects' | 'projectsChanged' | 'settings' | 'windows'>;

export function registerProjectIpc(c: Deps): void {
  const { activity, copySource, libraryId, libraryNameOf, projects, projectsChanged, settings, windows } = c;
  handle('projects:list', () => projects.list(libraryId(), libraryNameOf));
  handle('projects:choose', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options: Electron.OpenDialogOptions = { title: 'Choose a game project', buttonLabel: 'Choose', properties: ['openDirectory'] };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled || !result.filePaths[0] ? null : projects.probe(result.filePaths[0]);
  });
  handle('projects:probe', (path) => projects.probe(path));
  handle('projects:add', async (probe) => {
    const project = await projects.add(probe);
    if (!settings.get().activeProjectId) await settings.update({ activeProjectId: project.id });
    projectsChanged();
    return project;
  });
  handle('projects:update', async (id, patch) => {
    await projects.update(id, patch);
    projectsChanged();
  });
  handle('projects:unlink', async (id) => {
    await projects.unlink(id);
    if (settings.get().activeProjectId === id) await settings.update({ activeProjectId: null });
    projectsChanged();
  });
  handle('projects:entries', (id) => projects.entries(id, libraryId(), libraryNameOf));
  handle('projects:usage', (packIds, refs) => projects.usage(libraryId(), packIds, refs));
  handle('projects:plan', (id, items) => projects.plan(id, items, copySource()));
  handle('projects:copy', async (id, items) => {
    const n = await projects.copy(id, items, copySource());
    projectsChanged();
    const project = await projects.get(id).catch(() => null);
    if (n) activity.add('project', `Copied ${n} asset${n === 1 ? '' : 's'} to ${project?.name ?? 'a project'}`);
    return n;
  });
  handle('projects:remove', async (id, items) => {
    const n = await projects.remove(id, items, libraryId());
    projectsChanged();
    return n;
  });
  handle('projects:reveal', async (id, rel) => {
    const project = await projects.get(id);
    if (rel && !rel.split('/').includes('..')) shell.showItemInFolder(join(project.path, ...rel.split('/')));
    else void shell.openPath(project.path);
  });

}
