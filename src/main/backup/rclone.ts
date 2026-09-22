import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ProviderInfo } from '@shared/storage';
import { UserError } from '../errors';
import { log } from '../log';

/** One step of rclone's configuration, as `--non-interactive` reports it. */
interface Step {
  State: string;
  Option: { Name: string; Default: unknown; Examples?: { Value: string }[] } | null;
  Error: string;
}

const AUTH_URL = /(http:\/\/127\.0\.0\.1:\d+\/auth\?state=[\w-]+)/;

/**
 * Signing in to cloud drives (Google Drive, OneDrive, Dropbox, Box, pCloud) through rclone, with
 * its own configuration file in Tessera's data folder. rclone opens its usual sign-in page in the
 * browser (the link is passed on too, in case it doesn't open) and its other questions are answered
 * with their defaults.
 */
export class RcloneAuth {
  private current: ChildProcess | null = null;

  constructor(
    private readonly exe: () => string | null,
    readonly config: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  private step(args: string[], onUrl: (url: string) => void): Promise<Step> {
    const exe = this.exe();
    if (!exe) return Promise.reject(new UserError('no-rclone', 'rclone isn’t set up on this computer yet.'));
    return new Promise((resolve, reject) => {
      const p = spawn(exe, [...args, '--non-interactive', `--config=${this.config}`], { stdio: ['ignore', 'pipe', 'pipe'], env: this.env });
      this.current = p;
      let out = '';
      let err = '';
      let opened = false;
      const watch = (text: string) => {
        const url = AUTH_URL.exec(text)?.[1];
        if (url && !opened) {
          opened = true;
          onUrl(url);
        }
      };
      p.stdout.on('data', (d: Buffer) => {
        out += d.toString();
        watch(out);
      });
      p.stderr.on('data', (d: Buffer) => {
        err += d.toString();
        watch(err);
      });
      const timer = setTimeout(() => p.kill(), 10 * 60_000);
      p.on('error', reject);
      p.on('exit', (code) => {
        clearTimeout(timer);
        this.current = null;
        if (code !== 0) return reject(new UserError('sign-in-failed', code === null ? 'Signing in was stopped.' : `Signing in didn’t finish: ${err.trim().split('\n').at(-1) ?? code}`));
        try {
          const start = out.indexOf('{');
          resolve(start >= 0 ? (JSON.parse(out.slice(start)) as Step) : { State: '', Option: null, Error: '' });
        } catch {
          resolve({ State: '', Option: null, Error: '' });
        }
      });
    });
  }

  /** Sign in to a cloud drive in the browser; returns the name of the rclone remote made for it. */
  async signIn(info: ProviderInfo, onUrl: (url: string) => void): Promise<string> {
    if (!info.signIn) throw new UserError('no-sign-in', `${info.label} doesn’t use a sign-in.`);
    await mkdir(dirname(this.config), { recursive: true });
    const remote = `tessera-${info.id}-${randomBytes(3).toString('hex')}`;
    let step = await this.step(['config', 'create', remote, info.signIn.rcloneType, ...info.signIn.params], onUrl);
    for (let i = 0; step.State && i < 20; i++) {
      if (step.Error) log.warn('rclone', `sign-in step: ${step.Error}`);
      const d = step.Option?.Default;
      const answer = typeof d === 'boolean' ? String(d) : d != null && String(d) !== '' ? String(d) : (step.Option?.Examples?.[0]?.Value ?? '');
      step = await this.step(['config', 'update', remote, '--continue', `--state=${step.State}`, `--result=${answer}`], onUrl);
    }
    return remote;
  }

  cancel(): void {
    this.current?.kill();
    this.current = null;
  }
}
