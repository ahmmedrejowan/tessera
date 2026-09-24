/**
 * The agent side of Tessera. The app answers on a local address while it is running, so an AI
 * agent can do anything the window can: look through the library, file things, link them into a
 * game, bring new ones in. Whatever an agent changes shows in the window at once, because both
 * go through the same services.
 */

/** Tools are switched on and off by what they do, not one by one, unless you want to. */
export type ToolGroup = 'read' | 'organise' | 'link' | 'bring' | 'remove' | 'system' | 'danger';

export const TOOL_GROUPS: { id: ToolGroup; title: string; note: string; defaultOn: boolean }[] = [
  { id: 'read', title: 'Looking', note: 'Search the library, read packs, files, collections and games. Changes nothing.', defaultOn: true },
  { id: 'organise', title: 'Filing', note: 'Star things, make and fill collections, record licences and tags, archive a pack.', defaultOn: true },
  { id: 'link', title: 'Linking to a game', note: 'Copy assets into a game folder, with their licences and credits.', defaultOn: true },
  { id: 'bring', title: 'Bringing things in', note: 'Add packs from this computer and fetch links from the web.', defaultOn: true },
  { id: 'remove', title: 'Deleting to the bin', note: 'Move packs or files to the library’s bin, and put them back. Nothing here is permanent.', defaultOn: true },
  { id: 'system', title: 'The app itself', note: 'Open and make libraries, change Tessera’s settings, read the library again, run a backup. Off until you turn it on.', defaultOn: false },
  { id: 'danger', title: 'Deleting for good', note: 'Empty the bin, throw away a pack waiting in Review. These cannot be undone. Off until you turn it on.', defaultOn: false },
];

/**
 * Whether a group is worth a second thought: the ones that start off, because they reach past the
 * library into the app itself, or cannot be undone.
 */
export const isSensitive = (id: ToolGroup): boolean => !TOOL_GROUPS.find((g) => g.id === id)?.defaultOn;

/** Whether a group is on, given what has been switched off and what has been allowed. */
export function groupIsOn(id: ToolGroup, settings: { groupsOff: string[]; groupsOn?: string[] }): boolean {
  const group = TOOL_GROUPS.find((g) => g.id === id);
  return group?.defaultOn ? !settings.groupsOff.includes(id) : (settings.groupsOn ?? []).includes(id);
}

export const DEFAULT_MCP_PORT = 7458;

export interface McpToolInfo {
  name: string;
  group: ToolGroup;
  title: string;
  summary: string;
  schema: Record<string, unknown>;
  /** Whether this tool is switched on right now. */
  on: boolean;
  /** One line on what comes back. */
  returns?: string;
  /** An answer of that shape, as pretty JSON. */
  example?: string;
}

/** One call an agent made: what it asked for, when, and how it went. */
export interface McpCall {
  at: string;
  /** The tool's name, as an agent calls it. */
  tool: string;
  group: ToolGroup;
  /** What was asked, short enough to read at a glance. */
  said: string;
  ok: boolean;
  /** What went wrong, when it did. */
  problem?: string;
  /** How long it took, in milliseconds. */
  ms: number;
}

/** An agent Tessera can write itself into, and what it would write. */
export interface McpClientInfo {
  id: string;
  name: string;
  note: string;
  /** Where its settings live on this computer. */
  path: string;
  /** What the block of servers is called in that file. */
  key: string;
  /** The block itself, ready to paste. */
  snippet: string;
  /** The command that does the same thing, when the agent has one. */
  command?: string;
}

export interface McpStatus {
  /** The setting: should it run at all. */
  enabled: boolean;
  running: boolean;
  port: number;
  url: string;
  /** Why it is not running, when it should be. */
  error: string | null;
  /** How many tools are switched on, of how many. */
  tools: { on: number; all: number };
  /** Calls answered since the app started, and when the last one was. */
  calls: number;
  lastCall: string | null;
  lastTool: string | null;
}
