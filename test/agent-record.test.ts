/**
 * The record of what agents have done, who has a port, and writing Tessera into an agent's own
 * settings. None of it touches the library; all of it is what the agents page is built on.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import type { McpCall } from '@shared/mcp';
import { McpHistory } from '../src/main/mcp/history';
import { freePort, whoHasPort } from '../src/main/mcp/port';
import { clients, installFor } from '../src/main/mcp/clients';
import { tempDir } from './helpers';

const call = (tool: string, at = new Date().toISOString()): McpCall => ({ at, tool, group: 'read', said: '', ok: true, ms: 1 });

/**
 * Noting a call is deliberately fire and forget, so that writing the record can never hold up or
 * break the call itself. A test that wants to read it back has to wait for the writing to land.
 */
async function settled(history: McpHistory, expected: number): Promise<{ rows: McpCall[]; total: number }> {
  for (let tries = 0; tries < 100; tries += 1) {
    const page = await history.list(1000, 0);
    if (page.total >= expected) return page;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`the record never reached ${expected} calls`);
}

describe('the record of what agents have done', () => {
  it('keeps calls, newest first, and says how many there are', async () => {
    const history = new McpHistory(tempDir());
    history.add(call('search', '2026-01-01T00:00:00.000Z'));
    history.add(call('list_packs', '2026-01-02T00:00:00.000Z'));
    history.add(call('get_pack', '2026-01-03T00:00:00.000Z'));

    const page = await settled(history, 3);
    expect(page.total).toBe(3);
    expect(page.rows.map((r) => r.tool)).toEqual(['get_pack', 'list_packs', 'search']);
  });

  it('hands out one page at a time', async () => {
    const history = new McpHistory(tempDir());
    for (let i = 0; i < 25; i += 1) history.add(call(`tool-${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()));
    await settled(history, 25);

    const first = await history.list(10, 0);
    const second = await history.list(10, 10);
    expect(first.rows).toHaveLength(10);
    expect(second.rows).toHaveLength(10);
    expect(first.rows[0]!.tool).toBe('tool-24');
    expect(second.rows[0]!.tool).toBe('tool-14');
    expect(first.total).toBe(25);
  });

  it('is empty, rather than broken, before anything has happened', async () => {
    expect(await new McpHistory(tempDir()).list()).toEqual({ rows: [], total: 0 });
  });

  it('skips a half-written line rather than giving up on the rest', async () => {
    const dir = tempDir();
    const history = new McpHistory(dir);
    history.add(call('search'));
    await settled(history, 1);
    writeFileSync(join(dir, 'agent-calls.jsonl'), `${readFileSync(join(dir, 'agent-calls.jsonl'), 'utf8')}{"at":"broke`, 'utf8');

    const page = await history.list();
    expect(page.rows.map((r) => r.tool)).toEqual(['search']);
  });

  it('forgets the lot when asked', async () => {
    const history = new McpHistory(tempDir());
    history.add(call('search'));
    await settled(history, 1);
    await history.clear();
    expect((await history.list()).total).toBe(0);
  });

  it('drops the oldest once there are far too many', async () => {
    const dir = tempDir();
    const history = new McpHistory(dir);
    const lines = Array.from({ length: 1600 }, (_, i) => JSON.stringify(call(`tool-${i}`, new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString())));
    writeFileSync(join(dir, 'agent-calls.jsonl'), `${lines.join('\n')}\n`, 'utf8');

    const page = await history.list();
    expect(page.total).toBe(1000);
    expect(page.rows[0]!.tool).toBe('tool-1599');
  });
});

describe('who has a port', () => {
  it('says nothing is listening on a port nothing is listening on', async () => {
    expect(await whoHasPort(59999)).toBeNull();
  });

  it('finds the program listening on one that is', async () => {
    const { createServer } = await import('node:net');
    const server = createServer();
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as { port: number }).port;
    try {
      const holder = await whoHasPort(port);
      // Whether the system will say depends on lsof or netstat being there; when it does answer,
      // it has to answer about this very process.
      if (holder) {
        expect(holder.pid).toBe(process.pid);
        expect(holder.name).toBeTruthy();
      }
    } finally {
      await new Promise((done) => server.close(done));
    }
  });

  it('refuses to stop Tessera itself', async () => {
    const { createServer } = await import('node:net');
    const server = createServer();
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as { port: number }).port;
    try {
      const holder = await whoHasPort(port);
      if (holder?.pid === process.pid) await expect(freePort(port)).rejects.toThrow(/Tessera itself/);
      else expect(await freePort(59999)).toEqual({ stopped: null });
    } finally {
      await new Promise((done) => server.close(done));
    }
  });

  it('has nothing to stop when nothing is there', async () => {
    expect(await freePort(59998)).toEqual({ stopped: null });
  });
});

describe('setting an agent up', () => {
  it('describes every agent it knows, each with something to copy', () => {
    const all = clients('http://127.0.0.1:7458/mcp');
    expect(all.length).toBeGreaterThan(3);
    for (const client of all) {
      expect(client.id).toBeTruthy();
      expect(client.name).toBeTruthy();
      expect(client.snippet).toContain('7458');
      expect(client.key).toBeTruthy();
    }
  });

  it('writes Tessera into an agent settings file, keeping the old one', async () => {
    const home = tempDir();
    const before = process.env.HOME;
    const beforeProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    try {
      const target = clients('http://127.0.0.1:7458/mcp').find((c) => !c.command);
      expect(target).toBeTruthy();
      const first = await installFor(target!.id, 'http://127.0.0.1:7458/mcp');
      expect(existsSync(first.path)).toBe(true);
      expect(readFileSync(first.path, 'utf8')).toContain('7458');
      expect(first.backup).toBeNull();

      // Doing it again keeps what was there before.
      const second = await installFor(target!.id, 'http://127.0.0.1:7458/mcp');
      expect(second.backup).toBeTruthy();
      expect(existsSync(second.backup!)).toBe(true);
    } finally {
      if (before === undefined) delete process.env.HOME;
      else process.env.HOME = before;
      if (beforeProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = beforeProfile;
    }
  });

  it('refuses an agent it has never heard of', async () => {
    await expect(installFor('not-an-agent', 'http://127.0.0.1:7458/mcp')).rejects.toThrow();
  });

  it('keeps what was already in the file beside its own entry', async () => {
    const home = tempDir();
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const target = clients('http://127.0.0.1:7458/mcp').find((c) => !c.command)!;
      const first = await installFor(target.id, 'http://127.0.0.1:7458/mcp');
      const doc = JSON.parse(readFileSync(first.path, 'utf8')) as Record<string, Record<string, unknown>>;
      const key = Object.keys(doc).find((k) => /server/i.test(k))!;
      doc[key]!['something-else'] = { url: 'http://example.test/mcp' };
      mkdirSync(join(first.path, '..'), { recursive: true });
      writeFileSync(first.path, JSON.stringify(doc), 'utf8');

      await installFor(target.id, 'http://127.0.0.1:7458/mcp');
      const after = JSON.parse(readFileSync(first.path, 'utf8')) as Record<string, Record<string, unknown>>;
      expect(after[key]!['something-else']).toBeTruthy();
      expect(Object.keys(after[key]!)).toContain('tessera');
    } finally {
      if (before === undefined) delete process.env.HOME;
      else process.env.HOME = before;
    }
  });
});
