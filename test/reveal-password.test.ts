/**
 * Showing the backup password on a Mac.
 *
 * The password is the one thing that cannot be replaced: without it the backups are unreadable,
 * and with it anyone can read them. So on a Mac that can ask for a fingerprint, it asks first, and
 * a refusal means the password stays hidden.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import type { Wire } from '@shared/ipc';
import { asked, forget, handlers } from './fake-electron';
import { registerSafetyIpc } from '../src/main/ipc/safety';

const told: string[] = [];
const stub = <T>(shape: unknown): T => shape as T;

registerSafetyIpc({
  activity: stub({ add: (...what: string[]) => void told.push(what.join(' ')) }),
  backupChanged: () => undefined,
  backups: stub({ password: async () => 'a very long password' }),
  dataDir: '/tmp/tessera-reveal',
  jobs: stub({ run: (_what: string, fn: (job: unknown) => unknown) => fn({ update: () => undefined }) }),
  librariesChanged: () => undefined,
  library: stub({ getState: () => ({ status: 'none' }) }),
  libraryId: () => null,
  platform: 'darwin',
  rcloneAuth: stub({}),
  restorer: stub({}),
  settings: stub({ get: () => ({ libraries: {} }) }),
  sync: stub({}),
  syncChanged: () => undefined,
  windows: () => [],
} as unknown as Parameters<typeof registerSafetyIpc>[0]);

const reveal = () => handlers.get('backup:revealPassword')!() as Promise<Wire<string>>;

describe('showing the backup password on a Mac', () => {
  it('shows it once the fingerprint is given', async () => {
    forget();
    asked.touchId = 'agreed';
    await expect(reveal()).resolves.toEqual({ ok: true, value: 'a very long password' });
  });

  it('keeps it hidden when the fingerprint is refused', async () => {
    forget();
    asked.touchId = 'refused';
    const answer = await reveal();
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.error.code).toBe('not-confirmed');
  });

  it('shows it where the Mac cannot ask at all', async () => {
    forget();
    asked.touchId = 'none';
    await expect(reveal()).resolves.toEqual({ ok: true, value: 'a very long password' });
  });
});
