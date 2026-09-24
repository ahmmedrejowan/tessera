import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BackupService, type SecretStore } from '../src/main/backup/service';
import { Jobs } from '../src/main/jobs';
import { touchLibrary } from '../src/main/libraries';
import { MARKER } from '../src/main/library/layout';
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
  writeFileSync(join(path, MARKER), JSON.stringify({ format: 1, id, name, createdAt: '2026-01-01T00:00:00.000Z' }));
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
    await touchLibrary(settings, dataDir, lib);
    backups.libraryOpened();
  };
  /** The first backup starts on its own after setting up; wait for it. */
  const settled = async (id: string) => {
    for (let i = 0; i < 300; i++) {
      const e = settings.get().libraries[id]?.backup;
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
    expect(settings.get().libraries[home.id]?.backup?.lastError).toBeNull();

    // Turning off Work's backups leaves Home's alone.
    await backups.turnOff();
    expect(settings.get().libraries[work.id]?.backup).toBeNull();
    await openLibrary(home);
    expect((await backups.snapshots()).length).toBe(2);
  }, 120_000);

  it('moves settings from before libraries kept their own to the library they were made for', async () => {
    const dir = tempDir();
    const dataDir = join(dir, 'data');
    const work = library(dir, 'aaaaaaaa-work', 'Work');
    const other = library(dir, 'cccccccc-other', 'Other');
    mkdirSync(join(dataDir, 'kopia'), { recursive: true });
    writeFileSync(join(dataDir, 'kopia', 'repository.config'), '{}');
    writeFileSync(join(dataDir, 'kopia-password.bin'), 'secret');
    writeFileSync(
      join(dataDir, 'settings.json'),
      JSON.stringify({
        libraryPath: work.path,
        recentLibraries: [work.path, other.path, join(dir, 'Gone')],
        skipInboxWhenSure: false,
        syncEnabled: true,
        syncMode: 'push',
        backupRepo: '/backups',
        backupIntervalHours: 6,
        lastBackupAt: '2026-09-01T00:00:00.000Z',
        lastBackupError: null,
      }),
    );
    const { settings, backups, openLibrary } = await setup(dataDir);
    const libs = settings.get().libraries;
    expect(libs[work.id]).toMatchObject({
      name: 'Work',
      path: work.path,
      skipInboxWhenSure: false,
      sync: { enabled: true, mode: 'push', whileClosed: true },
      backup: { repo: '/backups', target: { provider: 'folder', values: { path: '/backups' } }, intervalHours: 6, lastBackupAt: '2026-09-01T00:00:00.000Z' },
    });
    // The others keep the app's import rule, but backups and sync were the open library's.
    expect(libs[other.id]).toMatchObject({ skipInboxWhenSure: false, sync: { enabled: false }, backup: null });
    // A library that couldn't be read stays listed until it opens.
    const gone = Object.values(libs).find((r) => r.path === join(dir, 'Gone'));
    expect(gone?.id).toMatch(/^unread-/);
    expect(existsSync(join(dataDir, 'libraries', work.id, 'backup', 'kopia', 'repository.config'))).toBe(true);
    expect(existsSync(join(dataDir, 'libraries', work.id, 'backup', 'password.bin'))).toBe(true);
    expect(existsSync(join(dataDir, 'kopia'))).toBe(false);

    await openLibrary(other);
    expect((await backups.status()).repoPath).toBeNull();
    await openLibrary(work);
    expect((await backups.status()).repoPath).toBe('/backups');

    // Written in the new form: loading again moves nothing.
    const reloaded = new SettingsStore(dataDir);
    await reloaded.load();
    expect(Object.keys(reloaded.get().libraries).sort()).toEqual(Object.keys(settings.get().libraries).sort());
    expect(JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8')).recentLibraries).toBeUndefined();

    // When the unread library shows up, it takes its real id.
    const back = library(dir, 'dddddddd-gone', 'Gone');
    await openLibrary(back);
    expect(settings.get().libraries[back.id]?.path).toBe(back.path);
    expect(Object.values(settings.get().libraries).some((r) => r.id.startsWith('unread-'))).toBe(false);
  });
});

describe.skipIf(!exe)('what a backup service says and does', () => {
  it('backs up now, lists what it kept, and puts a file back', async () => {
    const dir = tempDir();
    const { backups, openLibrary, settled } = await setup(join(dir, 'data'));
    const work = library(dir, 'aaaaaaaa-work', 'Work');
    await openLibrary(work);
    await backups.setup({ provider: 'folder', values: { path: join(dir, 'store') } }, 'correct horse battery', true);
    expect((await settled(work.id)).lastError).toBeNull();

    // Something changes, and a second backup keeps both.
    writeFileSync(join(work.path, 'packs', 'Kit', 'new-file.txt'), 'added later');
    await backups.backupNow();
    const snapshots = await backups.snapshots();
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    expect(snapshots[0]!.startTime).toBeTruthy();
    expect(snapshots[0]!.size).toBeGreaterThan(0);

    // The oldest copy does not have the later file, which is the point of keeping more than one.
    const into = join(dir, 'restored');
    const steps: (number | null)[] = [];
    await backups.restore(snapshots[snapshots.length - 1]!.id, into, snapshots[0]!.size, 'Work again', (f) => steps.push(f), async () => []);
    expect(existsSync(join(into, 'packs', 'Kit', 'pack.json'))).toBe(true);
    expect(existsSync(join(into, 'packs', 'Kit', 'new-file.txt'))).toBe(false);
    expect(steps.length).toBeGreaterThan(0);

    // A restore never writes over the library it came from.
    await expect(backups.restore(snapshots[0]!.id, work.path, snapshots[0]!.size, 'Nope', () => undefined, async () => [])).rejects.toMatchObject({ code: 'restore-into-library' });
  });

  it('keeps the password, hands it back, and changes it', async () => {
    const dir = tempDir();
    const { backups, openLibrary, settled } = await setup(join(dir, 'data'));
    const work = library(dir, 'aaaaaaaa-work', 'Work');
    await openLibrary(work);
    await backups.setup({ provider: 'folder', values: { path: join(dir, 'store') } }, 'correct horse battery', true);
    await settled(work.id);

    expect(await backups.password()).toBe('correct horse battery');
    await backups.changePassword('a different long password');
    expect(await backups.password()).toBe('a different long password');

    // The store still opens with the new one.
    await backups.backupNow();
    expect((await backups.snapshots()).length).toBeGreaterThan(0);
  });

  it('says where the backups go, and how often', async () => {
    const dir = tempDir();
    const { backups, settings, openLibrary, settled } = await setup(join(dir, 'data'));
    const work = library(dir, 'aaaaaaaa-work', 'Work');
    await openLibrary(work);
    await backups.setup({ provider: 'folder', values: { path: join(dir, 'store') } }, 'correct horse battery', true);
    await settled(work.id);

    expect(backups.target()).toMatchObject({ provider: 'folder' });
    await backups.setInterval(6);
    expect(settings.get().libraries[work.id]?.backup?.intervalHours).toBe(6);
  });

  it('turns off, and forgets where they went', async () => {
    const dir = tempDir();
    const { backups, settings, openLibrary, settled } = await setup(join(dir, 'data'));
    const work = library(dir, 'aaaaaaaa-work', 'Work');
    await openLibrary(work);
    await backups.setup({ provider: 'folder', values: { path: join(dir, 'store') } }, 'correct horse battery', true);
    await settled(work.id);

    await backups.turnOff();
    expect(settings.get().libraries[work.id]?.backup).toBeNull();
    expect((await backups.status()).repoPath).toBeNull();
    // The copies themselves are left alone: turning backups off is not deleting them.
    expect(existsSync(join(dir, 'store'))).toBe(true);
  });

  it('refuses the wrong password rather than making a second store', async () => {
    const dir = tempDir();
    const { backups, openLibrary, settled } = await setup(join(dir, 'data'));
    const work = library(dir, 'aaaaaaaa-work', 'Work');
    await openLibrary(work);
    const store = join(dir, 'store');
    await backups.setup({ provider: 'folder', values: { path: store } }, 'correct horse battery', true);
    await settled(work.id);

    const home = library(dir, 'bbbbbbbb-home', 'Home');
    await openLibrary(home);
    await expect(backups.setup({ provider: 'folder', values: { path: store } }, 'the wrong password', false)).rejects.toThrow();
  });

  it('says nothing is set up when nothing is', async () => {
    const dir = tempDir();
    const { backups, openLibrary } = await setup(join(dir, 'data'));
    await openLibrary(library(dir, 'aaaaaaaa-work', 'Work'));
    const status = await backups.status();
    expect(status.repoPath).toBeNull();
    expect(status.target).toBeNull();
    expect(status.lastBackupAt).toBeNull();
    // Nothing to back up to, and nothing kept: both say so rather than pretending.
    await expect(backups.backupNow()).rejects.toThrow();
    await expect(backups.snapshots()).rejects.toThrow();
  });
});
