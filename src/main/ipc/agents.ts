/**
 * AI agents: the door they come through, what they may do, and what they have done.
 *
 * Every handler here answers one channel of the contract in src/shared/ipc.ts. What it needs is
 * given to it; nothing in this file reaches for a service of its own.
 */
import { BrowserWindow, app, dialog } from 'electron';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { TOOL_GROUPS } from '@shared/mcp';
import { broadcast, handle } from '../ipc';
import { clients, installFor } from '../mcp/clients';
import { freePort, whoHasPort } from '../mcp/port';
import { catalogue, portFree } from '../mcp/server';
import { skillMarkdown } from '../mcp/skill';
import type { IpcContext } from './context';

type Deps = Pick<IpcContext, 'library' | 'mcp' | 'mcpHistory' | 'settings' | 'start' | 'windows'>;

export function registerAgentIpc(c: Deps): void {
  const { library, mcp, mcpHistory, settings, start, windows } = c;
  handle('mcp:status', () => mcp.status());
  handle('mcp:tools', () => catalogue(settings.get().mcp));
  handle('mcp:set', async (change) => {
    const now = settings.get().mcp;
    const next = { ...now };
    if (change.enabled !== undefined) next.enabled = change.enabled;
    if (change.port !== undefined) next.port = change.port;
    if (change.group) {
      // A group that is on by default is remembered when it goes off; one that starts off is
      // remembered when it is allowed. Either way the switch means what it says.
      const id = change.group.id;
      if (TOOL_GROUPS.find((g) => g.id === id)?.defaultOn) next.groupsOff = change.group.on ? now.groupsOff.filter((g) => g !== id) : [...new Set([...now.groupsOff, id])];
      else next.groupsOn = change.group.on ? [...new Set([...now.groupsOn, id])] : now.groupsOn.filter((g) => g !== id);
    }
    if (change.tool) next.off = change.tool.on ? now.off.filter((t) => t !== change.tool!.name) : [...new Set([...now.off, change.tool.name])];
    await settings.update({ mcp: next });
    await mcp.apply();
    // Which tools are on changes nothing about the socket, so say so here: the window is showing it.
    broadcast(windows, 'mcp:changed', 0);
    return mcp.status();
  });
  handle('mcp:portFree', (port) => portFree(port));
  handle('mcp:portUser', (port) => whoHasPort(port));
  handle('mcp:freePort', async (port) => {
    const done = await freePort(port);
    // The port is ours to take now; start there without being asked again.
    await mcp.apply(true);
    broadcast(windows, 'mcp:changed', 0);
    return done;
  });
  handle('mcp:clients', () => clients(mcp.status().url));
  handle('mcp:installClient', (id) => installFor(id, mcp.status().url));
  handle('mcp:calls', (limit, offset) => mcpHistory.list(limit, offset));
  handle('mcp:clearCalls', async () => {
    await mcpHistory.clear();
    broadcast(windows, 'mcp:changed', 0);
  });
  handle('mcp:skill', () => skillMarkdown(mcp.status().url));
  handle('mcp:installSkill', async (where) => {
    const text = skillMarkdown(mcp.status().url);
    if (where === 'claude') {
      const dir = join(app.getPath('home'), '.claude', 'skills', 'tessera-library');
      await mkdir(dir, { recursive: true });
      const file = join(dir, 'SKILL.md');
      await writeFile(file, text, 'utf8');
      return { path: file };
    }
    const win = BrowserWindow.getFocusedWindow() ?? windows()[0];
    const options = { title: 'Save the skill', defaultPath: join(app.getPath('documents'), 'SKILL.md'), filters: [{ name: 'Markdown', extensions: ['md'] }] };
    const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return null;
    await writeFile(picked.filePath, text, 'utf8');
    return { path: picked.filePath };
  });

}
