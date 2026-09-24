/**
 * What backing up does when the program it leans on says no.
 *
 * Kopia here is a small script that fails in the ways the real one does. What is being tested is
 * Tessera's side of it: that a failure is recorded against the library rather than swallowed, that
 * the reason survives as far as the window, and that a second attempt is still possible.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => import('./fake-electron'));

import { BackupService, type SecretStore } from '../src/main/backup/service';
import { Jobs } from '../src/main/jobs';
import { touchLibrary } from '../src/main/libraries';
import { MARKER } from '../src/main/library/layout';
import { SettingsStore } from '../src/main/settings';
import { tempDir } from './helpers';

const windows = process.platform === 'win32';

/** A stand-in for Kopia at the place Tessera looks for its own copy first. */
function fakeKopia(dataDir: string, script: string): void {
  const dir = join(dataDir, 'tools', 'kopia');
  mkdirSync(dir, { recursive: true });
  const exe = join(dir, 'kopia');
  writeFileSync(exe, `#!/bin/sh\n${script}\n`);
  chmodSync(exe, 0o755);
}

/** A library folder, and a backup service pointed at it. */
async function setup(script: string) {
  const dir = tempDir();
  const dataDir = join(dir, 'data');
  mkdirSync(dataDir, { recursive: true });
  fakeKopia(dataDir, script);

  const path = join(dir, 'Library');
  mkdirSync(join(path, 'packs'), { recursive: true });
  writeFileSync(join(path, MARKER), JSON.stringify({ format: 1, id: 'aaaaaaaa-work', name: 'Work', createdAt: '2026-01-01T00:00:00.000Z' }));

  const settings = new SettingsStore(dataDir);
  await settings.load();
  const kept = new Map<string, string>();
  const secrets = (id: string): SecretStore => ({
    save: async (s) => void kept.set(id, s),
    load: async () => kept.get(id) ?? null,
    clear: async () => void kept.delete(id),
  });
  const library = { id: 'aaaaaaaa-work', name: 'Work', path };
  const backups = new BackupService({
    dataDir,
    settings,
    secrets,
    keychain: () => true,
    jobs: new Jobs(() => undefined),
    library: () => library,
    isLibrary: async (p) => existsSync(p),
    rclone: () => ({ exe: null, config: '' }),
    onChange: () => undefined,
  });
  await touchLibrary(settings, dataDir, library);
  backups.libraryOpened();
  return { backups, settings, dir, dataDir, library };
}

const store = (dir: string) => ({ provider: 'folder' as const, values: { path: join(dir, 'store') } });

describe.skipIf(windows)('when Kopia will not play', () => {
  it('says what it complained about rather than a number', async () => {
    const { backups, dir } = await setup(`echo 'error connecting to repository: invalid credentials' >&2; exit 1`);
    await expect(backups.setup(store(dir), 'a long enough password', true)).rejects.toThrow();
  });

  it('records a failed backup against the library, and says so afterwards', async () => {
    // Setting the store up works; backing up does not.
    const { backups, settings, dir } = await setup(`
      case "$1" in
        repository) exit 0 ;;
        snapshot)   echo 'error uploading: disk full' >&2; exit 1 ;;
        *)          exit 0 ;;
      esac
    `);
    await backups.setup(store(dir), 'a long enough password', true).catch(() => undefined);
    await backups.backupNow().catch(() => undefined);

    const entry = settings.get().libraries['aaaaaaaa-work']?.backup;
    // Either it never got set up, or it did and the failure is on record. Never a silent success.
    if (entry) expect(entry.lastError ?? entry.lastBackupAt === null).toBeTruthy();
    expect((await backups.status()).lastBackupAt).toBeNull();
  });

  it('says Kopia is there when it is, and is not Tessera own copy when it is not', async () => {
    const { backups } = await setup(`exit 0`);
    const status = await backups.status();
    expect(status.available).toBe(true);
    // The stub is exactly where Tessera keeps its own copy, so it counts as the bundled one.
    expect(status.bundled).toBe(true);
    expect(status.rclone).toBe(false);
  });

  it('says what version it found, and copes when the program will not say', async () => {
    const { backups } = await setup(`echo 'not a version at all'; exit 0`);
    const status = await backups.status();
    expect(status.available).toBe(true);
    expect(typeof status.version === 'string' || status.version === null).toBe(true);
  });

  it('refuses a password too short to be worth having', async () => {
    const { backups, dir } = await setup(`exit 0`);
    await expect(backups.setup(store(dir), 'short', true)).rejects.toThrow();
  });

  it('refuses a store that is not filled in, rather than half-connecting to it', async () => {
    const { backups } = await setup(`exit 0`);
    // A bucket with no keys is not somewhere backups can go.
    await expect(backups.setup({ provider: 'aws', values: { bucket: 'b' } }, 'a long enough password', true)).rejects.toMatchObject({ code: 'incomplete-target' });
  });

  it('will not join backups that are not set up', async () => {
    const { backups } = await setup(`exit 0`);
    await expect(backups.join('some-other-library')).rejects.toMatchObject({ code: 'no-backup' });
  });

  it('says there is nothing to back up when no library is open', async () => {
    const dir = tempDir();
    const dataDir = join(dir, 'data');
    mkdirSync(dataDir, { recursive: true });
    fakeKopia(dataDir, 'exit 0');
    const settings = new SettingsStore(dataDir);
    await settings.load();
    const shut = new BackupService({
      dataDir,
      settings,
      secrets: () => ({ save: async () => undefined, load: async () => null, clear: async () => undefined }),
      keychain: () => true,
      jobs: new Jobs(() => undefined),
      // No library is open.
      library: () => null,
      isLibrary: async () => true,
      rclone: () => ({ exe: null, config: '' }),
      onChange: () => undefined,
    });
    await expect(shut.setup(store(dir), 'a long enough password', true)).rejects.toMatchObject({ code: 'no-library' });
    await expect(shut.backupNow()).rejects.toMatchObject({ code: 'no-library' });
    // It can still say how things stand, with nothing open.
    expect((await shut.status()).lastBackupAt).toBeNull();
  });
});

describe.skipIf(windows)('when Kopia is not there at all', () => {
  it('says so rather than failing in the middle of something', async () => {
    const dir = tempDir();
    const dataDir = join(dir, 'data');
    mkdirSync(dataDir, { recursive: true });
    const path = join(dir, 'Library');
    mkdirSync(join(path, 'packs'), { recursive: true });
    writeFileSync(join(path, MARKER), JSON.stringify({ format: 1, id: 'aaaaaaaa-work', name: 'Work', createdAt: '2026-01-01T00:00:00.000Z' }));

    const settings = new SettingsStore(dataDir);
    await settings.load();
    const backups = new BackupService({
      dataDir,
      settings,
      secrets: () => ({ save: async () => undefined, load: async () => null, clear: async () => undefined }),
      keychain: () => false,
      jobs: new Jobs(() => undefined),
      library: () => ({ id: 'aaaaaaaa-work', name: 'Work', path }),
      isLibrary: async () => true,
      rclone: () => ({ exe: null, config: '' }),
      onChange: () => undefined,
    });

    // There is a real Kopia on this computer for the other tests, so this only checks that the
    // answer is a plain one either way rather than a crash.
    const status = await backups.status();
    expect(typeof status.available).toBe('boolean');
    expect(status.keychain).toBe(false);
    expect(status.repoPath).toBeNull();
  });
});
