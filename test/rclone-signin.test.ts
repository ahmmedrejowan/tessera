/**
 * Signing in to a cloud drive, which Tessera does by driving rclone rather than by holding anybody's
 * password itself.
 *
 * rclone here is a small script standing in for the real one, so the spawning, the reading of its
 * output, the sign-in link it prints and the several steps it asks for are all exercised as they
 * are in the app. Only the program at the end of the path is pretend.
 */
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { PROVIDERS } from '@shared/storage';
import { RcloneAuth, signInError } from '../src/main/backup/rclone';
import { tempDir } from './helpers';

const windows = process.platform === 'win32';
const drive = PROVIDERS.find((p) => p.id === 'gdrive')!;
const folder = PROVIDERS.find((p) => p.id === 'folder')!;

/**
 * A stand-in for rclone. `script` is the body of a shell script, which receives whatever arguments
 * the app passes; what it prints and the code it stops with are what the app has to make sense of.
 */
function fakeRclone(script: string): string {
  const dir = tempDir();
  const exe = join(dir, 'rclone');
  writeFileSync(exe, `#!/bin/sh\n${script}\n`);
  chmodSync(exe, 0o755);
  return exe;
}

describe.skipIf(windows)('signing in through rclone', () => {
  it('opens the link rclone printed, and answers the steps it asks for', async () => {
    // First call prints a link and a state; the second finishes.
    const exe = fakeRclone(`
      case "$*" in
        *"config create"*)
          echo 'Waiting for code... go to http://127.0.0.1:53682/auth?state=abc to authenticate'
          echo '{"State":"choose_type","Option":{"Default":"","Examples":[{"Value":"drive"}]},"Error":""}'
          ;;
        *)
          echo '{"State":"","Option":null,"Error":""}'
          ;;
      esac
      exit 0
    `);
    const opened: string[] = [];
    const auth = new RcloneAuth(() => exe, join(tempDir(), 'rclone.conf'));

    const remote = await auth.signIn(drive, (url) => opened.push(url));
    expect(remote).toMatch(/^tessera-gdrive-[0-9a-f]{6}$/);
    expect(opened[0]).toBe('http://127.0.0.1:53682/auth?state=abc');
  });

  it('makes a name of its own for each sign-in, so two never collide', async () => {
    const exe = fakeRclone(`echo '{"State":"","Option":null,"Error":""}'; exit 0`);
    const auth = new RcloneAuth(() => exe, join(tempDir(), 'rclone.conf'));
    const first = await auth.signIn(drive, () => undefined);
    const second = await auth.signIn(drive, () => undefined);
    expect(first).not.toBe(second);
  });

  it('passes a client id of your own through when one is given', async () => {
    const seen = join(tempDir(), 'args.txt');
    const exe = fakeRclone(`echo "$@" >> ${seen}; echo '{"State":"","Option":null,"Error":""}'; exit 0`);
    const auth = new RcloneAuth(() => exe, join(tempDir(), 'rclone.conf'));
    await auth.signIn(drive, () => undefined, { id: 'my-client', secret: 'my-secret' });

    const { readFileSync } = await import('node:fs');
    const args = readFileSync(seen, 'utf8');
    expect(args).toContain('client_id=my-client');
    expect(args).toContain('client_secret=my-secret');
    expect(args).toContain('--non-interactive');
  });

  it('says what rclone complained about when the sign-in fails', async () => {
    const exe = fakeRclone(`echo 'Failed to configure token: oauth2: cannot fetch token' >&2; exit 1`);
    const auth = new RcloneAuth(() => exe, join(tempDir(), 'rclone.conf'));
    await expect(auth.signIn(drive, () => undefined)).rejects.toMatchObject({ code: 'sign-in-failed' });
  });

  it('says the sign-in was stopped when it is cancelled partway', async () => {
    const exe = fakeRclone(`sleep 30`);
    const auth = new RcloneAuth(() => exe, join(tempDir(), 'rclone.conf'));
    const going = auth.signIn(drive, () => undefined);
    await new Promise((r) => setTimeout(r, 120));
    auth.cancel();
    await expect(going).rejects.toMatchObject({ code: 'sign-in-failed' });
  });

  it('copes with rclone printing something that is not the JSON it promised', async () => {
    const exe = fakeRclone(`echo 'not json at all'; exit 0`);
    const auth = new RcloneAuth(() => exe, join(tempDir(), 'rclone.conf'));
    await expect(auth.signIn(drive, () => undefined)).resolves.toMatch(/^tessera-gdrive-/);
  });
});

describe('signing in when it cannot be done', () => {
  it('refuses before rclone is there at all', async () => {
    const auth = new RcloneAuth(() => null, join(tempDir(), 'rclone.conf'));
    await expect(auth.signIn(drive, () => undefined)).rejects.toMatchObject({ code: 'no-rclone' });
  });

  it('refuses for somewhere that has no sign-in', async () => {
    const auth = new RcloneAuth(() => '/nowhere/rclone', join(tempDir(), 'rclone.conf'));
    await expect(auth.signIn(folder, () => undefined)).rejects.toMatchObject({ code: 'no-sign-in' });
  });

  it('has nothing to cancel when nothing is going on', () => {
    const auth = new RcloneAuth(() => null, join(tempDir(), 'rclone.conf'));
    auth.cancel();
    auth.cancel();
  });
});

describe('what rclone said, said plainly', () => {
  it('turns its complaints into something a person can act on', () => {
    for (const raw of [
      'Failed to configure token: oauth2: cannot fetch token: 401 Unauthorized',
      'couldn’t fetch token - maybe it has expired?',
      'config file not found',
      '',
      'something nobody has seen before',
    ]) {
      const said = signInError(raw);
      expect(said.length).toBeGreaterThan(5);
      // Never a bare stack or an empty answer: it is read by a person mid-task.
      expect(said).not.toContain('goroutine');
    }
  });
});
