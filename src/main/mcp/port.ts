/**
 * Who has the port. When Tessera cannot listen, the answer "something else is using it" is no use
 * on its own: a person wants to know what, and to be able to do something about it. This asks the
 * system which program is listening, and can stop it when the owner says so.
 */
import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import { log } from '../log';

const run = promisify(execFile);

export interface PortHolder {
  pid: number;
  /** The program's name, as the system gives it. */
  name: string;
  /** Whether it is another copy of Tessera. */
  ours: boolean;
}

const nameOf = (raw: string) => raw.replace(/\.exe$/i, '').trim() || 'a program';

/** The program listening on a port, or null when nothing is. */
export async function whoHasPort(port: number): Promise<PortHolder | null> {
  try {
    if (platform() === 'win32') {
      const { stdout } = await run('netstat', ['-ano', '-p', 'TCP']);
      const line = stdout.split('\n').find((l) => /LISTENING/i.test(l) && new RegExp(`[:.]${port}\\s`).test(l));
      const pid = Number(line?.trim().split(/\s+/).pop());
      if (!pid) return null;
      const { stdout: task } = await run('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']).catch(() => ({ stdout: '' }));
      const name = nameOf(task.split(',')[0]?.replace(/"/g, '') ?? '');
      return { pid, name, ours: /tessera/i.test(name) };
    }
    // -F gives one field a line: p<pid>, c<command>.
    const { stdout } = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc']);
    const pid = Number(stdout.match(/^p(\d+)/m)?.[1]);
    if (!pid) return null;
    const name = nameOf(stdout.match(/^c(.+)/m)?.[1] ?? '');
    return { pid, name, ours: /tessera|electron/i.test(name) };
  } catch (e) {
    // No lsof, no netstat, or nothing listening: we simply cannot say.
    log.info('mcp', `could not tell who has port ${port}`, e);
    return null;
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Stop whatever is listening on a port. Asked for first, politely, then insisted on. Never stops
 * this very program, whatever the system says.
 */
export async function freePort(port: number): Promise<{ stopped: PortHolder | null }> {
  const holder = await whoHasPort(port);
  if (!holder) return { stopped: null };
  if (holder.pid === process.pid) throw new Error('That is Tessera itself.');
  log.info('mcp', `stopping ${holder.name} (${holder.pid}), which has port ${port}`);
  try {
    if (platform() === 'win32') await run('taskkill', ['/PID', String(holder.pid), '/T', '/F']);
    else process.kill(holder.pid, 'SIGTERM');
  } catch (e) {
    throw new Error(`${holder.name} could not be stopped. It may belong to another user, or need permission.`, { cause: e });
  }
  for (let i = 0; i < 10; i++) {
    await wait(200);
    if (!(await whoHasPort(port))) return { stopped: holder };
  }
  if (platform() !== 'win32') {
    try {
      process.kill(holder.pid, 'SIGKILL');
    } catch {
      // gone between asking and insisting
    }
    await wait(400);
  }
  if (await whoHasPort(port)) throw new Error(`${holder.name} is still holding port ${port}.`);
  return { stopped: holder };
}
