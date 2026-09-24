import { createServer, type Server as HttpServer } from 'node:http';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DEFAULT_MCP_PORT, TOOL_GROUPS, groupIsOn, type McpCall, type McpStatus, type McpToolInfo } from '@shared/mcp';
import { log } from '../log';
import { TOOL_BY_NAME, TOOLS, type ToolContext } from './tools';

/**
 * The door an AI agent comes through. It speaks MCP over HTTP on this computer only, so an agent
 * running beside the app can do what the window can. There is no password because there is no way
 * in from outside: the socket is bound to the loopback address. Which tools it offers is the
 * owner's choice, in Settings.
 */

const VERSION = '1.0.0';

interface Options {
  context: () => ToolContext;
  settings: () => { enabled: boolean; port: number; off: string[]; groupsOff: string[]; groupsOn: string[] };
  /** Something changed that the window should see (the status card). */
  onChange: () => void;
  /** An agent connected for the first time in this run. */
  onFirstCall: (tool: string) => void;
  /** Every call, for the history the window shows. */
  onCall: (call: McpCall) => void;
}

/** An id means nothing to a person reading a list, so it is counted rather than shown. */
const isId = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const NOUNS: Record<string, [string, string]> = {
  packIds: ['pack', 'packs'],
  assetIds: ['file', 'files'],
  ids: ['thing', 'things'],
  paths: ['path', 'paths'],
};

/** What an agent asked for, short enough to read in a list. */
export function said(args: unknown): string {
  if (!args || typeof args !== 'object' || !Object.keys(args).length) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
    if (isId(value)) continue;
    if (Array.isArray(value) && value.every(isId)) {
      const [one, many] = NOUNS[key] ?? ['thing', 'things'];
      parts.push(`${value.length} ${value.length === 1 ? one : many}`);
      continue;
    }
    const shown = Array.isArray(value)
      ? value.length <= 2
        ? value.map((v) => String(v)).join(', ')
        : `${value.length} ${(NOUNS[key] ?? ['thing', 'things'])[1]}`
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
    parts.push(`${key}: ${shown.length > 40 ? `${shown.slice(0, 39)}…` : shown}`);
    if (parts.join(' · ').length > 90) break;
  }
  return parts.join(' · ');
}

/** Which tools are on: a group can be off, and a single tool can be off inside a group that is on. */
export function toolsOn(settings: { off: string[]; groupsOff: string[]; groupsOn?: string[] }): typeof TOOLS {
  return TOOLS.filter((t) => groupIsOn(t.group, settings) && !settings.off.includes(t.name));
}

export function catalogue(settings: { off: string[]; groupsOff: string[]; groupsOn?: string[] }): McpToolInfo[] {
  const on = new Set(toolsOn(settings).map((t) => t.name));
  return TOOLS.map((t) => ({
    name: t.name,
    group: t.group,
    title: t.title,
    summary: t.summary,
    schema: z.toJSONSchema(t.input, { io: 'input' }) as Record<string, unknown>,
    on: on.has(t.name),
  }));
}

export class McpService {
  private http: HttpServer | null = null;
  private error: string | null = null;
  private calls = 0;
  private lastCall: string | null = null;
  private lastTool: string | null = null;
  private greeted = false;

  constructor(private readonly o: Options) {}

  status(): McpStatus {
    const s = this.o.settings();
    const on = toolsOn(s).length;
    return {
      enabled: s.enabled,
      running: !!this.http?.listening,
      port: s.port || DEFAULT_MCP_PORT,
      url: `http://127.0.0.1:${s.port || DEFAULT_MCP_PORT}/mcp`,
      error: this.error,
      tools: { on, all: TOOLS.length },
      calls: this.calls,
      lastCall: this.lastCall,
      lastTool: this.lastTool,
    };
  }

  /** Start, stop or move as the settings say. Safe to call whenever they change. */
  async apply(): Promise<void> {
    const { enabled, port } = this.o.settings();
    const wanted = enabled ? port || DEFAULT_MCP_PORT : 0;
    const now = this.http?.listening ? (this.http.address() as { port: number } | null)?.port : 0;
    if (wanted === (now ?? 0)) return;
    await this.stop();
    if (wanted) await this.start(wanted);
    this.o.onChange();
  }

  private async start(port: number): Promise<void> {
    this.error = null;
    const http = createServer((req, res) => void this.answer(req, res));
    await new Promise<void>((resolve) => {
      http.once('error', (e: NodeJS.ErrnoException) => {
        this.error = e.code === 'EADDRINUSE' ? `Port ${port} is already taken. Choose another in Settings.` : e.message;
        log.warn('mcp', `could not listen on ${port}`, e);
        this.http = null;
        resolve();
      });
      http.listen(port, '127.0.0.1', () => {
        this.http = http;
        log.info('mcp', `answering agents on http://127.0.0.1:${port}/mcp`);
        resolve();
      });
      // Nothing should close it but us. If something does, say so and open it again, rather than
      // leaving a window that says it is answering when nothing is.
      http.on('close', () => {
        if (this.http !== http) return;
        this.http = null;
        log.warn('mcp', 'the door closed by itself; opening it again');
        this.o.onChange();
        if (this.o.settings().enabled) setTimeout(() => void this.apply(), 500);
      });
    });
  }

  async stop(): Promise<void> {
    const http = this.http;
    this.http = null;
    if (http?.listening) log.info('mcp', 'no longer answering agents');
    if (http?.listening) await new Promise<void>((resolve) => http.close(() => resolve()));
  }

  /** One request, one MCP server: nothing is kept between calls, so a crash can't wedge a session. */
  private async answer(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): Promise<void> {
    // Only this computer, whatever the request says it is.
    const from = req.socket.remoteAddress ?? '';
    if (!from.includes('127.0.0.1') && from !== '::1' && !from.endsWith(':127.0.0.1')) {
      res.writeHead(403).end('Tessera answers on this computer only.');
      return;
    }
    if (req.url && !req.url.startsWith('/mcp')) {
      // A friendly page for anyone who opens the address in a browser.
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(`Tessera is listening for AI agents here.\n\nMCP endpoint: POST ${req.headers.host ? `http://${req.headers.host}` : ''}/mcp\nTools on: ${toolsOn(this.o.settings()).length} of ${TOOLS.length}\n`);
      return;
    }

    const server = new Server({ name: 'tessera', version: VERSION }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: toolsOn(this.o.settings()).map((t) => ({
        name: t.name,
        title: t.title,
        description: t.summary,
        inputSchema: z.toJSONSchema(t.input, { io: 'input' }) as { type: 'object' },
      })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = TOOL_BY_NAME.get(request.params.name);
      const settings = this.o.settings();
      if (!tool) throw new Error(`Tessera has no tool called ${request.params.name}.`);
      if (!toolsOn(settings).some((t) => t.name === tool.name)) {
        // An answer, not a protocol error: the agent should read it and say so, not fall over.
        const group = TOOL_GROUPS.find((g) => g.id === tool.group);
        this.o.onCall({ at: new Date().toISOString(), tool: tool.name, group: tool.group, said: said(request.params.arguments), ok: false, problem: 'it is switched off', ms: 0 });
        this.o.onChange();
        return { isError: true, content: [{ type: 'text' as const, text: `${tool.name} is switched off in Tessera (Settings, "${group?.title ?? tool.group}"). Ask the person using Tessera to turn it on.` }] };
      }
      this.calls++;
      const started = Date.now();
      this.lastCall = new Date().toISOString();
      this.lastTool = tool.name;
      const note = (ok: boolean, problem?: string) =>
        this.o.onCall({ at: new Date(started).toISOString(), tool: tool.name, group: tool.group, said: said(request.params.arguments), ok, ms: Date.now() - started, ...(problem ? { problem } : {}) });
      if (!this.greeted) {
        this.greeted = true;
        this.o.onFirstCall(tool.name);
      }
      this.o.onChange();
      const context = this.o.context();
      const opening = context.library.getState().status === 'opening';
      if (opening && tool.name !== 'library_status') {
        note(false, 'the library was still opening');
        return { isError: true, content: [{ type: 'text' as const, text: 'Tessera is still opening its library. Try again in a moment.' }] };
      }
      try {
        const args = tool.input.parse(request.params.arguments ?? {}) as never;
        const out = await tool.run(args, context);
        note(true);
        return { content: [{ type: 'text' as const, text: JSON.stringify(out ?? { done: true }, null, 2) }] };
      } catch (e) {
        const message = e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') : e instanceof Error ? e.message : String(e);
        log.warn('mcp', `${tool.name} failed`, e);
        note(false, message);
        return { isError: true, content: [{ type: 'text' as const, text: message }] };
      }
    });

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => void transport.close().then(() => server.close()));
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, await body(req));
    } catch (e) {
      log.warn('mcp', 'a request went wrong', e);
      if (!res.headersSent) res.writeHead(500).end();
    }
  }
}

/** Can we listen there? Asked before the owner changes the port. */
export async function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

/** The JSON a request carries, if any. */
async function body(req: import('node:http').IncomingMessage): Promise<unknown> {
  if (req.method !== 'POST') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
