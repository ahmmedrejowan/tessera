import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BackupService, type SecretStore } from '../src/main/backup/service';
import { Jobs } from '../src/main/jobs';
import { SettingsStore } from '../src/main/settings';
import { findTool } from '../src/main/tools/find';
import { tempDir } from './helpers';

const exe = findTool('kopia');

interface Lib {
  id: string;
  name: string;
  path: string;
}

function library(dir: string, id: string, name: string): Lib {
  const path = join(dir, name);
  mkdirSync(join(path, 'packs', 'Kit'), { recursive: true });
  writeFileSync(join(path, 'packs', 'Kit', 'pack.json'), JSON.stringify({ name }));
  return { id, name, path };
}

/** A backup service over a real Kopia, with passwords kept in memory and a library to switch. */
async function setup(dataDir: string) {
  const settings = new SettingsStore(dataDir);
  await settings.load();
  const kept = new Map<string, string>();
  const secrets = (id: string): SecretStore => ({
    save: async (s) => void kept.set(id, s),
    load: async () => kept.get(id) ?? null,
    clear: async () => void kept.delete(id),
  });
  let open: Lib | null = null;
  const backups = new BackupService({
    dataDir,
    settings,
    secrets,
    keychain: () => true,
    jobs: new Jobs(() => undefined),
    library: () => open,
    isLibrary: async (path) => existsSync(path),
    rclone: () => ({ exe: null, config: '' }),
    onChange: () => undefined,
  });
  const openLibrary = async (lib: Lib) => {
    open = lib;
    await backups.libraryOpened(lib);
  };
  /** The first backup starts on its own after setting up; wait for it. */
  const settled = async (id: string) => {
    for (let i = 0; i < 300; i++) {
      const e = settings.get().libraryBackups[id];
      if (e?.lastBackupAt || e?.lastError) return e;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('the first backup never finished');
  };
  return { settings, kept, backups, openLibrary, settled };
}

describe.skipIf(!exe)('backups per library', () => {
  it('keeps each library’s backups apart, and lets a second library join the first one’s place', async () => {
    const dir = tempDir();
    const { settings, kept, backups, openLibrary, settled } = await setup(join(dir, 'data'));
    const work = library(dir, 'aaaaaaaa-work', 'Work');
    const home = library(dir, 'bbbbbbbb-home', 'Home');
    const store = join(dir, 'store');

    await openLibrary(work);
    await backups.setup({ provider: 'folder', values: { path: store } }, 'correct horse', true);
    expect((await settled(work.id)).lastError).toBeNull();
    expect((await backups.status()).repoPath).toContain(store);

    // Another library has no backups of its own, and is offered the first one's place.
    await openLibrary(home);
    let status = await backups.status();
    expect(status.repoPath).toBeNull();
    expect(status.others).toEqual([{ libraryId: work.id, libraryName: 'Work', repo: expect.stringContaining(store) }]);

    await backups.join(work.id);
    expect((await settled(home.id)).lastError).toBeNull();
    status = await backups.status();
    expect(status.repoPath).toContain(store);
    expect(status.others).toEqual([]);
    expect((await backups.snapshots()).length).toBe(1);

    // Work is backed up on its schedule while Home is open.
    await backups.backupNow(work.id);
    await openLibrary(work);
    expect((await backups.snapshots()).length).toBe(2);

    // A new password reaches both libraries, and both still back up.
    await backups.changePassword('battery staple');
    expect(kept.get(home.id)).toBe('battery staple');
    await backups.backupNow(home.id);
    expect(settings.get().libraryBackups[home.id]?.lastError).toBeNull();

    // Turning off Work's backups leaves Home's alone.
    await backups.turnOff();
    expect(settings.get().libraryBackups[work.id]).toBeUndefined();
    await openLibrary(home);
    expect((await backups.snapshots()).length).toBe(2);
  }, 120_000);

  it('gives backups set up before they were per library to the library they were made for', async () => {
    const dir = tempDir();
    const dataDir = join(dir, 'data');
    const work = library(dir, 'aaaaaaaa-work', 'Work');
    const other = library(dir, 'cccccccc-other', 'Other');
    mkdirSync(join(dataDir, 'kopia'), { recursive: true });
    writeFileSync(join(dataDir, 'kopia', 'repository.config'), '{}');
    writeFileSync(join(dataDir, 'kopia-password.bin'), 'secret');
    writeFileSync(
      join(dataDir, 'settings.json'),
      JSON.stringify({ libraryPath: work.path, backupRepo: '/backups', backupIntervalHours: 6, lastBackupAt: '2026-09-01T00:00:00.000Z', lastBackupError: null }),
    );
    const { settings, backups, openLibrary } = await setup(dataDir);
    expect(settings.get().unclaimedBackup?.repo).toBe('/backups');

    // Not for another library...
    await openLibrary(other);
    expect(settings.get().libraryBackups[other.id]).toBeUndefined();
    expect((await backups.status()).repoPath).toBeNull();

    // ...but for the one that was open.
    await openLibrary(work);
    const entry = settings.get().libraryBackups[work.id];
    expect(entry).toMatchObject({ repo: '/backups', target: { provider: 'folder', values: { path: '/backups' } }, intervalHours: 6, lastBackupAt: '2026-09-01T00:00:00.000Z', libraryName: 'Work', libraryPath: work.path });
    expect(settings.get().unclaimedBackup).toBeNull();
    expect(existsSync(join(dataDir, 'libraries', work.id, 'backup', 'kopia', 'repository.config'))).toBe(true);
    expect(existsSync(join(dataDir, 'libraries', work.id, 'backup', 'password.bin'))).toBe(true);
    expect(existsSync(join(dataDir, 'kopia'))).toBe(false);

    // The old fields are gone from the file once it's written again.
    const reloaded = new SettingsStore(dataDir);
    await reloaded.load();
    expect(reloaded.get().unclaimedBackup).toBeNull();
    expect(reloaded.get().libraryBackups[work.id]?.repo).toBe('/backups');
  });
});
