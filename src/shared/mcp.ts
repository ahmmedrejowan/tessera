/**
 * The agent side of Tessera. The app answers on a local address while it is running, so an AI
 * agent can do anything the window can: look through the library, file things, link them into a
 * game, bring new ones in. Whatever an agent changes shows in the window at once, because both
 * go through the same services.
 */

/** Tools are switched on and off by what they do, not one by one, unless you want to. */
export type ToolGroup = 'read' | 'organise' | 'link' | 'bring' | 'remove';

export const TOOL_GROUPS: { id: ToolGroup; title: string; note: string; defaultOn: boolean }[] = [
  { id: 'read', title: 'Looking', note: 'Search the library, read packs, files, collections and games. Changes nothing.', defaultOn: true },
  { id: 'organise', title: 'Filing', note: 'Star things, make and fill collections, record licences and tags, archive a pack.', defaultOn: true },
  { id: 'link', title: 'Linking to a game', note: 'Copy assets into a game folder, with their licences and credits.', defaultOn: true },
  { id: 'bring', title: 'Bringing things in', note: 'Add packs from this computer and fetch links from the web.', defaultOn: true },
  { id: 'remove', title: 'Deleting to the bin', note: 'Move packs or files to the library’s bin, and put them back. The bin can only be emptied by you, in the app.', defaultOn: true },
];

export const DEFAULT_MCP_PORT = 7458;

export interface McpToolInfo {
  name: string;
  group: ToolGroup;
  title: string;
  summary: string;
  schema: Record<string, unknown>;
  /** Whether this tool is switched on right now. */
  on: boolean;
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
