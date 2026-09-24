/**
 * The door agents come in through, opened for real.
 *
 * A server is started on a free port and spoken to over HTTP the way an agent speaks to it. What
 * matters most here is not that a tool answers: it is who is allowed to ask. This listener sits on
 * a loopback port on somebody's own computer, so a web page they happen to have open must not be
 * able to drive their library through it.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import type { McpCall } from '@shared/mcp';
import { McpService } from '../src/main/mcp/server';
import { running, type PackFixture } from './library';

const PACKS: PackFixture[] = [{ name: 'Mini Arcade', files: { 'Models/arcade.obj': 'o arcade\n' } }];

/** A free port to listen on, found by asking the system for one and letting it go. */
async function freePort(): Promise<number> {
  const { createServer } = await import('node:net');
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  await new Promise((done) => server.close(done));
  return port;
}

/** A running server, and the things it told the window about. */
async function serving(over: Partial<{ enabled: boolean; port: number; off: string[]; groupsOff: string[]; groupsOn: string[] }> = {}) {
  const app = await running(PACKS);
  const port = over.port ?? (await freePort());
  const calls: McpCall[] = [];
  const firstCalls: string[] = [];
  let changes = 0;

  const settings = { enabled: true, port, off: [], groupsOff: [], groupsOn: ['system', 'danger'], ...over };
  const mcp = new McpService({
    context: app.context,
    settings: () => settings,
    onChange: () => void (changes += 1),
    onFirstCall: (tool) => void firstCalls.push(tool),
    onCall: (call) => void calls.push(call),
  });
  await mcp.apply();

  const url = `http://127.0.0.1:${settings.port}/mcp`;
  /** Speak to it the way an agent does, with whatever headers the test wants to try. */
  const ask = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify(body),
    });

  return { app, mcp, port: settings.port, url, ask, calls, firstCalls, settings, changed: () => changes };
}

/**
 * A request written straight onto the socket. `fetch` will not let a caller set Host, but anything
 * pointing a name of its own at this port certainly can, so the guard has to be tried that way.
 */
async function raw(port: number, host: string, extra = ''): Promise<string> {
  const { connect } = await import('node:net');
  const payload = JSON.stringify(LIST);
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(
        `POST /mcp HTTP/1.1\r\nHost: ${host}\r\nContent-Type: application/json\r\n` +
          `Accept: application/json, text/event-stream\r\n${extra}Content-Length: ${Buffer.byteLength(payload)}\r\nConnection: close\r\n\r\n${payload}`,
      );
    });
    let seen = '';
    socket.on('data', (d) => (seen += d.toString()));
    socket.on('end', () => resolve(seen));
    socket.on('error', reject);
    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error('the server never answered'));
    });
  });
}

/** The body of an answer, whether it came back as JSON or as one server-sent event. */
async function answer(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  return JSON.parse(line ? line.slice(6) : text) as Record<string, unknown>;
}

const LIST = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
const call = (name: string, args: Record<string, unknown> = {}) => ({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } });

describe('who is allowed to knock', () => {
  it('answers a request from this computer', async () => {
    const s = await serving();
    try {
      const res = await s.ask(LIST);
      expect(res.status).toBe(200);
      const body = await answer(res);
      expect((body.result as { tools: unknown[] }).tools.length).toBeGreaterThan(20);
    } finally {
      await s.mcp.stop();
    }
  });

  it('refuses a web page that points its own name at this port', async () => {
    const s = await serving();
    try {
      // A page on the web cannot read the answer, but it can send the request, and without this
      // check the request itself would already have done the damage.
      const res = await s.ask(LIST, { origin: 'https://evil.example' });
      expect(res.status).toBe(403);
    } finally {
      await s.mcp.stop();
    }
  });

  it('refuses a request addressed to a name that is not this computer', async () => {
    const s = await serving();
    try {
      expect(await raw(s.port, 'tessera.evil.example')).toContain('403');
    } finally {
      await s.mcp.stop();
    }
  });

  it('allows the names this computer actually answers to', async () => {
    const s = await serving();
    try {
      for (const host of [`127.0.0.1:${s.port}`, `localhost:${s.port}`, `[::1]:${s.port}`]) {
        expect(await raw(s.port, host)).toContain('200 OK');
      }
    } finally {
      await s.mcp.stop();
    }
  });

  it('refuses a foreign page even when it addresses this computer correctly', async () => {
    const s = await serving();
    try {
      expect(await raw(s.port, `127.0.0.1:${s.port}`, 'Origin: https://evil.example\r\n')).toContain('403');
    } finally {
      await s.mcp.stop();
    }
  });
});

describe('answering an agent', () => {
  it('runs a tool and gives back what it found', async () => {
    const s = await serving();
    try {
      const body = await answer(await s.ask(call('library_status')));
      const text = ((body.result as { content: { text: string }[] }).content[0]!).text;
      expect(JSON.parse(text)).toMatchObject({ open: true });
    } finally {
      await s.mcp.stop();
    }
  });

  it('notes every call, with what was asked and how long it took', async () => {
    const s = await serving();
    try {
      await answer(await s.ask(call('search', { text: 'arcade' })));
      const noted = s.calls.find((c) => c.tool === 'search');
      expect(noted).toBeTruthy();
      expect(noted!.ok).toBe(true);
      expect(noted!.group).toBe('read');
      expect(noted!.at).toBeTruthy();
      expect(typeof noted!.ms).toBe('number');
    } finally {
      await s.mcp.stop();
    }
  });

  it('says who knocked first, once and once only', async () => {
    const s = await serving();
    try {
      await answer(await s.ask(call('library_status')));
      await answer(await s.ask(call('library_status')));
      expect(s.firstCalls).toHaveLength(1);
    } finally {
      await s.mcp.stop();
    }
  });

  it('notes a call that failed as a call that failed, rather than losing it', async () => {
    const s = await serving();
    try {
      const body = await answer(await s.ask(call('get_pack', { packId: 'not-a-pack' })));
      expect(body.result ?? body.error).toBeTruthy();
      const noted = s.calls.find((c) => c.tool === 'get_pack');
      expect(noted?.ok).toBe(false);
    } finally {
      await s.mcp.stop();
    }
  });

  it('will not run a tool that is switched off', async () => {
    const s = await serving({ off: ['search'] });
    try {
      const listed = (await answer(await s.ask(LIST))).result as { tools: { name: string }[] };
      expect(listed.tools.some((t) => t.name === 'search')).toBe(false);
    } finally {
      await s.mcp.stop();
    }
  });

  it('offers nothing from a group that has not been asked for', async () => {
    const s = await serving({ groupsOn: [] });
    try {
      const listed = (await answer(await s.ask(LIST))).result as { tools: { name: string }[] };
      expect(listed.tools.some((t) => t.name === 'empty_bin_for_good')).toBe(false);
      expect(listed.tools.some((t) => t.name === 'search')).toBe(true);
    } finally {
      await s.mcp.stop();
    }
  });
});

describe('starting, moving and stopping', () => {
  it('says where it is listening, and how much it has done', async () => {
    const s = await serving();
    try {
      const status = s.mcp.status();
      expect(status.running).toBe(true);
      expect(status.port).toBe(s.port);
      expect(status.url).toContain(String(s.port));
      expect(status.tools.all).toBeGreaterThan(20);
      expect(status.error).toBeNull();

      await answer(await s.ask(call('library_status')));
      expect(s.mcp.status().calls).toBe(1);
      expect(s.mcp.status().lastTool).toBe('library_status');
    } finally {
      await s.mcp.stop();
    }
  });

  it('moves to another port when the settings say so', async () => {
    const s = await serving();
    try {
      const next = await freePort();
      s.settings.port = next;
      await s.mcp.apply();
      expect(s.mcp.status().port).toBe(next);
      const res = await fetch(`http://127.0.0.1:${next}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify(LIST),
      });
      expect(res.status).toBe(200);
    } finally {
      await s.mcp.stop();
    }
  });

  it('stops listening when it is switched off', async () => {
    const s = await serving();
    try {
      s.settings.enabled = false;
      await s.mcp.apply();
      expect(s.mcp.status().running).toBe(false);
      await expect(s.ask(LIST)).rejects.toThrow();
    } finally {
      await s.mcp.stop();
    }
  });

  it('says what went wrong when the port is already taken', async () => {
    const { createServer } = await import('node:net');
    const blocker = createServer();
    await new Promise<void>((done) => blocker.listen(0, '127.0.0.1', done));
    const taken = (blocker.address() as { port: number }).port;
    const s = await serving({ port: taken });
    try {
      expect(s.mcp.status().running).toBe(false);
      expect(s.mcp.status().error).toBeTruthy();
    } finally {
      await s.mcp.stop();
      await new Promise((done) => blocker.close(done));
    }
  });

  it('closes quietly when it was never open', async () => {
    const s = await serving({ enabled: false });
    expect(s.mcp.status().running).toBe(false);
    await s.mcp.stop();
    await s.mcp.stop();
  });
});
