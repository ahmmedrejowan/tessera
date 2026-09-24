/**
 * Who has the agent door's port.
 *
 * When the port is taken, "something else is using it" is no use on its own. These tests take a
 * port for real and ask the system the same question the app asks, so what comes back is the
 * system's answer and not a guess.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { freePort, whoHasPort } from '../src/main/mcp/port';

const open: Server[] = [];

/** A server holding a port of its own, closed again when the test ends. */
async function holding(): Promise<number> {
  const server = createServer(() => undefined);
  open.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  return typeof address === 'object' && address ? address.port : 0;
}

/** A port number nobody is listening on. */
async function free(): Promise<number> {
  const port = await holding();
  await new Promise<void>((done) => open.pop()!.close(() => done()));
  return port;
}

const spawned: ChildProcess[] = [];

/**
 * Another program holding a port: a small node of its own, so what is stopped is a real process
 * and not this one. `stubborn` makes it ignore being asked politely.
 */
async function anotherProgram(stubborn = false): Promise<{ pid: number; port: number }> {
  const port = await free();
  const script = `${stubborn ? "process.on('SIGTERM', () => {});" : ''}require('http').createServer().listen(${port}, '127.0.0.1');setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ['-e', script], { stdio: 'ignore' });
  spawned.push(child);
  for (let i = 0; i < 100; i += 1) {
    if (await whoHasPort(port)) return { pid: child.pid!, port };
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('the other program never took the port');
}

afterEach(async () => {
  for (const server of open.splice(0)) await new Promise<void>((done) => server.close(() => done()));
  for (const child of spawned.splice(0)) child.kill('SIGKILL');
});

describe('who has a port', () => {
  it('names the program that is listening', async () => {
    const port = await holding();
    const holder = await whoHasPort(port);
    expect(holder).not.toBeNull();
    expect(holder!.pid).toBe(process.pid);
    // The name is whatever the system calls this process; what matters is that there is one.
    expect(holder!.name.length).toBeGreaterThan(0);
    expect(holder!.name).not.toMatch(/\.exe$/i);
  });

  it('says nobody when nobody is', async () => {
    expect(await whoHasPort(await free())).toBeNull();
  });
});

describe('taking a port back', () => {
  it('has nothing to stop when the port is free', async () => {
    expect(await freePort(await free())).toEqual({ stopped: null });
  });

  it.skipIf(process.platform === 'win32')('stops the program that has it, and says which it was', async () => {
    const { pid, port } = await anotherProgram();
    const { stopped } = await freePort(port);
    expect(stopped).toMatchObject({ pid });
    expect(await whoHasPort(port)).toBeNull();
  }, 30_000);

  it.skipIf(process.platform === 'win32')('insists when being asked politely is ignored', async () => {
    const { pid, port } = await anotherProgram(true);
    const { stopped } = await freePort(port);
    expect(stopped).toMatchObject({ pid });
    expect(await whoHasPort(port)).toBeNull();
  }, 30_000);

  it('refuses to stop Tessera itself', async () => {
    // The listener here is this very process, which is what the app must never kill.
    const port = await holding();
    await expect(freePort(port)).rejects.toThrow(/Tessera itself/);
  });
});
