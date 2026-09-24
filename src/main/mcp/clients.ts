/**
 * The agents people use, and where each keeps its MCP settings. Tessera can write itself into any
 * of them: the file is read, the one entry is added or replaced, and everything else is left
 * exactly as it was, with a copy of the old file kept beside it.
 */
import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';
import type { McpClientInfo } from '@shared/mcp';
import { log } from '../log';

const home = () => homedir();
const mac = () => platform() === 'darwin';
const win = () => platform() === 'win32';
const appData = () => process.env.APPDATA ?? join(home(), 'AppData', 'Roaming');

interface Spec {
  id: string;
  name: string;
  /** What it is, and anything a person should know before pressing Install. */
  note: string;
  /** Where its settings live on this computer, or null when it has no file of its own. */
  file: () => string | null;
  /** The block that holds servers in that file. */
  key: string;
  /** The entry Tessera writes under its own name. */
  entry: (url: string) => Record<string, unknown>;
  /** A command to run instead, when that is how the agent is told about a server. */
  command?: (url: string) => string;
}

const http = (url: string) => ({ type: 'http', url });
/** For an agent that can only start a program and talk to it. */
const bridge = (url: string) => ({ command: 'npx', args: ['mcp-remote', url] });

const SPECS: Spec[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    note: 'Added with its own command, for every project you work in.',
    file: () => join(home(), '.claude.json'),
    key: 'mcpServers',
    entry: http,
    command: (url) => `claude mcp add --transport http tessera ${url} --scope user`,
  },
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    note: 'Goes in through the mcp-remote bridge, which the app starts itself. Restart Claude Desktop afterwards.',
    file: () => (mac() ? join(home(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json') : win() ? join(appData(), 'Claude', 'claude_desktop_config.json') : join(home(), '.config', 'Claude', 'claude_desktop_config.json')),
    key: 'mcpServers',
    entry: bridge,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    note: 'Written for every project. A project can have its own .cursor/mcp.json instead.',
    file: () => join(home(), '.cursor', 'mcp.json'),
    key: 'mcpServers',
    entry: http,
  },
  {
    id: 'vscode',
    name: 'VS Code',
    note: 'Its MCP block is called servers rather than mcpServers. Written for your user, not one workspace.',
    file: () => (mac() ? join(home(), 'Library', 'Application Support', 'Code', 'User', 'mcp.json') : win() ? join(appData(), 'Code', 'User', 'mcp.json') : join(home(), '.config', 'Code', 'User', 'mcp.json')),
    key: 'servers',
    entry: http,
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    note: 'Windsurf reads an address under serverUrl. Restart it afterwards.',
    file: () => join(home(), '.codeium', 'windsurf', 'mcp_config.json'),
    key: 'mcpServers',
    entry: (url) => ({ serverUrl: url }),
  },
];

/** Every agent Tessera knows how to write itself into, with what it would write. */
export function clients(url: string): McpClientInfo[] {
  return SPECS.map((s) => ({
    id: s.id,
    name: s.name,
    note: s.note,
    path: s.file() ?? '',
    key: s.key,
    snippet: JSON.stringify({ [s.key]: { tessera: s.entry(url) } }, null, 2),
    ...(s.command ? { command: s.command(url) } : {}),
  }));
}

/** Run an agent's own command, when it has one. Resolves false if the command isn't installed. */
async function runCommand(command: string): Promise<boolean> {
  const [program, ...args] = command.split(' ');
  if (!program) return false;
  return new Promise((resolve) => {
    // A login shell so the command is found where the person installed it.
    const child = spawn(program, args, { stdio: 'ignore', shell: true, env: { ...process.env, PATH: `${process.env.PATH ?? ''}:/usr/local/bin:/opt/homebrew/bin:${join(home(), '.local', 'bin')}` } });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

/**
 * Write Tessera into one agent's settings. The old file is copied beside itself first, so a
 * mistake of ours is never the end of someone's setup.
 */
export async function installFor(id: string, url: string): Promise<{ path: string; backup: string | null; byCommand: boolean }> {
  const spec = SPECS.find((s) => s.id === id);
  if (!spec) throw new Error(`Tessera does not know how to set up ${id}.`);
  if (spec.command && (await runCommand(spec.command(url)))) {
    log.info('mcp', `set up ${spec.name} with its own command`);
    return { path: spec.file() ?? spec.name, backup: null, byCommand: true };
  }
  const path = spec.file();
  if (!path) throw new Error(`${spec.name} has no settings file to write.`);
  const before = await readFile(path, 'utf8').catch(() => '');
  let config: Record<string, unknown> = {};
  if (before.trim()) {
    try {
      config = JSON.parse(before) as Record<string, unknown>;
    } catch {
      throw new Error(`${spec.name}'s settings file could not be read as JSON. Open ${path} and fix it, or copy the block instead.`);
    }
  }
  let backup: string | null = null;
  if (before) {
    backup = `${path}.tessera-backup`;
    await copyFile(path, backup).catch(() => (backup = null));
  }
  const block = (typeof config[spec.key] === 'object' && config[spec.key] ? config[spec.key] : {}) as Record<string, unknown>;
  config[spec.key] = { ...block, tessera: spec.entry(url) };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  log.info('mcp', `wrote ${spec.name}'s settings at ${path}`);
  return { path, backup, byCommand: false };
}
